import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { checkFence } from "@/lib/business";
import { createMessage, closeTodos } from "@/lib/notify";
import { writeOperationLog } from "@/lib/logger";

interface CheckinBody {
  lat?: number;
  lng?: number;
  accuracy?: number | null;
  clientLocatedAt?: string;
  // 开发环境模拟定位：仅在非 PROD 允许，且明确标记
  mock?: boolean;
}

// 学生提交定位销假：后端重新校验围栏，不信前端结论
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "student") {
    return NextResponse.json({ error: "仅学生可提交销假打卡" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json()) as CheckinBody;

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "定位坐标无效，请检查定位权限" }, { status: 400 });
  }
  if (body.mock && process.env.COZE_PROJECT_ENV === "PROD") {
    return NextResponse.json({ error: "模拟定位仅开发环境可用" }, { status: 403 });
  }

  const db = await getClient();
  const { data: leave } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (!leave) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  const lv = leave as {
    student_id: string;
    status: string;
    checkin_status: string;
    request_no: string;
  };
  if (lv.student_id !== user.id) {
    return NextResponse.json({ error: "只能为本人申请销假" }, { status: 403 });
  }
  if (lv.status !== "approved") {
    return NextResponse.json({ error: "仅已批准的申请可以销假" }, { status: 400 });
  }
  if (lv.checkin_status === "done") {
    return NextResponse.json({ error: "该申请已完成销假" }, { status: 400 });
  }
  if (lv.checkin_status === "pending") {
    return NextResponse.json(
      { error: "已有销假申请待中队长确认，请勿重复提交" },
      { status: 409 }
    );
  }

  // 学生所属校区
  const { data: student } = await db
    .from("users")
    .select("campus_id,class_id")
    .eq("id", user.id)
    .maybeSingle();
  const campusId =
    (student as { campus_id: string | null } | null)?.campus_id ?? null;
  if (!campusId) {
    return NextResponse.json(
      { error: "未配置所属校区，无法围栏核验，请联系管理员" },
      { status: 422 }
    );
  }
  const { data: campus } = await db.from("campuses").select("*").eq("id", campusId).maybeSingle();
  if (!campus) {
    return NextResponse.json({ error: "校区围栏未配置" }, { status: 422 });
  }
  const c = campus as {
    center_lat: number | null;
    center_lng: number | null;
    radius_meters: number | null;
    polygon: Array<{ lat: number; lng: number }> | null;
    boundary_tolerance_meters: number | null;
    min_accuracy_meters: number | null;
    name: string;
  };

  // 精度校验
  const minAccuracy = c.min_accuracy_meters ?? 100;
  if (
    body.accuracy != null &&
    Number.isFinite(Number(body.accuracy)) &&
    Number(body.accuracy) > minAccuracy &&
    !body.mock
  ) {
    return NextResponse.json(
      {
        error: `定位精度不足（误差约 ${Math.round(Number(body.accuracy))} 米），请到开阔处重试；如确有困难可申请人工核验`,
        code: "LOW_ACCURACY",
      },
      { status: 422 }
    );
  }

  // 后端围栏核验（唯一权威结论）
  const fence = checkFence(lat, lng, {
    centerLat: c.center_lat,
    centerLng: c.center_lng,
    radiusMeters: c.radius_meters,
    polygon: c.polygon,
    boundaryToleranceMeters: c.boundary_tolerance_meters,
  });
  if (!fence.inFence) {
    return NextResponse.json(
      {
        error: `定位不在「${c.name}」电子围栏内${fence.distanceMeters != null ? `（距围栏约 ${fence.distanceMeters} 米）` : ""}，请到校区后重试或申请人工核验`,
        code: "OUT_OF_FENCE",
        distanceMeters: fence.distanceMeters,
      },
      { status: 422 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data: checkin, error } = await db
    .from("checkins")
    .insert({
      leave_request_id: id,
      student_id: user.id,
      lat,
      lng,
      accuracy: body.accuracy ?? null,
      client_located_at: body.clientLocatedAt ? new Date(body.clientLocatedAt).toISOString() : nowIso,
      server_received_at: nowIso, // 业务时间以服务器为准
      in_fence: true,
      method: body.mock ? "manual" : "gps",
      campus_id: campusId,
      campus_name: c.name,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "销假提交失败" }, { status: 500 });

  // 更新申请销假状态（待确认，绝不提前标记已销假）；none / rejected 均可重新提交
  const { error: upErr } = await db
    .from("leave_requests")
    .update({
      checkin_status: "pending",
      checkin_lat: lat,
      checkin_lng: lng,
      checkin_accuracy: body.accuracy ?? null,
      checkin_at: nowIso,
      checkin_in_fence: true,
      checkin_method: body.mock ? "manual" : "gps",
      checkin_campus_id: campusId,
      checkin_remark: body.mock ? "开发环境模拟定位" : null,
      is_overdue: false,
    })
    .eq("id", id)
    .in("checkin_status", ["none", "rejected"]);
  if (upErr) return NextResponse.json({ error: "销假状态更新失败" }, { status: 500 });

  // 待办分配给负责中队长
  const classId = (student as { class_id: string | null }).class_id;
  let leaderId: string | null = null;
  if (classId) {
    const { data: cls } = await db.from("classes").select("leader_id").eq("id", classId).maybeSingle();
    leaderId = (cls as { leader_id: string | null } | null)?.leader_id ?? null;
  }
  if (leaderId) {
    await createMessage({
      userId: leaderId,
      type: "checkin_todo",
      title: `销假打卡待确认：${user.name}（${lv.request_no}）`,
      content: `校区：${c.name}；定位精度：${body.accuracy != null ? Math.round(Number(body.accuracy)) + "米" : "未知"}`,
      leaveRequestId: id,
      isTodo: true,
    });
  }

  await writeOperationLog({
    operator: user,
    action: body.mock ? "mock_checkin" : "submit_checkin",
    targetType: "leave",
    targetId: id,
    detail: { lat, lng, accuracy: body.accuracy ?? null, campus: c.name, checkinId: (checkin as { id: string }).id },
    request,
  });

  return NextResponse.json({
    success: true,
    data: { checkinId: (checkin as { id: string }).id, inFence: true, campus: c.name },
  });
}

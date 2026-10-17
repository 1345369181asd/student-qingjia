import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { closeTodos, createMessage } from "@/lib/notify";
import { writeOperationLog } from "@/lib/logger";
import { releaseActiveLeave } from "@/lib/business";

// 中队长确认/驳回归校销假（驳回必填理由）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "teacher") {
    return NextResponse.json({ error: "仅中队长可确认销假" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json()) as {
    action?: "approved" | "rejected";
    comment?: string;
  };
  if (body.action !== "approved" && body.action !== "rejected") {
    return NextResponse.json({ error: "操作不合法" }, { status: 400 });
  }
  if (body.action === "rejected" && !body.comment?.trim()) {
    return NextResponse.json({ error: "驳回必须填写理由" }, { status: 400 });
  }

  const db = await getClient();
  const { data: leave } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (!leave) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  const lv = leave as {
    id: string;
    student_id: string;
    status: string;
    checkin_status: string;
    request_no: string;
  };
  if (lv.status !== "approved") {
    return NextResponse.json({ error: "申请未批准，无法销假审核" }, { status: 400 });
  }
  if (lv.checkin_status !== "pending") {
    return NextResponse.json({ error: "当前没有待确认的销假申请" }, { status: 400 });
  }

  // 管理范围校验
  const { data: student } = await db
    .from("users")
    .select("class_id")
    .eq("id", lv.student_id)
    .maybeSingle();
  const classId = (student as { class_id: string | null } | null)?.class_id;
  if (!classId) return NextResponse.json({ error: "学生班级缺失" }, { status: 422 });
  const { data: cls } = await db
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("leader_id", user.id)
    .maybeSingle();
  if (!cls) return NextResponse.json({ error: "不在您的管理范围内" }, { status: 403 });

  // 取最新一条待确认打卡
  const { data: pendingCheckin } = await db
    .from("checkins")
    .select("id")
    .eq("leave_request_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pendingCheckin) {
    return NextResponse.json({ error: "未找到待确认打卡记录" }, { status: 404 });
  }
  const checkinId = (pendingCheckin as { id: string }).id;

  if (body.action === "approved") {
    const nowIso = new Date().toISOString();
    await db
      .from("checkins")
      .update({
        status: "approved",
        reviewer_id: user.id,
        reviewer_name: user.name,
        review_comment: body.comment?.trim() || null,
        reviewed_at: nowIso,
      })
      .eq("id", checkinId);
    await db
      .from("leave_requests")
      .update({
        checkin_status: "done",
        return_confirmed_at: nowIso,
        return_confirmer_id: user.id,
        is_overdue: false,
      })
      .eq("id", id);
    await closeTodos(id);
    await releaseActiveLeave(db, lv.student_id, id);
    await createMessage({
      userId: lv.student_id,
      type: "checkin_result",
      title: `销假已确认：${lv.request_no}`,
      content: "中队长已确认您返校销假",
      leaveRequestId: id,
    });
    await writeOperationLog({
      operator: user,
      action: "confirm_checkin",
      targetType: "leave",
      targetId: id,
      detail: { checkinId },
      request,
    });
  } else {
    await db
      .from("checkins")
      .update({
        status: "rejected",
        reviewer_id: user.id,
        reviewer_name: user.name,
        review_comment: body.comment?.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", checkinId);
    await db.from("leave_requests").update({ checkin_status: "rejected" }).eq("id", id);
    await closeTodos(id);
    await createMessage({
      userId: lv.student_id,
      type: "checkin_result",
      title: `销假申请被驳回：${lv.request_no}`,
      content: body.comment?.trim(),
      leaveRequestId: id,
    });
    await writeOperationLog({
      operator: user,
      action: "reject_checkin",
      targetType: "leave",
      targetId: id,
      detail: { checkinId, comment: body.comment },
      request,
    });
  }

  return NextResponse.json({ success: true });
}

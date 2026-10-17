import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { closeTodos, createMessage } from "@/lib/notify";
import { writeOperationLog } from "@/lib/logger";
import { releaseActiveLeave } from "@/lib/business";

// 管理员人工核验销假（特殊情况：校内定位失败但确已返校）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可人工核验" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json()) as { comment?: string };

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
    return NextResponse.json({ error: "申请未批准，无法销假" }, { status: 400 });
  }
  if (lv.checkin_status === "done") {
    return NextResponse.json({ error: "该申请已完成销假" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data: inserted } = await db
    .from("checkins")
    .insert({
      leave_request_id: id,
      student_id: lv.student_id,
      status: "approved",
      reviewer_id: user.id,
      reviewer_name: user.name,
      review_comment: `人工核验：${body.comment?.trim() || "确已返校"}`,
      reviewed_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  await db
    .from("leave_requests")
    .update({
      checkin_status: "done",
      checkin_method: "manual",
      checkin_in_fence: false,
      checkin_remark: `管理员人工核验：${body.comment?.trim() || "确已返校"}`,
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
    title: `销假已通过人工核验：${lv.request_no}`,
    content: "管理员已人工核验您的返校情况",
    leaveRequestId: id,
  });
  await writeOperationLog({
    operator: user,
    action: "manual_verify_checkin",
    targetType: "leave",
    targetId: id,
    detail: { checkinId: (inserted as { id: string } | null)?.id, comment: body.comment },
    request,
  });

  return NextResponse.json({ success: true });
}

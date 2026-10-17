import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { closeAllTodos, createMessage } from "@/lib/notify";
import { writeOperationLog } from "@/lib/logger";
import { releaseActiveLeave } from "@/lib/business";

// 管理员撤销：可撤销审批中/已通过的申请，关闭相关待办并通知学生
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可撤销" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim();

  const db = await getClient();
  const { data: leave } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (!leave) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  const lv = leave as {
    student_id: string;
    status: string;
    request_no: string | null;
    student_name_snapshot: string | null;
  };

  if (["revoked", "rejected"].includes(lv.status)) {
    return NextResponse.json({ error: "该申请已结束，无需撤销" }, { status: 400 });
  }

  const { error } = await db
    .from("leave_requests")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "撤销失败" }, { status: 500 });

  await closeAllTodos(id);
  await releaseActiveLeave(db, lv.student_id, id);
  await createMessage({
    userId: lv.student_id,
    type: "revoked",
    title: `请假申请已被管理员撤销：${lv.request_no ?? ""}`,
    content: reason ? `撤销原因：${reason}` : "请联系管理员了解详情",
    leaveRequestId: id,
  });
  await writeOperationLog({
    operator: user,
    action: "admin_revoke_leave",
    targetType: "leave",
    targetId: id,
    detail: { requestNo: lv.request_no, reason: reason ?? null },
    request,
  });

  return NextResponse.json({ success: true });
}

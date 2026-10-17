import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { closeAllTodos, createMessage } from "@/lib/notify";
import { writeOperationLog } from "@/lib/logger";
import { releaseActiveLeave } from "@/lib/business";

// 详情：本人、负责班级中队长、管理员可见
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  const db = await getClient();

  const { data: leave } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (!leave) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  const lv = leave as Record<string, unknown>;

  if (user.role === "student" && lv.student_id !== user.id) {
    return NextResponse.json({ error: "无权查看" }, { status: 403 });
  }
  if (user.role === "teacher") {
    const { data: cls } = await db
      .from("classes")
      .select("id")
      .eq("leader_id", user.id)
      .eq("is_active", true);
    const classIds = new Set((cls ?? []).map((c) => c.id as string));
    const { data: stu } = await db.from("users").select("class_id").eq("id", lv.student_id).maybeSingle();
    const studentClassId = (stu as { class_id: string | null } | null)?.class_id;
    if (!studentClassId || !classIds.has(studentClassId)) {
      return NextResponse.json({ error: "无权查看" }, { status: 403 });
    }
  }

  const [{ data: approvals }, { data: files }, { data: checkinRows }, { data: student }] =
    await Promise.all([
      db.from("approval_records").select("*").eq("leave_request_id", id).order("node_order"),
      db
        .from("attachments")
        .select("id,file_name,content_type,file_size,created_at,leave_request_id")
        .eq("leave_request_id", id),
      db.from("checkins").select("*").eq("leave_request_id", id).order("created_at"),
      db
        .from("users")
        .select("id,name,username,student_no,class_id,phone")
        .eq("id", lv.student_id)
        .maybeSingle(),
    ]);

  let className: string | null = lv.class_name_snapshot as string | null;
  if ((student as { class_id: string | null } | null)?.class_id) {
    const { data: c } = await db
      .from("classes")
      .select("name")
      .eq("id", (student as { class_id: string }).class_id)
      .maybeSingle();
    className = (c as { name: string } | null)?.name ?? className;
  }

  return NextResponse.json({
    data: {
      ...lv,
      approvals,
      files,
      checkin_records: checkinRows,
      student: student ? { ...(student as object), classes: { name: className } } : null,
    },
  });
}

// 撤销：仅“尚无人完成审批”的待审申请（pending 且无 approval_records）可由学生撤销
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "student") {
    return NextResponse.json({ error: "仅学生可以撤销本人申请" }, { status: 403 });
  }
  const { id } = await params;
  const db = await getClient();

  const { data: leave } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (!leave) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  const lv = leave as { student_id: string; status: string };

  if (lv.student_id !== user.id) {
    return NextResponse.json({ error: "只能撤销本人申请" }, { status: 403 });
  }
  if (lv.status !== "pending") {
    return NextResponse.json(
      { error: "已有审批节点完成或申请已结束，不能撤销" },
      { status: 400 }
    );
  }
  const { count } = await db
    .from("approval_records")
    .select("id", { count: "exact", head: true })
    .eq("leave_request_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "已有审批人处理，不能撤销" }, { status: 400 });
  }

  const { error } = await db
    .from("leave_requests")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "撤销失败" }, { status: 500 });

  await closeAllTodos(id);
  await releaseActiveLeave(db, lv.student_id, id);
  await createMessage({
    userId: user.id,
    type: "revoked",
    title: "请假申请已撤销",
    leaveRequestId: id,
  });
  await writeOperationLog({
    operator: user,
    action: "revoke_leave",
    targetType: "leave",
    targetId: id,
    request,
  });

  return NextResponse.json({ success: true });
}

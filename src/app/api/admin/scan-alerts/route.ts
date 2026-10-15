import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createMessage } from "@/lib/notify";

interface PendingLeaveRow {
  id: string;
  student_id: string;
  request_no: string;
  student_name_snapshot: string | null;
  status: string;
  start_time: string;
  end_time: string;
  current_node_order: number;
  is_overdue: boolean;
  created_at: string;
}

interface RuleRow {
  approve_timeout_hours: number;
  checkin_grace_minutes: number;
}

// 超时/逾期扫描（管理员手动触发；统计页提供按钮）
export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可触发扫描" }, { status: 403 });
  }

  const db = await getClient();
  const { data: ruleRow } = await db
    .from("alert_rules")
    .select("*")
    .eq("enabled", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rule = (ruleRow ?? null) as RuleRow | null;
  const timeoutHours = rule?.approve_timeout_hours ?? 24;
  const graceMinutes = rule?.checkin_grace_minutes ?? 30;
  const now = new Date();

  let overdueCount = 0;
  let timeoutCount = 0;

  // 1) 逾期未销假：已批准、未完成销假、超过应返校时间 + 宽限期
  const { data: approvedLeaves } = await db
    .from("leave_requests")
    .select("*")
    .eq("status", "approved")
    .neq("checkin_status", "done");

  for (const lv of approvedLeaves ?? []) {
    const leave = lv as PendingLeaveRow;
    const deadline = new Date(new Date(leave.end_time).getTime() + graceMinutes * 60 * 1000);
    if (now <= deadline) continue;

    if (!leave.is_overdue) {
      await db.from("leave_requests").update({ is_overdue: true }).eq("id", leave.id);
    }

    const { data: existing } = await db
      .from("alert_records")
      .select("id")
      .eq("alert_type", "overdue_no_checkin")
      .eq("leave_request_id", leave.id)
      .maybeSingle();
    if (existing) continue;

    const { data: student } = await db
      .from("users")
      .select("name, class_id")
      .eq("id", leave.student_id)
      .maybeSingle();
    const stu = student as { name: string; class_id: string | null } | null;

    let leaderId: string | null = null;
    if (stu?.class_id) {
      const { data: cls } = await db.from("classes").select("leader_id").eq("id", stu.class_id).maybeSingle();
      leaderId = (cls as { leader_id: string | null } | null)?.leader_id ?? null;
    }

    const recipients = new Set<string>();
    const { data: admins } = await db.from("users").select("id").eq("role", "admin").eq("is_active", true);
    for (const a of admins ?? []) recipients.add((a as { id: string }).id);
    if (leaderId) recipients.add(leaderId);

    for (const userId of recipients) {
      await createMessage({
        userId,
        type: "overdue_checkin",
        title: `逾期未销假：${leave.request_no}`,
        content: `学生 ${stu?.name ?? leave.student_name_snapshot ?? ""} 已超过应返校时间仍未完成销假`,
        leaveRequestId: leave.id,
      });
    }
    await db.from("alert_records").insert({
      alert_type: "overdue_no_checkin",
      leave_request_id: leave.id,
      content: "逾期未销假",
    });
    overdueCount += 1;
  }

  // 2) 审批超时：请假单仍处于 pending 且创建超过阈值
  const { data: pendingLeaves } = await db.from("leave_requests").select("*").eq("status", "pending");
  for (const lv of pendingLeaves ?? []) {
    const leave = lv as PendingLeaveRow;
    const created = new Date(leave.created_at);
    if (now.getTime() - created.getTime() < timeoutHours * 3600 * 1000) continue;

    const { data: existing } = await db
      .from("alert_records")
      .select("id")
      .eq("alert_type", "approve_timeout")
      .eq("leave_request_id", leave.id)
      .maybeSingle();
    if (existing) continue;

    // 找到该节点的待办消息接收人
    const { data: todos } = await db
      .from("messages")
      .select("user_id")
      .eq("leave_request_id", leave.id)
      .eq("type", "approval_todo")
      .eq("todo_done", false);

    for (const t of todos ?? []) {
      const recipient = (t as { user_id: string }).user_id;
      await createMessage({
        userId: recipient,
        type: "approve_timeout",
        title: `审批超时提醒：${leave.request_no}`,
        content: `该请假申请等待审批已超过 ${timeoutHours} 小时`,
        leaveRequestId: leave.id,
      });
    }
    await db.from("alert_records").insert({
      alert_type: "approve_timeout",
      leave_request_id: leave.id,
      content: `审批超时（${timeoutHours}h）`,
    });
    timeoutCount += 1;
  }

  return NextResponse.json({ success: true, overdueCount, timeoutCount });
}

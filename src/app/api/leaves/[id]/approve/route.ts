import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isEligibleApprover, resolveApproverIds } from "@/lib/scope";
import { closeAllTodos, closeTodos, createMessage } from "@/lib/notify";
import { writeOperationLog } from "@/lib/logger";
import { releaseActiveLeave } from "@/lib/business";

interface FlowNode {
  order: number;
  name: string;
  role: string;
  assigneeId?: string | null;
}

// 单条审批：通过 / 驳回（驳回意见必填）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  const body = (await request.json()) as { action?: "approved" | "rejected"; comment?: string };

  if (body.action !== "approved" && body.action !== "rejected") {
    return NextResponse.json({ error: "审批操作不合法" }, { status: 400 });
  }
  if (body.action === "rejected" && !body.comment?.trim()) {
    return NextResponse.json({ error: "驳回必须填写意见" }, { status: 400 });
  }

  const db = await getClient();
  const { data: leave } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (!leave) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  const lv = leave as {
    id: string;
    student_id: string;
    status: string;
    current_node_order: number;
    flow_snapshot: {
      flowId: string;
      version: number;
      nodes: FlowNode[];
    } | null;
    request_no: string;
  };

  if (!["pending", "approving"].includes(lv.status)) {
    return NextResponse.json({ error: "该申请已结束，不能重复审批" }, { status: 400 });
  }
  const nodes = lv.flow_snapshot?.nodes ?? [];
  const currentNode = nodes.find((n) => n.order === lv.current_node_order);
  if (!currentNode) {
    return NextResponse.json({ error: "审批节点配置异常" }, { status: 422 });
  }

  // 解析学生当前归属（调班后按新关系；历史快照不影响当前待办权限）
  const { data: stu } = await db
    .from("users")
    .select("class_id, department_id")
    .eq("id", lv.student_id)
    .maybeSingle();
  const studentRef = {
    class_id: (stu as { class_id: string | null } | null)?.class_id ?? null,
    department_id: (stu as { department_id: string | null } | null)?.department_id ?? null,
  };

  const allowed =
    (currentNode.assigneeId && currentNode.assigneeId === user.id) ||
    (!currentNode.assigneeId &&
      (await isEligibleApprover(db, currentNode.role, user.id, user.roles, studentRef)));
  if (!allowed) {
    return NextResponse.json({ error: "您不是当前节点的审批人或不在管理范围内" }, { status: 403 });
  }
  // 禁止自审：提交人不能审批自己的申请
  if (lv.student_id === user.id) {
    return NextResponse.json({ error: "不能审批自己提交的请假申请" }, { status: 403 });
  }

  // 并发幂等：该节点若已存在记录，直接拒绝重复处理
  const { count: nodeCount } = await db
    .from("approval_records")
    .select("id", { count: "exact", head: true })
    .eq("leave_request_id", id)
    .eq("node_order", currentNode.order);
  if ((nodeCount ?? 0) > 0) {
    return NextResponse.json({ error: "该节点已被处理，请勿重复操作" }, { status: 409 });
  }

  // 写审批记录
  const { error: recErr } = await db.from("approval_records").insert({
    leave_request_id: id,
    node_order: currentNode.order,
    node_name: currentNode.name,
    approver_id: user.id,
    approver_name: user.name,
    action: body.action,
    comment: body.comment?.trim() || null,
  });
  if (recErr) return NextResponse.json({ error: "审批记录保存失败" }, { status: 500 });

  // 关闭当前审批人待办
  await closeTodos(id, user.id);

  if (body.action === "rejected") {
    await db
      .from("leave_requests")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["pending", "approving"]);
    await closeAllTodos(id);
    await releaseActiveLeave(db, lv.student_id, id);
    await createMessage({
      userId: lv.student_id,
      type: "rejected",
      title: `请假申请 ${lv.request_no} 已驳回`,
      content: body.comment?.trim() || "请查看审批意见",
      leaveRequestId: id,
    });
    await writeOperationLog({
      operator: user,
      action: "reject_leave",
      targetType: "leave",
      targetId: id,
      detail: { node: currentNode.name, comment: body.comment },
      request,
    });
    return NextResponse.json({ success: true, status: "rejected" });
  }

  // 通过：判断是否最后节点
  const isLast = currentNode.order >= nodes.length - 1;
  if (isLast) {
    await db
      .from("leave_requests")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["pending", "approving"]);
    await closeAllTodos(id);
    await createMessage({
      userId: lv.student_id,
      type: "final_approved",
      title: `请假申请 ${lv.request_no} 已全部批准`,
      content: "请在返校后及时定位打卡销假",
      leaveRequestId: id,
    });
    await writeOperationLog({
      operator: user,
      action: "approve_leave_final",
      targetType: "leave",
      targetId: id,
      detail: { node: currentNode.name },
      request,
    });
    return NextResponse.json({ success: true, status: "approved" });
  }

  // 流转下一节点
  const nextNode = nodes[currentNode.order + 1];
  await db
    .from("leave_requests")
    .update({
      status: "approving",
      current_node_order: nextNode.order,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["pending", "approving"]);

  // 通知学生节点流转
  await createMessage({
    userId: lv.student_id,
    type: "node_pass",
    title: `请假申请已通过「${currentNode.name}」，等待「${nextNode.name}」`,
    leaveRequestId: id,
  });

  // 解析下一节点合格审批人（按当前管理关系；任一合格人员处理即可）
  const nextApproverIds = nextNode.assigneeId
    ? [nextNode.assigneeId]
    : await resolveApproverIds(db, nextNode.role, studentRef);

  if (nextApproverIds.length > 0) {
    for (const uid of nextApproverIds) {
      await createMessage({
        userId: uid,
        type: "approval_todo",
        title: `请假申请待「${nextNode.name}」审批`,
        content: `${lv.request_no}`,
        leaveRequestId: id,
        isTodo: true,
      });
    }
  } else {
    // 解析不到负责人：异常待办给全部管理员，不自动跳过
    const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
    for (const a of admins ?? []) {
      await createMessage({
        userId: a.user_id as string,
        type: "abnormal",
        title: `异常待办：${lv.request_no} 下一节点「${nextNode.name}」无有效审批人`,
        content: "请检查学生调班后的管理关系或流程节点配置",
        leaveRequestId: id,
        isTodo: true,
      });
    }
  }

  await writeOperationLog({
    operator: user,
    action: "approve_leave_node",
    targetType: "leave",
    targetId: id,
    detail: { node: currentNode.name, next: nextNode.name },
    request,
  });

  return NextResponse.json({ success: true, status: "approving", nextNode: nextNode.name });
}

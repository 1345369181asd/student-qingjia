import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { closeAllTodos, closeTodos, createMessage } from "@/lib/notify";
import { writeOperationLog } from "@/lib/logger";

interface FlowNode {
  order: number;
  name: string;
  role: "teacher" | "admin";
  assigneeId?: string | null;
}

// 校验当前用户是否为某节点的合法审批人
async function isNodeApprover(params: {
  db: Awaited<ReturnType<typeof getClient>>;
  user: { id: string; role: string; classId: string | null };
  node: FlowNode;
  studentId: string;
}): Promise<boolean> {
  const { db, user, node, studentId } = params;
  if (node.assigneeId) return node.assigneeId === user.id;
  if (node.role === "admin") return user.role === "admin";
  if (node.role === "teacher") {
    if (user.role !== "teacher") return false;
    // 学生班级的负责中队长
    const { data: student } = await db
      .from("users")
      .select("class_id")
      .eq("id", studentId)
      .maybeSingle();
    const classId = (student as { class_id: string | null } | null)?.class_id;
    if (!classId) return false;
    const { data: cls } = await db
      .from("classes")
      .select("id")
      .eq("id", classId)
      .eq("leader_id", user.id)
      .maybeSingle();
    return !!cls;
  }
  return false;
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

  const allowed = await isNodeApprover({
    db,
    user,
    node: currentNode,
    studentId: lv.student_id,
  });
  if (!allowed) {
    return NextResponse.json({ error: "您不是当前节点的审批人" }, { status: 403 });
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

  // 解析下一节点审批人
  const { data: student } = await db
    .from("users")
    .select("class_id")
    .eq("id", lv.student_id)
    .maybeSingle();
  const nextApproverId = nextNode.assigneeId ?? null;
  let finalApproverId = nextApproverId;
  if (!finalApproverId && nextNode.role === "teacher") {
    const classId = (student as { class_id: string | null } | null)?.class_id;
    if (classId) {
      const { data: cls } = await db
        .from("classes")
        .select("leader_id")
        .eq("id", classId)
        .maybeSingle();
      finalApproverId = (cls as { leader_id: string | null } | null)?.leader_id ?? null;
    }
  } else if (!finalApproverId && nextNode.role === "admin") {
    const { data: admin } = await db
      .from("users")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    finalApproverId = (admin as { id: string } | null)?.id ?? null;
  }

  if (finalApproverId) {
    await createMessage({
      userId: finalApproverId,
      type: "approval_todo",
      title: `请假申请待「${nextNode.name}」审批`,
      content: `${lv.request_no}`,
      leaveRequestId: id,
      isTodo: true,
    });
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

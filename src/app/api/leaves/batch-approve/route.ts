import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { closeTodos, closeAllTodos, createMessage } from "@/lib/notify";
import { randomUUID } from "crypto";
import { writeOperationLog } from "@/lib/logger";

interface FlowNode {
  order: number;
  name: string;
  role: "teacher" | "admin";
  assigneeId?: string | null;
}

// 批量审批：逐条校验、逐条保存审批记录，返回每条成功/失败/已处理
export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const body = (await request.json()) as {
    ids?: string[];
    action?: "approved" | "rejected";
    comment?: string;
  };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "请选择至少一条申请" }, { status: 400 });
  }
  if (body.action !== "approved" && body.action !== "rejected") {
    return NextResponse.json({ error: "操作不合法" }, { status: 400 });
  }
  if (body.action === "rejected" && !body.comment?.trim()) {
    return NextResponse.json({ error: "批量驳回必须填写共同意见" }, { status: 400 });
  }

  const db = await getClient();
  const batchId = randomUUID();
  const results: Array<{ id: string; requestNo: string; ok: boolean; reason?: string }> = [];

  for (const id of body.ids) {
    // 逐条独立处理，互不影响
    const { data: leave } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
    if (!leave) {
      results.push({ id, requestNo: "-", ok: false, reason: "申请不存在" });
      continue;
    }
    const lv = leave as {
      id: string;
      student_id: string;
      status: string;
      current_node_order: number;
      flow_snapshot: { nodes: FlowNode[] } | null;
      request_no: string;
    };
    if (!["pending", "approving"].includes(lv.status)) {
      results.push({ id, requestNo: lv.request_no, ok: false, reason: "申请已被处理" });
      continue;
    }
    const node = lv.flow_snapshot?.nodes.find((n) => n.order === lv.current_node_order);
    if (!node) {
      results.push({ id, requestNo: lv.request_no, ok: false, reason: "节点配置异常" });
      continue;
    }

    // 审批人权限校验
    let allowed = false;
    if (node.assigneeId) {
      allowed = node.assigneeId === user.id;
    } else if (node.role === "admin") {
      allowed = user.role === "admin";
    } else {
      const { data: student } = await db
        .from("users")
        .select("class_id")
        .eq("id", lv.student_id)
        .maybeSingle();
      const classId = (student as { class_id: string | null } | null)?.class_id;
      if (classId && user.role === "teacher") {
        const { data: cls } = await db
          .from("classes")
          .select("id")
          .eq("id", classId)
          .eq("leader_id", user.id)
          .maybeSingle();
        allowed = !!cls;
      }
    }
    if (!allowed) {
      results.push({ id, requestNo: lv.request_no, ok: false, reason: "非当前节点审批人" });
      continue;
    }

    const { count: existsCount } = await db
      .from("approval_records")
      .select("id", { count: "exact", head: true })
      .eq("leave_request_id", id)
      .eq("node_order", node.order);
    if ((existsCount ?? 0) > 0) {
      results.push({ id, requestNo: lv.request_no, ok: false, reason: "节点已被处理" });
      continue;
    }

    await db.from("approval_records").insert({
      leave_request_id: id,
      node_order: node.order,
      node_name: node.name,
      approver_id: user.id,
      approver_name: user.name,
      action: body.action,
      comment: body.comment?.trim() || null,
      batch_id: batchId,
    });
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
    } else {
      const nodes = lv.flow_snapshot?.nodes ?? [];
      const isLast = node.order >= nodes.length - 1;
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
      } else {
        const nextNode = nodes[node.order + 1];
        await db
          .from("leave_requests")
          .update({
            status: "approving",
            current_node_order: nextNode.order,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .in("status", ["pending", "approving"]);
        await createMessage({
          userId: lv.student_id,
          type: "node_pass",
          title: `请假申请已通过「${node.name}」，等待「${nextNode.name}」`,
          leaveRequestId: id,
        });
      }
    }

    results.push({ id, requestNo: lv.request_no, ok: true });
  }

  const successCount = results.filter((r) => r.ok).length;
  await writeOperationLog({
    operator: user,
    action: body.action === "approved" ? "batch_approve" : "batch_reject",
    targetType: "leave",
    detail: { batchId, total: body.ids.length, success: successCount },
    request,
  });

  return NextResponse.json({
    data: {
      batchId,
      total: body.ids.length,
      success: successCount,
      failed: results.length - successCount,
      results,
    },
  });
}

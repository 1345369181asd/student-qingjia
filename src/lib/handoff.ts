import type { SupabaseClient } from "@supabase/supabase-js";
import { createMessage, closeAllTodos } from "@/lib/notify";
import { resolveApproverIds } from "@/lib/scope";

/**
 * 待办自动交接：组织/人员关系调整后，把「在途请假单」当前节点的待办，
 * 从旧审批人收回到新审批人，并在 management_changes 留痕。
 *
 * 规则（V3.2 AC-31 / 6.3）：
 * - 只处理 status in (pending, approving) 的单据；
 * - 指定人员节点(assigneeId)不随组织关系自动交接（属显式指派）；
 * - 解析不到新审批人时：关闭旧待办并给全部管理员生成异常待办，绝不悬空。
 */
interface ChangeMeta {
  changeType:
    | "student_transfer"
    | "teacher_reassign"
    | "major_reparent"
    | "class_major_change"
    | "relation_change";
  operatorId: string;
  operatorName: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}

interface PendingLeaveRow {
  id: string;
  request_no: string;
  student_id: string;
  current_node_order: number;
  flow_snapshot: { nodes: Array<{ order: number; name: string; role: string; assigneeId?: string | null }> } | null;
}

async function recordChange(db: SupabaseClient, meta: ChangeMeta, affected: number): Promise<void> {
  await db.from("management_changes").insert({
    id: crypto.randomUUID(),
    change_type: meta.changeType,
    target_type: meta.targetType,
    target_id: meta.targetId,
    operator_id: meta.operatorId,
    operator_name: meta.operatorName,
    before_value: (meta.before as Record<string, unknown>) ?? null,
    after_value: { ...((meta.after as Record<string, unknown>) ?? {}), handoffAffected: affected },
  });
}

async function reassignTodosForLeaves(
  db: SupabaseClient,
  leaves: PendingLeaveRow[],
  meta: ChangeMeta,
): Promise<number> {
  let affected = 0;
  for (const lv of leaves) {
    const node = lv.flow_snapshot?.nodes.find((n) => n.order === lv.current_node_order);
    if (!node || node.assigneeId) continue; // 指定人员节点不自动交接

    const { data: stu } = await db
      .from("users")
      .select("class_id, department_id")
      .eq("id", lv.student_id)
      .maybeSingle();
    const ref = (stu ?? { class_id: null, department_id: null }) as {
      class_id: string | null;
      department_id: string | null;
    };
    const approverIds = await resolveApproverIds(db, node.role, ref);

    // 关闭该单当前全部未完成待办（旧审批人）
    await closeAllTodos(lv.id);

    if (approverIds.length > 0) {
      for (const uid of approverIds) {
        await createMessage({
          userId: uid,
          type: "approval_todo",
          title: `请假申请待「${node.name}」审批（组织调整自动交接）`,
          content: lv.request_no,
          leaveRequestId: lv.id,
          isTodo: true,
        });
      }
    } else {
      const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
      for (const a of admins ?? []) {
        await createMessage({
          userId: a.user_id as string,
          type: "abnormal",
          title: `异常待办：${lv.request_no} 组织调整后节点「${node.name}」无有效审批人`,
          content: "请检查管理关系或流程节点配置",
          leaveRequestId: lv.id,
          isTodo: true,
        });
      }
    }
    affected += 1;
  }
  await recordChange(db, meta, affected);
  return affected;
}

/** 学生调班/调专业后：交接其本人所有在途单据当前节点待办 */
export async function handoffStudentLeaves(
  db: SupabaseClient,
  studentId: string,
  meta: ChangeMeta,
): Promise<number> {
  const { data } = await db
    .from("leave_requests")
    .select("id,request_no,student_id,current_node_order,flow_snapshot")
    .eq("student_id", studentId)
    .in("status", ["pending", "approving"]);
  return reassignTodosForLeaves(db, (data ?? []) as PendingLeaveRow[], meta);
}

/** 班级更换中队长后：交接该班所有学生在途单据当前节点待办 */
export async function handoffClassLeaves(
  db: SupabaseClient,
  classId: string,
  meta: ChangeMeta,
): Promise<number> {
  const { data: students } = await db.from("users").select("id").eq("class_id", classId);
  const ids = (students ?? []).map((s) => s.id as string);
  if (ids.length === 0) {
    await recordChange(db, meta, 0);
    return 0;
  }
  const { data } = await db
    .from("leave_requests")
    .select("id,request_no,student_id,current_node_order,flow_snapshot")
    .in("student_id", ids)
    .in("status", ["pending", "approving"]);
  return reassignTodosForLeaves(db, (data ?? []) as PendingLeaveRow[], meta);
}

/** 系部调整/院领导变更后：交接该系部学生在途单据当前节点待办 */
export async function handoffDepartmentLeaves(
  db: SupabaseClient,
  departmentId: string,
  meta: ChangeMeta,
): Promise<number> {
  const { data: students } = await db
    .from("users")
    .select("id")
    .eq("department_id", departmentId);
  const ids = (students ?? []).map((s) => s.id as string);
  if (ids.length === 0) {
    await recordChange(db, meta, 0);
    return 0;
  }
  const { data } = await db
    .from("leave_requests")
    .select("id,request_no,student_id,current_node_order,flow_snapshot")
    .in("student_id", ids)
    .in("status", ["pending", "approving"]);
  return reassignTodosForLeaves(db, (data ?? []) as PendingLeaveRow[], meta);
}

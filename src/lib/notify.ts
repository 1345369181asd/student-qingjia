import { getClient } from "@/lib/db";

export interface CreateMessageInput {
  userId: string;
  type: string;
  title: string;
  content?: string | null;
  leaveRequestId?: string | null;
  isTodo?: boolean;
}

// 创建站内消息 / 待办
export async function createMessage(input: CreateMessageInput): Promise<void> {
  const db = await getClient();
  await db.from("messages").insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    content: input.content ?? null,
    leave_request_id: input.leaveRequestId ?? null,
    is_todo: input.isTodo ?? false,
    todo_done: false,
    is_read: false,
  });
}

export async function createMessages(inputs: CreateMessageInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const db = await getClient();
  await db.from("messages").insert(
    inputs.map((i) => ({
      user_id: i.userId,
      type: i.type,
      title: i.title,
      content: i.content ?? null,
      leave_request_id: i.leaveRequestId ?? null,
      is_todo: i.isTodo ?? false,
      todo_done: false,
      is_read: false,
    }))
  );
}

// 关闭某申请对某人的相关待办（节点通过/撤销/驳回后）
export async function closeTodos(leaveRequestId: string, userId?: string): Promise<void> {
  const db = await getClient();
  let query = db
    .from("messages")
    .update({ todo_done: true })
    .eq("leave_request_id", leaveRequestId)
    .eq("is_todo", true)
    .eq("todo_done", false);
  if (userId) query = query.eq("user_id", userId);
  await query;
}

// 关闭某申请所有待办
export async function closeAllTodos(leaveRequestId: string): Promise<void> {
  await closeTodos(leaveRequestId);
}

import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

interface FlowNode {
  order: number;
  name: string;
  role: "teacher" | "admin";
  assigneeId?: string | null;
}

// 流程列表：中队长/管理员可查看
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin", "teacher"]);
  if (roleErr) return roleErr;

  const db = await getClient();
  const { data, error } = await db
    .from("approval_flows")
    .select("*")
    .order("priority", { ascending: false });
  if (error) return NextResponse.json({ error: "查询失败" }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const body = (await request.json()) as {
    name?: string;
    leaveTypeCode?: string | null;
    minHours?: number;
    maxHours?: number | null;
    requireLeaveSchool?: boolean | null;
    nodes?: FlowNode[];
    priority?: number;
  };
  if (!body.name?.trim() || !Array.isArray(body.nodes) || body.nodes.length === 0) {
    return NextResponse.json({ error: "流程名称与至少一个审批节点必填" }, { status: 400 });
  }
  const nodes = body.nodes
    .map((n, i) => ({ order: i, name: n.name?.trim(), role: n.role, assigneeId: n.assigneeId ?? null }))
    .filter((n) => n.name && (n.role === "teacher" || n.role === "admin"));
  if (nodes.length === 0) {
    return NextResponse.json({ error: "审批节点配置无效" }, { status: 400 });
  }

  const db = await getClient();
  const { data, error } = await db
    .from("approval_flows")
    .insert({
      name: body.name.trim(),
      leave_type_code: body.leaveTypeCode || null,
      min_hours: body.minHours ?? 0,
      max_hours: body.maxHours ?? null,
      require_leave_school: body.requireLeaveSchool ?? null,
      nodes,
      priority: body.priority ?? 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "创建失败" }, { status: 500 });

  await writeOperationLog({
    operator: user,
    action: "create_flow",
    targetType: "approval_flow",
    targetId: (data as { id: string }).id,
    detail: { name: body.name },
    request,
  });
  return NextResponse.json({ data });
}

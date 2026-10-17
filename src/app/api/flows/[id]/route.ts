import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 更新流程配置：不静默改写已提交申请（申请保存了 flowSnapshot）
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const body = (await request.json()) as {
    name?: string;
    leaveTypeCode?: string | null;
    minDays?: number;
    maxDays?: number | null;
    requireLeaveSchool?: boolean | null;
    nodes?: Array<{ name?: string; role: "teacher" | "admin"; assigneeId?: string | null }>;
    priority?: number;
    isActive?: boolean;
  };

  const db = await getClient();
  const { data: old } = await db.from("approval_flows").select("version").eq("id", id).maybeSingle();
  if (!old) return NextResponse.json({ error: "流程不存在" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.leaveTypeCode !== undefined) patch.leave_type_code = body.leaveTypeCode || null;
  if (body.minDays !== undefined) {
    if (body.minDays < 0 || (body.minDays * 2) % 1 !== 0) {
      return NextResponse.json({ error: "最短天数需为不小于 0 的 0.5 的倍数" }, { status: 400 });
    }
    patch.min_days = body.minDays;
  }
  if (body.maxDays !== undefined) {
    if (body.maxDays != null && ((body.maxDays * 2) % 1 !== 0 || body.maxDays <= (body.minDays ?? 0))) {
      return NextResponse.json({ error: "最长天数需为 0.5 的倍数且大于最短天数（留空表示不限）" }, { status: 400 });
    }
    patch.max_days = body.maxDays;
  }
  if (body.requireLeaveSchool !== undefined) patch.require_leave_school = body.requireLeaveSchool;
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.isActive !== undefined) patch.is_active = body.isActive;
  if (body.nodes) {
    const nodes = body.nodes
      .map((n, i) => ({ order: i, name: n.name?.trim(), role: n.role, assigneeId: n.assigneeId ?? null }))
      .filter((n) => n.name);
    if (nodes.length === 0) {
      return NextResponse.json({ error: "至少保留一个有效节点" }, { status: 400 });
    }
    patch.nodes = nodes;
  }
  // 版本号 +1，体现“调整流程不改写在途申请”
  patch.version = ((old as { version: number }).version ?? 1) + 1;

  const { data, error } = await db.from("approval_flows").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "更新失败" }, { status: 500 });

  await writeOperationLog({
    operator: user,
    action: "update_flow",
    targetType: "approval_flow",
    targetId: id,
    detail: { version: patch.version },
    request,
  });
  return NextResponse.json({ data });
}

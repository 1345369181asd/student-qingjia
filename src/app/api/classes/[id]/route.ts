import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

interface Body {
  name?: string;
  grade?: string | null;
  leader_id?: string | null;
  campus_id?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const body = (await request.json()) as Body;
  const db = await getClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const map: Record<keyof Body, string> = {
    name: "name",
    grade: "grade",
    leader_id: "leader_id",
    campus_id: "campus_id",
    description: "description",
    isActive: "is_active",
  };
  (Object.keys(map) as Array<keyof Body>).forEach((k) => {
    if (body[k] !== undefined) patch[map[k]] = body[k] as unknown;
  });

  const { data, error } = await db.from("classes").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "更新失败" }, { status: 500 });

  await writeOperationLog({
    operator: user,
    action: "update_class",
    targetType: "class",
    targetId: id,
    detail: { name: body.name },
    request,
  });
  return NextResponse.json({ data });
}

// 班级被历史请假快照引用：停用而非物理删除
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const db = await getClient();
  await db.from("classes").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);

  await writeOperationLog({
    operator: user,
    action: "deactivate_class",
    targetType: "class",
    targetId: id,
    request,
  });
  return NextResponse.json({ success: true });
}

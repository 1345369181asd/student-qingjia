import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const body = (await request.json()) as { name?: string; sortOrder?: number; isActive?: boolean };
  const db = await getClient();
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder;
  if (body.isActive !== undefined) patch.is_active = body.isActive;
  const { data, error } = await db.from("leave_types").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "更新失败" }, { status: 500 });
  return NextResponse.json({ data });
}

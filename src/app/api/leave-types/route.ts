import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

export async function GET() {
  const db = await getClient();
  const { data, error } = await db
    .from("leave_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: "查询失败" }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const body = (await request.json()) as { code?: string; name?: string; sortOrder?: number };
  if (!body.code?.trim() || !body.name?.trim()) {
    return NextResponse.json({ error: "类型编码和名称必填" }, { status: 400 });
  }
  const db = await getClient();
  const { data, error } = await db
    .from("leave_types")
    .insert({ code: body.code.trim(), name: body.name.trim(), sort_order: body.sortOrder ?? 0 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "编码已存在或创建失败" }, { status: 400 });

  await writeOperationLog({
    operator: user,
    action: "create_leave_type",
    targetType: "leave_type",
    targetId: (data as { id: string }).id,
    request,
  });
  return NextResponse.json({ data });
}

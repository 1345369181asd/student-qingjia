import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 更新（改名/编码/停用）。被引用的系部只允许停用，不物理删除。
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin"]);
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json();
  const db = await getClient();
  const { data: before } = await db.from("departments").select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "系部不存在" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.code === "string" && body.code.trim()) {
    const { data: dup } = await db
      .from("departments")
      .select("id")
      .eq("code", body.code.trim())
      .neq("id", id)
      .maybeSingle();
    if (dup) return NextResponse.json({ error: "系部编码已被占用" }, { status: 400 });
    patch.code = body.code.trim();
  }
  if (typeof body.isActive === "boolean") {
    // 停用前统计受影响对象
    if (body.isActive === false) {
      const { count: majorCount } = await db
        .from("majors")
        .select("id", { count: "exact", head: true })
        .eq("department_id", id)
        .eq("is_active", true);
      if ((majorCount ?? 0) > 0) {
        // 允许停用，但要求带 confirm；其下专业一并提示
        if (!body.confirm) {
          return NextResponse.json(
            { error: `该系部下仍有 ${majorCount} 个有效专业，停用请确认`, needConfirm: true, majorCount },
            { status: 409 }
          );
        }
      }
    }
    patch.is_active = body.isActive;
  }

  const { error } = await db.from("departments").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeOperationLog({
    operatorId: auth.id,
    operatorName: auth.name,
    action: "department_update",
    targetType: "department",
    targetId: id,
    detail: { before, after: patch },
  });
  return NextResponse.json({ success: true });
}

// 删除：仅当无任何专业引用时允许物理删除
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin"]);
  if (denied) return denied;
  const { id } = await params;

  const db = await getClient();
  const { count } = await db
    .from("majors")
    .select("id", { count: "exact", head: true })
    .eq("department_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "该系部已被专业引用，不能删除；如需停用请使用停用功能" },
      { status: 400 }
    );
  }
  const { error } = await db.from("departments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeOperationLog({
    operatorId: auth.id,
    operatorName: auth.name,
    action: "department_delete",
    targetType: "department",
    targetId: id,
    detail: {},
  });
  return NextResponse.json({ success: true });
}

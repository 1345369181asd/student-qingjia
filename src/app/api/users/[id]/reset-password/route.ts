import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole, hashPassword } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 管理员重置密码（忘记密码由管理员核验后重置），重置后要求首次登录修改
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { newPassword?: string };
  const newPassword = body.newPassword?.trim() || "123456";
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }

  const db = await getClient();
  const { data: target } = await db.from("users").select("name").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const passwordHash = await hashPassword(newPassword);
  await db
    .from("users")
    .update({
      password_hash: passwordHash,
      must_change_password: true,
      failed_login_count: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await writeOperationLog({
    operator: user,
    action: "reset_password",
    targetType: "user",
    targetId: id,
    detail: { targetName: (target as { name: string }).name },
    request,
  });

  return NextResponse.json({ success: true });
}

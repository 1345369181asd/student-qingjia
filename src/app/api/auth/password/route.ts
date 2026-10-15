import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { getTokenFromRequest, verifyToken, comparePassword, hashPassword, TOKEN_COOKIE } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 修改自己的密码（支持首次登录强制改密）
export async function PUT(request: Request) {
  const token = getTokenFromRequest(request);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    oldPassword?: string;
    newPassword?: string;
  };
  const newPassword = body.newPassword ?? "";
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
  }

  const db = await getClient();
  const { data: user } = await db
    .from("users")
    .select("password_hash")
    .eq("id", payload.id)
    .maybeSingle();
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  // 首次强制改密时可以不带旧密码；普通修改必须验证旧密码
  const { data: fullUser } = await db
    .from("users")
    .select("must_change_password")
    .eq("id", payload.id)
    .maybeSingle();
  const mustChange = (fullUser as { must_change_password: boolean } | null)
    ?.must_change_password;
  if (!mustChange) {
    if (!body.oldPassword) {
      return NextResponse.json({ error: "请输入原密码" }, { status: 400 });
    }
    const ok = await comparePassword(
      body.oldPassword,
      (user as { password_hash: string }).password_hash
    );
    if (!ok) {
      return NextResponse.json({ error: "原密码错误" }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .from("users")
    .update({ password_hash: passwordHash, must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", payload.id);

  await writeOperationLog({
    operator: payload,
    action: "change_password",
    targetType: "user",
    targetId: payload.id,
    request,
  });

  const res = NextResponse.json({ success: true });
  res.cookies.set(TOKEN_COOKIE, token ?? "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}

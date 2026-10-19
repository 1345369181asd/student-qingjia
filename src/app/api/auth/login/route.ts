import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import {
  signToken,
  TOKEN_COOKIE,
  comparePassword,
  handleFailedLogin,
  clearLoginState,
} from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    username?: string;
    password?: string;
  };
  const username = body.username?.trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ error: "请输入账号和密码" }, { status: 400 });
  }

  const db = await getClient();
  const { data: user } = await db
    .from("users")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }

  const u = user as {
    id: string;
    username: string;
    password_hash: string;
    name: string;
    role: "student" | "teacher" | "admin";
    class_id: string | null;
    is_active: boolean;
    failed_login_count: number;
    locked_until: string | null;
    must_change_password: boolean;
  };

  if (!u.is_active) {
    return NextResponse.json({ error: "账号已停用，请联系管理员" }, { status: 403 });
  }

  if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
    return NextResponse.json(
      {
        error: `登录失败次数过多，账号已锁定，请在 ${new Date(u.locked_until).toLocaleString(
          "zh-CN"
        )} 后再试或联系管理员重置`,
      },
      { status: 423 }
    );
  }

  const valid = await comparePassword(password, u.password_hash);
  if (!valid) {
    const count = await handleFailedLogin(u.id, u.failed_login_count ?? 0);
    await writeOperationLog({
      action: "login_failed",
      targetType: "user",
      targetId: u.id,
      detail: { username, count },
      request,
    });
    return NextResponse.json(
      { error: `账号或密码错误，剩余尝试次数 ${Math.max(0, 5 - count)} 次` },
      { status: 401 }
    );
  }

  const loginState = clearLoginState();
  await db.from("users").update(loginState).eq("id", u.id);

  const payload = {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    classId: u.class_id,
  };
  const token = signToken(payload);
  const res = NextResponse.json({
    user: { ...payload, mustChangePassword: u.must_change_password },
    token,
  });
  res.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  await writeOperationLog({
    operatorId: u.id,
    operatorName: u.name,
    action: "login_success",
    targetType: "user",
    targetId: u.id,
    request,
  });

  return res;
}

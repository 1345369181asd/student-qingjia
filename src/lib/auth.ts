import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getClient } from "@/lib/db";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: "student" | "teacher" | "admin";
  classId: string | null;
  campusId?: string | null;
  mustChangePassword?: boolean;
}

const JWT_SECRET = process.env.JWT_SECRET || "student-leave-system-secret-key-2024";
export const TOKEN_COOKIE = "leave_token";
const MAX_FAILED = 5; // 连续失败 5 次
const LOCK_MINUTES = 15; // 锁定 15 分钟

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      classId: user.classId,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    const tokenCookie = cookies.find((c) => c.startsWith(`${TOKEN_COOKIE}=`));
    if (tokenCookie) return decodeURIComponent(tokenCookie.slice(TOKEN_COOKIE.length + 1));
  }
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(request: Request): Promise<AuthUser | Response> {
  const user = await getCurrentUser(request);
  if (!user) {
    return Response.json({ error: "未登录或登录已过期" }, { status: 401 });
  }
  // 校验账号仍有效、未停用
  const db = await getClient();
  const { data } = await db
    .from("users")
    .select("is_active, name, role, class_id, campus_id, must_change_password")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || (data as { is_active: boolean }).is_active === false) {
    return Response.json({ error: "账号已停用，请联系管理员" }, { status: 403 });
  }
  return {
    ...user,
    campusId: (data as { campus_id: string | null }).campus_id,
    mustChangePassword: (data as { must_change_password: boolean }).must_change_password,
  };
}

export function requireRole(user: AuthUser, roles: string[]): Response | null {
  if (!roles.includes(user.role)) {
    return Response.json({ error: "无操作权限" }, { status: 403 });
  }
  return null;
}

// 登录失败计数 / 锁定处理
export async function handleFailedLogin(userId: string, current: number): Promise<number> {
  const db = await getClient();
  const next = current + 1;
  const patch: Record<string, unknown> = { failed_login_count: next };
  if (next >= MAX_FAILED) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    patch.locked_until = until;
  }
  await db.from("users").update(patch).eq("id", userId);
  return next;
}

export function clearLoginState(): Record<string, unknown> {
  return { failed_login_count: 0, locked_until: null, last_login_at: new Date().toISOString() };
}

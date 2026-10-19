import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getClient } from "@/lib/db";

// 全部应用角色（V3.2）
export const APP_ROLES = [
  "student",
  "teacher", // 中队长
  "head_teacher", // 大队长
  "affair", // 学工处
  "college_leader", // 分管院领导
  "admin", // 系统管理员
] as const;
export type AppRole = (typeof APP_ROLES)[number];

// 登录主身份（兼容旧三端路由 student/teacher/admin）
export const ROLE_HOME: Record<string, string> = {
  student: "/student",
  teacher: "/teacher",
  head_teacher: "/teacher",
  affair: "/teacher",
  college_leader: "/teacher",
  admin: "/admin",
};

// 管理类角色（可进入审批工作台）
export const MANAGER_ROLES: AppRole[] = [
  "teacher",
  "head_teacher",
  "affair",
  "college_leader",
  "admin",
];

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  /** @deprecated 主角色，仅用于兼容旧代码；权限判断请用 roles */
  role: AppRole;
  /** 用户拥有的全部角色 */
  roles: AppRole[];
  classId: string | null;
  campusId?: string | null;
  majorId?: string | null;
  departmentId?: string | null;
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

export function signToken(user: {
  id: string;
  username: string;
  name: string;
  role: AppRole;
  classId: string | null;
}): string {
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

export function verifyToken(token: string): (jwt.JwtPayload & AuthUser) | null {
  try {
    return jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & AuthUser;
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
  return verifyToken(token) as unknown as AuthUser | null;
}

// 读取用户全部有效角色
export async function loadUserRoles(userId: string): Promise<AppRole[]> {
  const db = await getClient();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set<AppRole>((data ?? []).map((r) => r.role as AppRole));
  return APP_ROLES.filter((r) => roles.has(r));
}

/**
 * 认证并校验账号有效；返回包含全部角色与组织字段的 AuthUser。
 * 角色以 user_roles 为准（不长期相信旧会话快照）。
 */
export async function requireAuth(request: Request): Promise<AuthUser | Response> {
  const tokenUser = await getCurrentUser(request);
  if (!tokenUser) {
    return Response.json({ error: "未登录或登录已过期" }, { status: 401 });
  }
  const db = await getClient();
  const { data } = await db
    .from("users")
    .select(
      "is_active, name, role, class_id, campus_id, major_id, department_id, must_change_password"
    )
    .eq("id", tokenUser.id)
    .maybeSingle();

  if (!data || (data as { is_active: boolean }).is_active === false) {
    return Response.json({ error: "账号已停用，请联系管理员" }, { status: 403 });
  }
  const u = data as {
    is_active: boolean;
    name: string;
    role: AppRole;
    class_id: string | null;
    campus_id: string | null;
    major_id: string | null;
    department_id: string | null;
    must_change_password: boolean;
  };
  const roles = await loadUserRoles(tokenUser.id);
  const effectiveRoles = roles.length > 0 ? roles : [u.role];
  return {
    ...tokenUser,
    name: u.name,
    role: u.role,
    roles: effectiveRoles,
    classId: u.class_id,
    campusId: u.campus_id,
    majorId: u.major_id,
    departmentId: u.department_id,
    mustChangePassword: u.must_change_password,
  };
}

export function hasRole(user: AuthUser, role: AppRole): boolean {
  return user.roles.includes(role);
}

export function hasAnyRole(user: AuthUser, roles: AppRole[]): boolean {
  return roles.some((r) => user.roles.includes(r));
}

// 单角色校验（兼容旧调用）
export function requireRole(user: AuthUser, roles: string[]): Response | null {
  if (!roles.some((r) => user.roles.includes(r as AppRole))) {
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

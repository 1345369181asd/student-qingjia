import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { getTokenFromRequest, verifyToken, TOKEN_COOKIE } from "@/lib/auth";

export async function GET(request: Request) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "登录已过期" }, { status: 401 });
  }

  const db = await getClient();
  const { data: user } = await db
    .from("users")
    .select(
      "id,username,name,role,class_id,campus_id,student_no,grade,major,department,major_id,department_id,student_status,email,phone,is_active,must_change_password"
    )
    .eq("id", payload.id)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }
  const u = user as Record<string, unknown>;
  if (u.is_active === false) {
    return NextResponse.json({ error: "账号已停用" }, { status: 403 });
  }

  const { data: roleRows } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", payload.id);
  const roles = (roleRows ?? []).map((r) => (r as { role: string }).role);
  const finalRoles = roles.length > 0 ? roles : [u.role as string];

  // 未读消息与待办数量
  const { count: unreadCount } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", payload.id)
    .eq("is_read", false);
  const { count: todoCount } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", payload.id)
    .eq("is_todo", true)
    .eq("todo_done", false);

  return NextResponse.json({
    user: {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      roles: finalRoles,
      classId: u.class_id,
      campusId: u.campus_id,
      studentNo: u.student_no,
      grade: u.grade,
      major: u.major,
      department: u.department,
      majorId: u.major_id,
      departmentId: u.department_id,
      studentStatus: u.student_status,
      email: u.email,
      phone: u.phone,
      mustChangePassword: u.must_change_password,
    },
    unreadCount: unreadCount ?? 0,
    todoCount: todoCount ?? 0,
  });
}

// 登出
export async function POST(request: Request) {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(TOKEN_COOKIE);
  return res;
}

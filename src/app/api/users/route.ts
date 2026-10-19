import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole, hashPassword, APP_ROLES, type AppRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 用户列表（仅管理员），支持 role(多角色过滤) / keyword / classId
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");
  const staffOnly = searchParams.get("staff") === "1";
  const keyword = searchParams.get("keyword")?.trim();
  const classId = searchParams.get("classId");
  const departmentId = searchParams.get("departmentId");

  const db = await getClient();
  let query = db
    .from("users")
    .select(
      "id,username,name,role,class_id,campus_id,major_id,department_id,student_no,grade,major,department,student_status,email,phone,is_active,must_change_password,failed_login_count,last_login_at,created_at,classes:class_id(id,name),majors:major_id(id,name),departments:department_id(id,name)"
    )
    .order("created_at", { ascending: true });
  if (classId) query = query.eq("class_id", classId);
  if (departmentId) query = query.eq("department_id", departmentId);
  if (keyword) {
    query = query.or(
      `username.ilike.%${keyword}%,name.ilike.%${keyword}%,student_no.ilike.%${keyword}%,phone.ilike.%${keyword}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "查询失败" }, { status: 500 });

  // 附带多角色
  let ids = (data ?? []).map((u) => u.id as string);
  if (role) {
    const { data: roleRows } = await db
      .from("user_roles")
      .select("user_id, role")
      .eq("role", role);
    const matched = new Set((roleRows ?? []).map((r) => r.user_id));
    ids = ids.filter((id) => matched.has(id));
  }
  const { data: allRoles } = await db
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const roleMap = new Map<string, AppRole[]>();
  for (const r of allRoles ?? []) {
    const list = roleMap.get(r.user_id) ?? [];
    list.push(r.role as AppRole);
    roleMap.set(r.user_id, list);
  }

  let result = (data ?? [])
    .filter((u) => ids.includes(u.id as string))
    .map((u) => ({ ...u, roles: roleMap.get(u.id as string) ?? [u.role as AppRole] }));
  // 仅教职工：排除纯学生账号（含管理员/教师/大队长/学工处/院领导；兼任账号保留）
  if (staffOnly) {
    result = result.filter((u) => (u.roles as AppRole[]).some((r) => r !== "student"));
  }
  return NextResponse.json({ data: result });
}

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const body = (await request.json()) as {
    username?: string;
    password?: string;
    name?: string;
    role?: AppRole;
    roles?: AppRole[];
    classId?: string | null;
    campusId?: string | null;
    studentNo?: string;
    grade?: string;
    email?: string;
    phone?: string;
  };

  const primaryRole = body.role ?? body.roles?.[0];
  if (!body.username?.trim() || !body.name?.trim() || !primaryRole) {
    return NextResponse.json({ error: "账号、姓名和主角色必填" }, { status: 400 });
  }
  if (!body.password || body.password.length < 6) {
    return NextResponse.json({ error: "初始密码至少 6 位" }, { status: 400 });
  }
  const roles = Array.from(new Set([primaryRole, ...(body.roles ?? [])])).filter(Boolean) as AppRole[];
  for (const r of roles) {
    if (!APP_ROLES.includes(r)) {
      return NextResponse.json({ error: `角色不合法：${r}` }, { status: 400 });
    }
  }
  if (roles.includes("student") && !body.classId) {
    return NextResponse.json({ error: "学生必须分配班级" }, { status: 400 });
  }

  const db = await getClient();
  const { data: exists } = await db
    .from("users")
    .select("id")
    .eq("username", body.username.trim())
    .maybeSingle();
  if (exists) {
    return NextResponse.json({ error: "账号已存在" }, { status: 400 });
  }

  // 学生组织信息由班级 -> 专业 -> 系部解析
  type ClassInfo = { grade: string | null; major_id: string | null; department_id: string | null };
  let classInfo: ClassInfo | null = null;
  if (body.classId) {
    const { data } = await db
      .from("classes")
      .select("grade,major_id,department_id")
      .eq("id", body.classId)
      .maybeSingle();
    classInfo = (data as ClassInfo | null) ?? null;
  }

  const passwordHash = await hashPassword(body.password);
  const isStudent = roles.includes("student");
  const { data, error } = await db
    .from("users")
    .insert({
      username: body.username.trim(),
      password_hash: passwordHash,
      name: body.name.trim(),
      role: primaryRole,
      class_id: isStudent ? body.classId : null,
      campus_id: body.campusId ?? null,
      student_no: isStudent ? body.studentNo?.trim() || body.username.trim() : null,
      grade: body.grade ?? classInfo?.grade ?? null,
      major_id: classInfo?.major_id ?? null,
      department_id: classInfo?.department_id ?? null,
      major: null,
      department: null,
      student_status: isStudent ? "enrolled" : null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      must_change_password: true,
    })
    .select("id,username,name,role")
    .single();

  if (error) return NextResponse.json({ error: "创建失败" }, { status: 500 });

  // 写多角色
  await db.from("user_roles").upsert(
    roles.map((r) => ({ user_id: (data as { id: string }).id, role: r })),
    { onConflict: "user_id,role" }
  );

  await writeOperationLog({
    operator: user,
    action: "create_user",
    targetType: "user",
    targetId: (data as { id: string }).id,
    detail: { username: body.username, roles },
    request,
  });
  return NextResponse.json({ data: { ...data, roles } });
}

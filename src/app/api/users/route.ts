import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole, hashPassword } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 用户列表（仅管理员），支持 role / keyword / classId 筛选
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");
  const keyword = searchParams.get("keyword")?.trim();
  const classId = searchParams.get("classId");

  const db = await getClient();
  let query = db
    .from("users")
    .select(
      "id,username,name,role,class_id,campus_id,student_no,grade,major,department,student_status,email,phone,is_active,must_change_password,failed_login_count,last_login_at,created_at,classes:class_id(name)"
    )
    .order("created_at", { ascending: true });
  if (role) query = query.eq("role", role);
  if (classId) query = query.eq("class_id", classId);
  if (keyword) {
    query = query.or(
      `username.ilike.%${keyword}%,name.ilike.%${keyword}%,student_no.ilike.%${keyword}%,phone.ilike.%${keyword}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "查询失败" }, { status: 500 });
  return NextResponse.json({ data });
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
    role?: "student" | "teacher" | "admin";
    classId?: string | null;
    campusId?: string | null;
    studentNo?: string;
    grade?: string;
    major?: string;
    department?: string;
    email?: string;
    phone?: string;
  };

  if (!body.username?.trim() || !body.name?.trim() || !body.role) {
    return NextResponse.json({ error: "账号、姓名和角色必填" }, { status: 400 });
  }
  if (!body.password || body.password.length < 6) {
    return NextResponse.json({ error: "初始密码至少 6 位" }, { status: 400 });
  }
  if (!["student", "teacher", "admin"].includes(body.role)) {
    return NextResponse.json({ error: "角色不合法" }, { status: 400 });
  }
  if (body.role === "student" && !body.classId) {
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

  // 学生年级信息快照来源
  let classGrade: string | null = null;
  if (body.classId) {
    const { data } = await db.from("classes").select("name,grade").eq("id", body.classId).maybeSingle();
    classGrade = ((data ?? {}) as { grade?: string | null }).grade ?? null;
  }

  const passwordHash = await hashPassword(body.password);
  const { data, error } = await db
    .from("users")
    .insert({
      username: body.username.trim(),
      password_hash: passwordHash,
      name: body.name.trim(),
      role: body.role,
      class_id: body.role === "student" ? body.classId : null,
      campus_id: body.campusId ?? null,
      student_no: body.role === "student" ? body.studentNo?.trim() || body.username.trim() : null,
      grade: body.grade ?? classGrade,
      major: null,
      department: null,
      student_status: body.role === "student" ? "enrolled" : null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      must_change_password: true, // 管理员创建后首次登录强制修改
    })
    .select("id,username,name,role")
    .single();

  if (error) return NextResponse.json({ error: "创建失败" }, { status: 500 });

  await writeOperationLog({
    operator: user,
    action: "create_user",
    targetType: "user",
    targetId: (data as { id: string }).id,
    detail: { username: body.username, role: body.role },
    request,
  });
  return NextResponse.json({ data });
}

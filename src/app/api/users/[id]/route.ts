import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

interface Body {
  name?: string;
  role?: "student" | "teacher" | "admin";
  classId?: string | null;
  campusId?: string | null;
  grade?: string;
  major?: string;
  department?: string;
  studentStatus?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const body = (await request.json()) as Body;
  const db = await getClient();

  const { data: target } = await db.from("users").select("role,class_id").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  const targetRow = target as { role: string; class_id: string | null };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const map: Record<keyof Body, string> = {
    name: "name",
    role: "role",
    classId: "class_id",
    campusId: "campus_id",
    grade: "grade",
    major: "major",
    department: "department",
    studentStatus: "student_status",
    email: "email",
    phone: "phone",
    isActive: "is_active",
  };
  (Object.keys(map) as Array<keyof Body>).forEach((k) => {
    if (body[k] !== undefined) patch[map[k]] = body[k] as unknown;
  });

  // 调班/角色变化：非学生不允许挂班级
  const nextRole = body.role ?? targetRow.role;
  if (nextRole !== "student") patch.class_id = null;
  if (nextRole === "student" && !patch.class_id && body.classId === undefined && !targetRow.class_id) {
    return NextResponse.json({ error: "学生必须分配班级" }, { status: 400 });
  }

  // 调班时同步组织冗余字段
  if (body.classId) {
    const { data: cls } = await db
      .from("classes")
      .select("name,grade,major,department")
      .eq("id", body.classId)
      .maybeSingle();
    if (cls) {
      const c = cls as { grade: string | null; major: string | null; department: string | null };
      patch.grade = c.grade;
      patch.major = c.major;
      patch.department = c.department;
    }
  }

  const { data, error } = await db.from("users").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "更新失败" }, { status: 500 });

  await writeOperationLog({
    operator: user,
    action: "update_user",
    targetType: "user",
    targetId: id,
    detail: { changes: Object.keys(patch).filter((k) => k !== "updated_at") },
    request,
  });
  return NextResponse.json({ data });
}

// 停用（不物理删除，历史申请引用保留）；管理员不能停用自己
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "不能停用当前登录账号" }, { status: 400 });
  }
  const db = await getClient();
  await db.from("users").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);

  await writeOperationLog({
    operator: user,
    action: "deactivate_user",
    targetType: "user",
    targetId: id,
    request,
  });
  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 班级列表：登录用户可查（注册关闭后仍需供学生/教师展示组织信息）
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const db = await getClient();
  const { data, error } = await db
    .from("classes")
    .select("*")
    .order("grade", { ascending: false })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: "查询失败" }, { status: 500 });
  // 补充中队长姓名、专业名、系部名（关系表 rel_teacher_classes 才是正式授权来源，leader 仅展示）
  const [teacherRoleRes, teacherUserRes, majorsRes, deptsRes, relRes] = await Promise.all([
    db.from("user_roles").select("user_id").eq("role", "teacher"),
    db.from("users").select("id,name,username").eq("is_active", true),
    db.from("majors").select("id,name,department_id"),
    db.from("departments").select("id,name"),
    db.from("rel_teacher_classes").select("teacher_id,class_id"),
  ]);
  const teacherIds = new Set((teacherRoleRes.data ?? []).map((r) => r.user_id as string));
  const leaderMap = new Map(
    (teacherUserRes.data ?? [])
      .filter((u) => teacherIds.has(u.id as string))
      .map((u) => [u.id as string, u]),
  );
  const majorMap = new Map((majorsRes.data ?? []).map((m) => [m.id, m]));
  const deptMap = new Map((deptsRes.data ?? []).map((d) => [d.id, d]));
  const classLeaderMap = new Map<string, string[]>();
  for (const rel of relRes.data ?? []) {
    const arr = classLeaderMap.get(rel.class_id as string) ?? [];
    arr.push(rel.teacher_id as string);
    classLeaderMap.set(rel.class_id as string, arr);
  }
  const withLeader = (data ?? []).map((c) => {
    const major = c.major_id ? majorMap.get(c.major_id as string) ?? null : null;
    const deptId = (c.department_id as string | null) ?? major?.department_id ?? null;
    const relTeacherIds = classLeaderMap.get(c.id as string) ?? [];
    return {
      ...c,
      major_name: major?.name ?? null,
      department_name: deptId ? deptMap.get(deptId)?.name ?? null : null,
      leader: c.leader_id ? leaderMap.get(c.leader_id as string) ?? null : null,
      teachers: relTeacherIds.map((tid) => leaderMap.get(tid) ?? { id: tid, name: "未知", username: "" }),
    };
  });
  return NextResponse.json({ data: withLeader });
}

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const body = (await request.json()) as {
    name?: string;
    grade?: string | null;
    leader_id?: string | null;
    campus_id?: string | null;
    description?: string | null;
    major_id?: string | null;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "班级名称必填" }, { status: 400 });
  }

  const db = await getClient();
  // 选择专业则自动带出系部，保证班级归属一致
  let departmentId: string | null = null;
  if (body.major_id) {
    const { data: major } = await db
      .from("majors")
      .select("id,department_id,is_active")
      .eq("id", body.major_id)
      .maybeSingle();
    if (!major) return NextResponse.json({ error: "所选专业不存在" }, { status: 400 });
    if (!major.is_active) return NextResponse.json({ error: "所选专业已停用" }, { status: 400 });
    departmentId = major.department_id as string;
  }
  const { data, error } = await db
    .from("classes")
    .insert({
      name: body.name.trim(),
      grade: body.grade ?? null,
      leader_id: body.leader_id ?? null,
      campus_id: body.campus_id ?? null,
      description: body.description ?? null,
      major_id: body.major_id ?? null,
      department_id: departmentId,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "创建失败" }, { status: 500 });

  // 若指定中队长，同步建立 teacher_classes 正式管理关系（幂等）
  if (body.leader_id) {
    const { data: roleRow } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", body.leader_id)
      .eq("role", "teacher")
      .maybeSingle();
    if (roleRow) {
      await db
        .from("rel_teacher_classes")
        .upsert(
          { teacher_id: body.leader_id, class_id: (data as { id: string }).id },
          { onConflict: "teacher_id,class_id" },
        );
    }
  }

  await writeOperationLog({
    operator: user,
    action: "create_class",
    targetType: "class",
    targetId: (data as { id: string }).id,
    detail: { name: body.name, majorId: body.major_id ?? null },
    request,
  });
  return NextResponse.json({ data });
}

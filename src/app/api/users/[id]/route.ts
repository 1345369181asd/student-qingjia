import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole, APP_ROLES, type AppRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";
import { handoffStudentLeaves } from "@/lib/handoff";

interface Body {
  name?: string;
  role?: AppRole;
  roles?: AppRole[];
  classId?: string | null;
  campusId?: string | null;
  grade?: string;
  studentStatus?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  transferReason?: string;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const body = (await request.json()) as Body;
  const db = await getClient();

  const { data: target } = await db
    .from("users")
    .select("role,class_id,major_id,department_id")
    .eq("id", id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  const targetRow = target as {
    role: AppRole;
    class_id: string | null;
    major_id: string | null;
    department_id: string | null;
  };

  // 当前多角色
  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", id);
  const currentRoles = (roleRows ?? []).map((r) => r.role as AppRole);

  // 计算新角色集合（显式传入 roles 时整体覆盖；否则保持）
  let nextRoles = currentRoles;
  if (Array.isArray(body.roles)) {
    nextRoles = Array.from(new Set(body.roles)).filter((r) => APP_ROLES.includes(r));
    if (nextRoles.length === 0) {
      return NextResponse.json({ error: "至少保留一个角色" }, { status: 400 });
    }
  }
  const nextPrimary = body.role ?? targetRow.role;
  if (!nextRoles.includes(nextPrimary)) nextRoles = [nextPrimary, ...nextRoles];
  const isStudent = nextRoles.includes("student");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") patch.name = body.name;
  if (body.role) patch.role = body.role;
  if (typeof body.campusId !== "undefined") patch.campus_id = body.campusId;
  if (typeof body.grade === "string") patch.grade = body.grade;
  if (typeof body.studentStatus === "string") patch.student_status = body.studentStatus;
  if (typeof body.email !== "undefined") patch.email = body.email;
  if (typeof body.phone !== "undefined") patch.phone = body.phone;
  if (typeof body.isActive === "boolean") patch.is_active = body.isActive;

  // 调班：由班级解析 专业/系部/年级，并留痕
  const transferring = typeof body.classId === "string" && body.classId !== targetRow.class_id;
  if (typeof body.classId !== "undefined") {
    if (isStudent) {
      if (!body.classId) return NextResponse.json({ error: "学生必须分配班级" }, { status: 400 });
      const { data: cls } = await db
        .from("classes")
        .select("name,grade,major_id,department_id,major,department")
        .eq("id", body.classId)
        .maybeSingle();
      if (!cls) return NextResponse.json({ error: "目标班级不存在" }, { status: 404 });
      const c = cls as {
        grade: string | null;
        major_id: string | null;
        department_id: string | null;
        major: string | null;
        department: string | null;
      };
      patch.class_id = body.classId;
      patch.grade = body.grade ?? c.grade;
      patch.major_id = c.major_id;
      patch.department_id = c.department_id;
      patch.major = c.major;
      patch.department = c.department;
    } else {
      patch.class_id = null;
    }
  }

  const { data, error } = await db.from("users").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "更新失败" }, { status: 500 });

  // 覆盖多角色
  if (Array.isArray(body.roles) || body.role) {
    const toDelete = currentRoles.filter((r) => !nextRoles.includes(r));
    const toAdd = nextRoles.filter((r) => !currentRoles.includes(r));
    if (toDelete.length > 0) {
      await db.from("user_roles").delete().eq("user_id", id).in("role", toDelete);
    }
    if (toAdd.length > 0) {
      await db.from("user_roles").upsert(
        toAdd.map((r) => ({ user_id: id, role: r })),
        { onConflict: "user_id,role" }
      );
    }
  }

  // 调班：待办自动交接给新管理关系下的审批人，并留痕
  if (transferring) {
    const affected = await handoffStudentLeaves(db, id, {
      changeType: "student_transfer",
      operatorId: user.id,
      operatorName: user.name,
      targetType: "user",
      targetId: id,
      before: {
        classId: targetRow.class_id,
        majorId: targetRow.major_id,
        departmentId: targetRow.department_id,
      },
      after: {
        classId: patch.class_id,
        majorId: patch.major_id ?? null,
        departmentId: patch.department_id ?? null,
        reason: body.transferReason ?? null,
      },
    });
    void affected;
  }

  await writeOperationLog({
    operator: user,
    action: "update_user",
    targetType: "user",
    targetId: id,
    detail: {
      changes: Object.keys(patch).filter((k) => k !== "updated_at"),
      rolesChanged: Array.isArray(body.roles),
      transferred: transferring,
    },
    request,
  });
  return NextResponse.json({ data: { ...data, roles: nextRoles } });
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

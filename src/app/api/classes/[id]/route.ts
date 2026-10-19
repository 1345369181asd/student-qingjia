import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";
import { handoffClassLeaves } from "@/lib/handoff";

interface Body {
  name?: string;
  grade?: string | null;
  leader_id?: string | null;
  campus_id?: string | null;
  description?: string | null;
  isActive?: boolean;
  major_id?: string | null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const body = (await request.json()) as Body;
  const db = await getClient();

  const { data: before } = await db
    .from("classes")
    .select("id,name,major_id,department_id,grade,leader_id")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "班级不存在" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const map: Record<keyof Body, string> = {
    name: "name",
    grade: "grade",
    leader_id: "leader_id",
    campus_id: "campus_id",
    description: "description",
    isActive: "is_active",
    major_id: "major_id",
  };
  (Object.keys(map) as Array<keyof Body>).forEach((k) => {
    if (body[k] !== undefined) patch[map[k]] = body[k] as unknown;
  });

  // 专业变更：自动同步系部；同时同步本班在籍学生的专业/系部冗余字段
  let majorChanged = false;
  if (body.major_id !== undefined) {
    majorChanged = body.major_id !== (before.major_id as string | null);
    if (body.major_id) {
      const { data: major } = await db
        .from("majors")
        .select("id,department_id")
        .eq("id", body.major_id)
        .maybeSingle();
      if (!major) return NextResponse.json({ error: "所选专业不存在" }, { status: 400 });
      patch.department_id = major.department_id;
    } else {
      patch.department_id = null;
    }
  }

  const { data, error } = await db.from("classes").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "更新失败" }, { status: 500 });

  if (majorChanged) {
    const newDeptId = (patch.department_id as string | null) ?? null;
    await db
      .from("users")
      .update({ major_id: body.major_id ?? null, department_id: newDeptId, updated_at: new Date().toISOString() })
      .eq("class_id", id)
      .eq("is_active", true);
    await db.from("management_changes").insert({
      id: crypto.randomUUID(),
      change_type: "class_major_change",
      target_type: "class",
      target_id: id,
      operator_id: user.id,
      operator_name: user.name,
      before_value: { majorId: before.major_id, departmentId: before.department_id },
      after_value: { majorId: body.major_id ?? null, departmentId: newDeptId },
    });
  }

  // 中队长变更：维护正式管理关系并交接该班在途待办（旧关系保留以兼容历史，可在关系管理页调整）
  if (body.leader_id !== undefined && body.leader_id && body.leader_id !== before.leader_id) {
    const { data: roleRow } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", body.leader_id)
      .eq("role", "teacher")
      .maybeSingle();
    if (roleRow) {
      await db
        .from("rel_teacher_classes")
        .upsert({ teacher_id: body.leader_id, class_id: id }, { onConflict: "teacher_id,class_id" });
      await handoffClassLeaves(db, id, {
        changeType: "teacher_reassign",
        operatorId: user.id,
        operatorName: user.name,
        targetType: "class",
        targetId: id,
        before: { leaderId: before.leader_id },
        after: { leaderId: body.leader_id },
      });
    }
  }

  await writeOperationLog({
    operator: user,
    action: "update_class",
    targetType: "class",
    targetId: id,
    detail: { name: body.name, majorChanged },
    request,
  });
  return NextResponse.json({ data });
}

// 班级被历史请假快照引用：停用而非物理删除
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const db = await getClient();
  await db.from("classes").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);

  await writeOperationLog({
    operator: user,
    action: "deactivate_class",
    targetType: "class",
    targetId: id,
    request,
  });
  return NextResponse.json({ success: true });
}

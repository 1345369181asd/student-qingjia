import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";
import { handoffStudentLeaves } from "@/lib/handoff";

type Params = { params: Promise<{ id: string }> };

// 转系/变更影响预览：GET /api/majors/[id]?previewReparent=<newDepartmentId>
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin", "affair", "college_leader", "head_teacher", "teacher"]);
  if (denied) return denied;
  const { id } = await params;

  const db = await getClient();
  const { data: major } = await db
    .from("majors")
    .select("*, department:departments(id, code, name)")
    .eq("id", id)
    .maybeSingle();
  if (!major) return NextResponse.json({ error: "专业不存在" }, { status: 404 });

  const newDeptId = req.nextUrl.searchParams.get("previewReparent");
  if (!newDeptId) return NextResponse.json({ data: major });

  const { data: newDept } = await db
    .from("departments")
    .select("id, name")
    .eq("id", newDeptId)
    .maybeSingle();
  if (!newDept) return NextResponse.json({ error: "目标系部不存在" }, { status: 400 });

  const { data: classes } = await db
    .from("classes")
    .select("id, name, grade")
    .eq("major_id", id);
  const classIds = (classes ?? []).map((c) => c.id);
  const { count: studentCount } = await db
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("major_id", id)
    .eq("role", "student");
  // 当前未处理事项（待审/审批中）
  const { count: pendingLeaves } = await db
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("major_id_snapshot", id)
    .in("status", ["pending", "approving"]);
  // 院领导授权变化：旧系部与新系部负责人
  const { data: oldLeaders } = await db
    .from("rel_leader_departments")
    .select("leader_id, users(name)")
    .eq("department_id", major.department_id);
  const { data: newLeaders } = await db
    .from("rel_leader_departments")
    .select("leader_id, users(name)")
    .eq("department_id", newDeptId);

  return NextResponse.json({
    data: {
      major,
      targetDepartment: newDept,
      affected: {
        classCount: classIds.length,
        classes: classes ?? [],
        studentCount: studentCount ?? 0,
        pendingLeaves: pendingLeaves ?? 0,
        oldLeaders: (oldLeaders ?? []).map((l) => l.users),
        newLeaders: (newLeaders ?? []).map((l) => l.users),
      },
    },
  });
}

// 更新专业（改名/编码/停用）
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin"]);
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json();
  const db = await getClient();
  const { data: before } = await db
    .from("majors")
    .select("*, department:departments(name)")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "专业不存在" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.code === "string" && body.code.trim()) {
    const { data: dup } = await db
      .from("majors")
      .select("id")
      .eq("code", body.code.trim())
      .neq("id", id)
      .maybeSingle();
    if (dup) return NextResponse.json({ error: "专业编码已被占用" }, { status: 400 });
    patch.code = body.code.trim();
  }
  if (typeof body.isActive === "boolean") patch.is_active = body.isActive;

  // 转系：唯一归属变更，级联同步 classes/users 的冗余系部，并留痕
  let reparented = false;
  if (typeof body.departmentId === "string" && body.departmentId && body.departmentId !== before.department_id) {
    const { data: newDept } = await db
      .from("departments")
      .select("id, name")
      .eq("id", body.departmentId)
      .maybeSingle();
    if (!newDept) return NextResponse.json({ error: "目标系部不存在" }, { status: 400 });

    patch.department_id = body.departmentId;
    await db.from("classes").update({ department_id: body.departmentId }).eq("major_id", id);
    await db
      .from("users")
      .update({ department_id: body.departmentId })
      .eq("major_id", id)
      .eq("role", "student");
    reparented = true;

    // 交接该专业学生在途单据（院领导节点审批人随之变化），并留痕
    const { data: majorStudents } = await db.from("users").select("id").eq("major_id", id);
    let affected = 0;
    for (const stu of majorStudents ?? []) {
      affected += await handoffStudentLeaves(db, stu.id as string, {
        changeType: "major_reparent",
        operatorId: auth.id,
        operatorName: auth.name,
        targetType: "major",
        targetId: id,
        before: {
          departmentId: before.department_id,
          departmentName: (before.department as { name?: string } | null)?.name,
        },
        after: {
          departmentId: body.departmentId,
          departmentName: newDept.name,
          reason: body.reason ?? null,
        },
      });
    }
    void affected;
  }

  const { error } = await db.from("majors").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeOperationLog({
    operatorId: auth.id,
    operatorName: auth.name,
    action: reparented ? "major_reparent" : "major_update",
    targetType: "major",
    targetId: id,
    detail: { before, after: patch },
  });
  return NextResponse.json({ success: true, reparented });
}

// 删除：被班级/学生引用时禁止物理删除，提示停用
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin"]);
  if (denied) return denied;
  const { id } = await params;

  const db = await getClient();
  const { count: classCount } = await db
    .from("classes")
    .select("id", { count: "exact", head: true })
    .eq("major_id", id);
  const { count: studentCount } = await db
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("major_id", id)
    .eq("role", "student");
  if ((classCount ?? 0) > 0 || (studentCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "该专业已被班级或学生引用，不能删除；如需停用请使用停用功能" },
      { status: 400 }
    );
  }
  const { error } = await db.from("majors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeOperationLog({
    operatorId: auth.id,
    operatorName: auth.name,
    action: "major_delete",
    targetType: "major",
    targetId: id,
    detail: {},
  });
  return NextResponse.json({ success: true });
}

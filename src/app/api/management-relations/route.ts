import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole, type AppRole } from "@/lib/auth";
import { handoffClassLeaves, handoffDepartmentLeaves } from "@/lib/handoff";

/**
 * 人员管理关系（与组织树分离，独立配置）
 * GET  /api/management-relations?type=teacher_classes|head_teachers|leader_departments
 * POST { type, managerId, targetId } 建立关系（幂等）
 * DELETE body { type, managerId, targetId } 解除关系
 */
type RelType = "teacher_classes" | "head_teachers" | "leader_departments";

const REL_DEF: Record<
  RelType,
  { table: string; managerCol: string; targetCol: string; managerRole: AppRole; targetTable: string; targetNameCol: string }
> = {
  teacher_classes: {
    table: "rel_teacher_classes",
    managerCol: "teacher_id",
    targetCol: "class_id",
    managerRole: "teacher",
    targetTable: "classes",
    targetNameCol: "name",
  },
  head_teachers: {
    table: "rel_head_teachers",
    managerCol: "head_teacher_id",
    targetCol: "teacher_id",
    managerRole: "head_teacher",
    targetTable: "users",
    targetNameCol: "name",
  },
  leader_departments: {
    table: "rel_leader_departments",
    managerCol: "leader_id",
    targetCol: "department_id",
    managerRole: "college_leader",
    targetTable: "departments",
    targetNameCol: "name",
  },
};

// 关系变更后交接在途待办：中队长-班级影响班级；大队长-中队长影响其名下班级并集；院领导-系部影响系部
async function handoffForRelation(
  db: SupabaseClient,
  type: RelType,
  managerId: string,
  targetId: string,
  auth: { id: string; name: string },
  adding: boolean,
): Promise<number> {
  const changeType = adding ? "relation_change" : "relation_change";
  if (type === "teacher_classes") {
    return handoffClassLeaves(db, targetId, {
      changeType,
      operatorId: auth.id,
      operatorName: auth.name,
      targetType: "teacher_class",
      targetId,
      before: adding ? null : { teacherId: managerId, classId: targetId },
      after: adding ? { teacherId: managerId, classId: targetId } : null,
    });
  }
  if (type === "head_teachers") {
    // 该大队长名下所有中队长覆盖的班级
    const { data: teacherIds } = await db
      .from("rel_head_teachers")
      .select("teacher_id")
      .eq("head_teacher_id", managerId);
    const tIds = (teacherIds ?? []).map((r) => r.teacher_id as string);
    let affected = 0;
    if (tIds.length > 0) {
      const { data: classIds } = await db
        .from("rel_teacher_classes")
        .select("class_id")
        .in("teacher_id", tIds);
      const uniq = Array.from(new Set((classIds ?? []).map((r) => r.class_id as string)));
      for (const cid of uniq) {
        affected += await handoffClassLeaves(db, cid, {
          changeType,
          operatorId: auth.id,
          operatorName: auth.name,
          targetType: "head_teacher",
          targetId: managerId,
          before: adding ? null : { headTeacherId: managerId, teacherId: targetId },
          after: adding ? { headTeacherId: managerId, teacherId: targetId } : null,
        });
      }
    }
    return affected;
  }
  // leader_departments
  return handoffDepartmentLeaves(db, targetId, {
    changeType,
    operatorId: auth.id,
    operatorName: auth.name,
    targetType: "leader_department",
    targetId,
    before: adding ? null : { leaderId: managerId, departmentId: targetId },
    after: adding ? { leaderId: managerId, departmentId: targetId } : null,
  });
}

async function listRelations(type: RelType) {
  const db = await getClient();
  const def = REL_DEF[type];
  const { data, error } = await db
    .from(def.table)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  // 批量补名称
  const managerIds = Array.from(new Set((data ?? []).map((r) => r[def.managerCol] as string)));
  const targetIds = Array.from(new Set((data ?? []).map((r) => r[def.targetCol] as string)));
  const { data: managers } = await db
    .from("users")
    .select("id, name, username")
    .in("id", managerIds.length ? managerIds : ["00000000-0000-0000-0000-000000000000"]);
  const targetCols = "id, " + def.targetNameCol;
  const { data: targets } = await db
    .from(def.targetTable)
    .select(targetCols)
    .in("id", targetIds.length ? targetIds : ["00000000-0000-0000-0000-000000000000"]);
  const mMap = new Map<string, Record<string, unknown>>((managers ?? []).map((m) => [m.id as string, m]));
  const tMap = new Map<string, Record<string, unknown>>(
    ((targets ?? []) as unknown as Array<Record<string, unknown>>).map((t) => [t.id as string, t]),
  );

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id,
    managerId: r[def.managerCol],
    targetId: r[def.targetCol],
    manager: mMap.get(r[def.managerCol] as string) ?? null,
    target: tMap.get(r[def.targetCol] as string) ?? null,
    createdAt: r.created_at,
  }));
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin"]);
  if (denied) return denied;

  const type = req.nextUrl.searchParams.get("type") as RelType | null;
  if (!type || !REL_DEF[type]) {
    return NextResponse.json({ error: "无效的关系类型" }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await listRelations(type) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function validatePair(type: RelType, managerId: string, targetId: string) {
  const db = await getClient();
  const def = REL_DEF[type];
  // 管理者必须有效且拥有对应角色
  const { data: mRoles, error: re } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", managerId)
    .eq("role", def.managerRole);
  if (re) throw re;
  if (!mRoles || mRoles.length === 0) {
    const roleText: Record<RelType, string> = {
      teacher_classes: "中队长",
      head_teachers: "大队长",
      leader_departments: "分管院领导",
    };
    throw new Error(`该账号不具备「${roleText[type]}」角色，请先在账号管理中授予`);
  }
  // 目标对象必须存在
  const { data: target } = await db
    .from(def.targetTable)
    .select("id")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) throw new Error("目标对象不存在");

  // 防循环：大队长不能把自己/形成环（A 管 B 且 B 管 A）
  if (type === "head_teachers") {
    if (managerId === targetId) throw new Error("不能将自己设为自己的下级中队长");
    const { data: cycle } = await db
      .from("rel_head_teachers")
      .select("id")
      .eq("head_teacher_id", targetId)
      .eq("teacher_id", managerId)
      .maybeSingle();
    if (cycle) throw new Error("检测到循环管理关系，已拒绝");
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin"]);
  if (denied) return denied;

  const body = await req.json();
  const type = body.type as RelType;
  const managerId = String(body.managerId ?? "");
  const targetId = String(body.targetId ?? "");
  if (!REL_DEF[type] || !managerId || !targetId) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  const db = await getClient();
  const def = REL_DEF[type];
  try {
    await validatePair(type, managerId, targetId);
    // 幂等：已存在则直接返回
    const { data: exist } = await db
      .from(def.table)
      .select("id")
      .eq(def.managerCol, managerId)
      .eq(def.targetCol, targetId)
      .maybeSingle();
    if (exist) return NextResponse.json({ success: true, idempotent: true });

    const { data, error } = await db
      .from(def.table)
      .insert({ [def.managerCol]: managerId, [def.targetCol]: targetId })
      .select("id")
      .single();
    if (error) throw error;

    const affected = await handoffForRelation(db, type, managerId, targetId, auth, true);
    return NextResponse.json({ success: true, id: data.id, handoffAffected: affected });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin"]);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const type = body.type as RelType;
  const managerId = String(body.managerId ?? "");
  const targetId = String(body.targetId ?? "");
  if (!REL_DEF[type] || !managerId || !targetId) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  const db = await getClient();
  const def = REL_DEF[type];
  const { error } = await db
    .from(def.table)
    .delete()
    .eq(def.managerCol, managerId)
    .eq(def.targetCol, targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const affected = await handoffForRelation(db, type, managerId, targetId, auth, false);
  return NextResponse.json({ success: true, handoffAffected: affected });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser } from "@/lib/auth";

/**
 * 数据范围与审批人解析（V3.2 5.2 / 6.1）
 * 组织树：系部 department -> 专业 major -> 班级 class -> 学生
 * 人员授权关系（独立配置，不依赖组织树推定）：
 *   teacher(中队长)        -> rel_teacher_classes.class_id
 *   head_teacher(大队长)   -> rel_head_teachers.teacher_id（其名下中队长的班级并集）
 *   college_leader(院领导) -> rel_leader_departments.department_id（系部下全部学生）
 *   affair(学工处)         -> 全校（一期默认全校）
 */

// 服务端 service role 绕过 RLS，统一用宽松结构
type Db = SupabaseClient<any, any, any>;

export interface StudentRef {
  class_id: string | null;
  department_id: string | null;
}

export interface UserScope {
  /** 是否全校范围（admin / affair） */
  all: boolean;
  classIds: string[];
  departmentIds: string[];
  /** 作为中队长直接管理的班级（审批节点 teacher 用） */
  teacherClassIds: string[];
  /** 名下管理的中队长 user id（head_teacher 用） */
  managedTeacherIds: string[];
}

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

export async function resolveScope(db: Db, user: AuthUser): Promise<UserScope> {
  const roles = user.roles;
  const scope: UserScope = {
    all: roles.includes("admin") || roles.includes("affair"),
    classIds: [],
    departmentIds: [],
    teacherClassIds: [],
    managedTeacherIds: [],
  };
  if (scope.all) return scope;

  // 中队长直接负责的班级
  if (roles.includes("teacher")) {
    const tc = await rows<{ class_id: string }>(
      db.from("rel_teacher_classes").select("class_id").eq("teacher_id", user.id)
    );
    scope.teacherClassIds = tc.map((r) => r.class_id);
    scope.classIds.push(...scope.teacherClassIds);
  }

  // 大队长：名下中队长覆盖班级的并集
  if (roles.includes("head_teacher")) {
    const ht = await rows<{ teacher_id: string }>(
      db.from("rel_head_teachers").select("teacher_id").eq("head_teacher_id", user.id)
    );
    scope.managedTeacherIds = ht.map((r) => r.teacher_id);
    if (scope.managedTeacherIds.length > 0) {
      const sub = await rows<{ class_id: string }>(
        db
          .from("rel_teacher_classes")
          .select("class_id")
          .in("teacher_id", scope.managedTeacherIds)
      );
      for (const cid of sub.map((r) => r.class_id)) {
        if (!scope.classIds.includes(cid)) scope.classIds.push(cid);
      }
    }
  }

  // 院领导：负责系部
  if (roles.includes("college_leader")) {
    const ld = await rows<{ department_id: string }>(
      db.from("rel_leader_departments").select("department_id").eq("leader_id", user.id)
    );
    scope.departmentIds = ld.map((r) => r.department_id);
  }

  return scope;
}

/** 判断管理者是否能看到某个学生归属（scope.all 或班级/系部命中） */
export function canAccessStudent(
  scope: UserScope,
  ref: { class_id?: string | null; department_id?: string | null }
): boolean {
  if (scope.all) return true;
  if (ref.class_id && scope.classIds.includes(ref.class_id)) return true;
  if (ref.department_id && scope.departmentIds.includes(ref.department_id)) return true;
  return false;
}

/**
 * 按审批节点角色 + 学生归属，解析该节点的合格处理人 user id 列表。
 * 任一合格人员处理即可（不会签）。
 */
export async function resolveApproverIds(
  db: Db,
  nodeRole: string,
  studentRef: StudentRef
): Promise<string[]> {
  if (nodeRole === "teacher" || nodeRole === "中队长") {
    const rels = await rows<{ teacher_id: string }>(
      db.from("rel_teacher_classes").select("teacher_id").eq("class_id", studentRef.class_id ?? "")
    );
    return filterActiveUsers(db, rels.map((r) => r.teacher_id), "teacher");
  }

  if (nodeRole === "head_teacher" || nodeRole === "大队长") {
    const tc = await rows<{ teacher_id: string }>(
      db.from("rel_teacher_classes").select("teacher_id").eq("class_id", studentRef.class_id ?? "")
    );
    const teacherIds = tc.map((r) => r.teacher_id);
    if (teacherIds.length === 0) return [];
    const heads = await rows<{ head_teacher_id: string }>(
      db.from("rel_head_teachers").select("head_teacher_id").in("teacher_id", teacherIds)
    );
    return filterActiveUsers(db, heads.map((r) => r.head_teacher_id), "head_teacher");
  }

  if (nodeRole === "college_leader" || nodeRole === "院领导" || nodeRole === "系主任") {
    const rels = await rows<{ leader_id: string }>(
      db
        .from("rel_leader_departments")
        .select("leader_id")
        .eq("department_id", studentRef.department_id ?? "")
    );
    return filterActiveUsers(db, rels.map((r) => r.leader_id), "college_leader");
  }

  if (nodeRole === "affair" || nodeRole === "学工处") {
    const data = await rows<{ user_id: string }>(
      db.from("user_roles").select("user_id").eq("role", "affair")
    );
    return filterActiveUsers(db, data.map((r) => r.user_id), "affair");
  }

  if (nodeRole === "admin" || nodeRole === "管理员") {
    const data = await rows<{ user_id: string }>(
      db.from("user_roles").select("user_id").eq("role", "admin")
    );
    return filterActiveUsers(db, data.map((r) => r.user_id), "admin");
  }

  return [];
}

// 仅保留启用且确实拥有该角色的账号（先取关系，再批量校验启用态，避免嵌入式 join 兼容问题）
async function filterActiveUsers(db: Db, ids: string[], role: string): Promise<string[]> {
  const uniq = Array.from(new Set(ids));
  if (uniq.length === 0) return [];
  const roleRows = await rows<{ user_id: string }>(
    db.from("user_roles").select("user_id").eq("role", role).in("user_id", uniq)
  );
  const withRole = new Set(roleRows.map((r) => r.user_id));
  const activeRows = await rows<{ id: string }>(
    db.from("users").select("id").eq("is_active", true).in("id", uniq)
  );
  const active = new Set(activeRows.map((r) => r.id));
  return uniq.filter((id) => withRole.has(id) && active.has(id));
}

/** 判断某用户是否为某单据当前节点的合格审批人 */
export async function isEligibleApprover(
  db: Db,
  nodeRole: string,
  userId: string,
  userRoles: string[],
  studentRef: StudentRef
): Promise<boolean> {
  if (userRoles.includes("admin") && nodeRole === "admin") return true;
  if (!nodeRoleMappedToUser(nodeRole, userRoles)) return false;
  const ids = await resolveApproverIds(db, nodeRole, studentRef);
  return ids.includes(userId);
}

function nodeRoleMappedToUser(nodeRole: string, roles: string[]): boolean {
  const map: Record<string, string> = {
    teacher: "teacher",
    中队长: "teacher",
    head_teacher: "head_teacher",
    大队长: "head_teacher",
    affair: "affair",
    学工处: "affair",
    college_leader: "college_leader",
    院领导: "college_leader",
    系主任: "college_leader",
    admin: "admin",
    管理员: "admin",
  };
  const need = map[nodeRole];
  return !!need && roles.includes(need);
}

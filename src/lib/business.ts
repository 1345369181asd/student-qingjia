// 业务通用工具：时长计算、申请编号、围栏校验、流程解析

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  sick: "病假",
  personal: "事假",
  public: "公假",
  family: "家庭事假",
  other: "其他",
};

export const LEAVE_STATUS_LABEL: Record<string, string> = {
  pending: "待审批",
  approving: "审批中",
  approved: "已通过",
  rejected: "已驳回",
  revoked: "已撤销",
};

export const DURATION_RULE_VERSION = "0.5day-v1";

// 实际时长（分钟）：end - start，按自然时间差，由起止时间决定，审批不修改
export function calcDurationMinutes(
  start: Date | string,
  end: Date | string
): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.round((e - s) / 60000);
}

// 实际时长（小时，保留1位小数，仅展示用）
export function calcDurationHours(start: Date | string, end: Date | string): number {
  const mins = calcDurationMinutes(start, end);
  return Math.round((mins / 60) * 10) / 10;
}

// 折算天数：向上取整到 0.5 天（V3.2：ceil(实际分钟 / 720) * 0.5）
// 例：18 小时=1080 分钟 -> ceil(1.5)=2 -> 1 天；25 小时 -> 2 天
export function calcDurationDays(start: Date | string, end: Date | string): number {
  return minutesToDays(calcDurationMinutes(start, end));
}

export function minutesToDays(minutes: number): number {
  return Math.ceil(minutes / 720) * 0.5;
}

// 判断一条请假是否“未结束”（占用请假链）：
// - 待审批/审批中：始终占用
// - 已批准：离校类完成销假前一直占用；非离校类到期自然结束（以 now 对账）
// - 已驳回/已撤销/已完成销假：不占用
export function isLeaveActive(
  leave: {
    status: string;
    checkin_status?: string | null;
    leave_school?: boolean | null;
    end_time?: string | null;
  },
  now: Date = new Date()
): boolean {
  if (leave.status === "pending" || leave.status === "approving") return true;
  if (leave.status === "approved") {
    if (leave.checkin_status === "done") return false;
    if (leave.leave_school) return true; // 离校：销假前始终占用（含逾期未销假）
    return !!leave.end_time && new Date(leave.end_time).getTime() > now.getTime();
  }
  return false;
}

type DbClient = Awaited<ReturnType<typeof import("@/lib/db").getClient>>;

// 查询学生当前占用未结束链的单据（非离校到期自动对账释放）
export async function findActiveLeave(
  db: DbClient,
  studentId: string
): Promise<{ id: string; request_no: string; status: string } | null> {
  const { data: user } = await db
    .from("users")
    .select("active_leave_id")
    .eq("id", studentId)
    .maybeSingle();
  const activeId = (user as { active_leave_id: string | null } | null)?.active_leave_id ?? null;
  if (!activeId) return null;
  const { data: leave } = await db
    .from("leave_requests")
    .select("id,request_no,status,checkin_status,leave_school,end_time")
    .eq("id", activeId)
    .maybeSingle();
  if (!leave) {
    await releaseActiveLeave(db, studentId, activeId);
    return null;
  }
  const lv = leave as {
    id: string;
    request_no: string;
    status: string;
    checkin_status: string | null;
    leave_school: boolean | null;
    end_time: string | null;
  };
  if (!isLeaveActive(lv)) {
    await releaseActiveLeave(db, studentId, lv.id);
    return null;
  }
  return { id: lv.id, request_no: lv.request_no, status: lv.status };
}

// 仅当占用的就是该单据时清空，避免误释放新单
export async function releaseActiveLeave(db: DbClient, studentId: string, leaveId: string): Promise<void> {
  await db
    .from("users")
    .update({ active_leave_id: null })
    .eq("id", studentId)
    .eq("active_leave_id", leaveId);
}

// 原子占用：仅在学生当前无占用时成功，防止并发重复提交
export async function acquireActiveLeave(
  db: DbClient,
  studentId: string,
  leaveId: string
): Promise<boolean> {
  const { data, error } = await db
    .rpc("acquire_leave_chain", { p_student: studentId, p_leave: leaveId })
    .maybeSingle();
  if (!error) {
    // PostgREST 对返回 jsonb 标量的函数可能包一层以函数名命名的键
    const raw = data as
      | { ok?: boolean; acquire_leave_chain?: { ok?: boolean } }
      | null;
    const payload: { ok?: boolean } | null = raw?.acquire_leave_chain ?? raw;
    return Boolean(payload?.ok);
  }
  // 兜底：RPC 不存在时退化为条件更新（低并发演示场景可接受）
  const { error: upErr } = await db
    .from("users")
    .update({ active_leave_id: leaveId })
    .eq("id", studentId)
    .is("active_leave_id", null);
  return !upErr;
}

// 生成申请编号：LJ-YYYYMMDD-XXXX（当日随机序号，唯一性由数据库 unique 再兜底）
export function genRequestNo(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `LJ-${ymd}-${seq}`;
}

// Haversine 距离（米）
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 点是否在多边形内（射线法）
function pointInPolygon(lat: number, lng: number, polygon: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;
    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface FenceResult {
  inFence: boolean;
  distanceMeters: number | null;
}

// 后端围栏校验：圆形或多边形，边界容差由校区配置
export function checkFence(
  lat: number,
  lng: number,
  campus: {
    centerLat: number | null;
    centerLng: number | null;
    radiusMeters: number | null;
    polygon: Array<{ lat: number; lng: number }> | null;
    boundaryToleranceMeters: number | null;
  }
): FenceResult {
  const tolerance = campus.boundaryToleranceMeters ?? 0;
  const polygon = Array.isArray(campus.polygon) ? campus.polygon : null;

  if (polygon && polygon.length >= 3) {
    const inside = pointInPolygon(lat, lng, polygon);
    if (inside) return { inFence: true, distanceMeters: null };
    // 多边形外：按到各边最近距离近似（演示环境容差内也算在围栏内）
    let min = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      min = Math.min(min, distToSegment(lat, lng, a.lat, a.lng, b.lat, b.lng));
    }
    return { inFence: min <= tolerance, distanceMeters: Math.round(min) };
  }

  if (campus.centerLat != null && campus.centerLng != null && campus.radiusMeters != null) {
    const dist = haversine(lat, lng, campus.centerLat, campus.centerLng);
    return { inFence: dist <= campus.radiusMeters + tolerance, distanceMeters: Math.round(dist) };
  }
  // 校区未配置围栏：默认不通过（不能假造在校结果）
  return { inFence: false, distanceMeters: null };
}

function distToSegment(
  lat: number,
  lng: number,
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  // 简化：用经纬度平面近似（小范围围栏误差可接受）
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const px = lat * metersPerDegLat;
  const py = lng * metersPerDegLng;
  const ax = lat1 * metersPerDegLat;
  const ay = lng1 * metersPerDegLng;
  const bx = lat2 * metersPerDegLat;
  const by = lng2 * metersPerDegLng;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// 从审批流节点中解析某个学生当前节点的实际审批人 id
// role=teacher：优先节点 assigneeId，否则取学生班级配置的中队长；
// role=admin：优先节点 assigneeId，否则 null（找不到审批人 -> 异常待办）
export async function resolveApproverId(
  node: { role: string; assigneeId?: string | null },
  student: { id: string; classId: string | null },
  db: Awaited<ReturnType<typeof import("@/lib/db").getClient>>
): Promise<string | null> {
  if (node.assigneeId) return node.assigneeId;
  if (node.role === "teacher") {
    if (!student.classId) return null;
    const { data } = await db
      .from("classes")
      .select("leader_id")
      .eq("id", student.classId)
      .maybeSingle();
    const leaderId = (data as { leader_id: string | null } | null)?.leader_id ?? null;
    return leaderId;
  }
  return null;
}

// 根据请假类型 + 折算天数 + 是否离校匹配审批流（priority 主权重，条件更具体者优先）
export function matchFlow<T extends {
  leave_type_code: string | null;
  min_days?: number | null;
  max_days?: number | null;
  require_leave_school: boolean | null;
  priority: number | null;
  nodes: Array<unknown>;
  is_active: boolean | null;
}>(
  flows: T[],
  leaveType: string,
  durationDays: number,
  leaveSchool: boolean
): T | null {
  const matched = flows.filter((f) => {
    if (f.is_active === false) return false;
    if (f.leave_type_code && f.leave_type_code !== leaveType) return false;
    if ((f.min_days ?? 0) > durationDays) return false;
    if (f.max_days != null && durationDays > f.max_days) return false;
    if (f.require_leave_school != null && f.require_leave_school !== leaveSchool) return false;
    return Array.isArray(f.nodes) && f.nodes.length > 0;
  });
  matched.sort((a, b) => {
    // 排序优先级（逐位比较，前者决定）：
    // 1) priority（流程配置主权重，离校/长假等强规则配置更高优先级）
    // 2) 限定请假类型 > 全类型
    // 3) 时长区间更窄（上限更小 / 下限更大）更具体
    // 4) 是否限定离校
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pb !== pa) return pb - pa;
    const typeA = a.leave_type_code ? 1 : 0;
    const typeB = b.leave_type_code ? 1 : 0;
    if (typeB !== typeA) return typeB - typeA;
    const widthA = (a.max_days ?? Number.MAX_SAFE_INTEGER) - (a.min_days ?? 0);
    const widthB = (b.max_days ?? Number.MAX_SAFE_INTEGER) - (b.min_days ?? 0);
    if (widthA !== widthB) return widthA - widthB;
    const lsA = a.require_leave_school != null ? 1 : 0;
    const lsB = b.require_leave_school != null ? 1 : 0;
    return lsB - lsA;
  });
  return matched[0] ?? null;
}

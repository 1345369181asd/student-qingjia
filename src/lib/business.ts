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
  in_progress: "审批中",
  approved: "已通过",
  rejected: "已驳回",
  cancelled: "已撤销",
};

// 计算请假时长（小时，保留1位小数），按北京时间自然时间差
export function calcDurationHours(start: Date | string, end: Date | string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.round(((e - s) / 3600000) * 10) / 10;
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

// 根据请假类型与时长匹配审批流（优先级：条件最具体 + priority 高者）
export function matchFlow<T extends {
  leaveTypeCode: string | null;
  minHours: number | null;
  maxHours: number | null;
  requireLeaveSchool: boolean | null;
  priority: number | null;
  nodes: Array<unknown>;
  isActive: boolean | null;
}>(
  flows: T[],
  leaveType: string,
  durationHours: number,
  leaveSchool: boolean
): T | null {
  const matched = flows.filter((f) => {
    if (f.isActive === false) return false;
    if (f.leaveTypeCode && f.leaveTypeCode !== leaveType) return false;
    if ((f.minHours ?? 0) > durationHours) return false;
    if (f.maxHours != null && durationHours > f.maxHours) return false;
    if (f.requireLeaveSchool != null && f.requireLeaveSchool !== leaveSchool) return false;
    return Array.isArray(f.nodes) && f.nodes.length > 0;
  });
  matched.sort((a, b) => {
    // 排序优先级（逐位比较，前者决定）：
    // 1) priority（流程配置主权重）
    // 2) 限定请假类型 > 全类型
    // 3) 同时长类型下时长区间更窄（上限更小 / 下限更大）更具体
    // 4) 是否限定离校
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pb !== pa) return pb - pa;
    const typeA = a.leaveTypeCode ? 1 : 0;
    const typeB = b.leaveTypeCode ? 1 : 0;
    if (typeB !== typeA) return typeB - typeA;
    const widthA = (a.maxHours ?? Number.MAX_SAFE_INTEGER) - (a.minHours ?? 0);
    const widthB = (b.maxHours ?? Number.MAX_SAFE_INTEGER) - (b.minHours ?? 0);
    if (widthA !== widthB) return widthA - widthB;
    const lsA = a.requireLeaveSchool != null ? 1 : 0;
    const lsB = b.requireLeaveSchool != null ? 1 : 0;
    return lsB - lsA;
  });
  return matched[0] ?? null;
}

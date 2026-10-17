import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  real,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============================================================
// 组织结构：班级 / 校区 / 请假类型 / 审批流程配置
// ============================================================

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  grade: text("grade"),
  major: text("major"), // 专业
  department: text("department"), // 院系 / 大队 / 系部
  leaderId: uuid("leader_id"), // 负责中队长（users.id，逻辑关联，避免迁移环）
  campusId: uuid("campus_id"), // 所属校区
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const campuses = pgTable("campuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address"),
  // 圆形围栏：圆心 + 半径（米）
  centerLat: real("center_lat"),
  centerLng: real("center_lng"),
  radiusMeters: integer("radius_meters"),
  // 多边形围栏：[{lat,lng}, ...]
  polygon: jsonb("polygon").$type<Array<{ lat: number; lng: number }>>(),
  boundaryToleranceMeters: integer("boundary_tolerance_meters").default(50),
  minAccuracyMeters: integer("min_accuracy_meters").default(100),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const leaveTypes = pgTable("leave_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // personal / sick / other ...
  name: text("name").notNull(),
  needProof: boolean("need_proof").default(false),
  proofDesc: text("proof_desc"),
  maxDaysLimit: real("max_days_limit"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 审批流程配置（演示配置：按请假类型 + 时长阈值匹配，顺序多节点）
export const approvalFlows = pgTable("approval_flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  leaveTypeCode: text("leave_type_code"), // null 表示全部类型
  // 时长区间（按 0.5 天折算后的天数，V3.2 规则）
  minDays: real("min_days").default(0),
  maxDays: real("max_days"), // null 表示无上限
  // 旧小时字段（保留兼容，新匹配逻辑不再读取）
  minHours: real("min_hours").default(0),
  maxHours: real("max_hours"),
  requireLeaveSchool: boolean("require_leave_school"), // null=不限；true=仅离校；false=仅不离校
  // 节点：[{ order, name, role: 'teacher'|'admin', assigneeId? }]
  nodes: jsonb("nodes")
    .$type<Array<{ order: number; name: string; role: "teacher" | "admin"; assigneeId?: string | null }>>()
    .notNull(),
  priority: integer("priority").default(0), // 数字越大优先级越高
  isActive: boolean("is_active").default(true),
  version: integer("version").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// ============================================================
// 用户 / 账号
// ============================================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  // student=学生 teacher=中队长（教师） admin=系统管理员
  role: text("role").notNull(),
  classId: uuid("class_id"),
  campusId: uuid("campus_id"),
  studentNo: text("student_no"), // 学号（学生）
  grade: text("grade"),
  major: text("major"),
  department: text("department"),
  // 学籍状态：enrolled 在读 / suspended 休学 / graduated 毕业
  studentStatus: text("student_status").default("enrolled"),
  email: text("email"),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  mustChangePassword: boolean("must_change_password").default(false),
  failedLoginCount: integer("failed_login_count").default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  // 当前占用“未结束请假链”的单据 id（V3.2：同一学生同一时刻仅允许一条未结束链）
  activeLeaveId: uuid("active_leave_id"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// ============================================================
// 请假申请
// ============================================================

export const leaveRequests = pgTable("leave_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestNo: text("request_no").notNull().unique(), // 唯一申请编号 LJ-YYYYMMDD-XXXX
  studentId: uuid("student_id")
    .notNull()
    .references(() => users.id),
  // 组织快照（调班后保留申请当时信息）
  studentNoSnapshot: text("student_no_snapshot"),
  studentNameSnapshot: text("student_name_snapshot"),
  classNameSnapshot: text("class_name_snapshot"),
  departmentSnapshot: text("department_snapshot"),

  leaveType: text("leave_type").notNull(), // 对应 leave_types.code
  leaveTypeName: text("leave_type_name"),
  reason: text("reason").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  // 实际分钟数（由起止时间差计算，审批不修改）
  durationMinutes: integer("duration_minutes"),
  // 折算天数：向上取整到 0.5 天（V3.2 计时规则）
  durationDays: real("duration_days"),
  durationRuleVersion: text("duration_rule_version").notNull().default("0.5day-v1"),
  // 实际小时数（展示用，兼容旧数据）；审批流匹配已改用 durationDays
  durationHours: real("duration_hours").notNull().default(0),
  leaveSchool: boolean("leave_school").default(false), // 是否离校
  sleepOutside: boolean("sleep_outside").default(false), // 是否外宿
  destination: text("destination"), // 外出地点
  contactPhone: text("contact_phone"),

  // 审批状态：pending 待审批 / approving 审批中 / approved 已批准 / rejected 已驳回 / revoked 已撤销
  status: text("status").notNull().default("pending"),
  currentNodeOrder: integer("current_node_order").default(0),
  flowSnapshot: jsonb("flow_snapshot").$type<{
    flowId: string;
    version: number;
    nodes: Array<{ order: number; name: string; role: string; assigneeId?: string | null }>;
  }>(),

  // 销假状态：none 未申请 / pending 待确认 / rejected 已驳回 / done 已销假
  checkinStatus: text("checkin_status").notNull().default("none"),
  checkinLat: real("checkin_lat"),
  checkinLng: real("checkin_lng"),
  checkinAccuracy: real("checkin_accuracy"),
  checkinAt: timestamp("checkin_at", { withTimezone: true }),
  checkinInFence: boolean("checkin_in_fence"),
  checkinMethod: text("checkin_method"), // gps / manual
  checkinCampusId: uuid("checkin_campus_id"),
  checkinRemark: text("checkin_remark"),
  returnConfirmedAt: timestamp("return_confirmed_at", { withTimezone: true }),
  returnConfirmerId: uuid("return_confirmer_id"),
  isOverdue: boolean("is_overdue").default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// 审批记录（每个节点一条）
export const approvalRecords = pgTable("approval_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  leaveRequestId: uuid("leave_request_id")
    .notNull()
    .references(() => leaveRequests.id, { onDelete: "cascade" }),
  nodeOrder: integer("node_order").notNull(),
  nodeName: text("node_name").notNull(),
  approverId: uuid("approver_id").notNull(),
  approverName: text("approver_name"),
  action: text("action").notNull(), // approved / rejected
  comment: text("comment"),
  batchId: uuid("batch_id"), // 批量审批批次
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 打卡 / 销假申请历史（每次提交一条，支持驳回后重新打卡）
export const checkins = pgTable("checkins", {
  id: uuid("id").primaryKey().defaultRandom(),
  leaveRequestId: uuid("leave_request_id")
    .notNull()
    .references(() => leaveRequests.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  accuracy: real("accuracy"),
  clientLocatedAt: timestamp("client_located_at", { withTimezone: true }),
  serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).defaultNow().notNull(),
  inFence: boolean("in_fence").notNull(),
  method: text("method").notNull().default("gps"), // gps / manual
  campusId: uuid("campus_id"),
  campusName: text("campus_name"),
  // pending 待确认 / approved 确认销假 / rejected 驳回
  status: text("status").notNull().default("pending"),
  reviewerId: uuid("reviewer_id"),
  reviewerName: text("reviewer_name"),
  reviewComment: text("review_comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  batchId: uuid("batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 附件
export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  leaveRequestId: uuid("leave_request_id")
    .notNull()
    .references(() => leaveRequests.id, { onDelete: "cascade" }),
  fileKey: text("file_key").notNull(), // 对象存储 key
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  uploadedBy: uuid("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 站内消息 / 待办
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: text("type").notNull(), // approval_todo / node_pass / final_approved / rejected / revoked / checkin_todo / checkin_result / overdue / abnormal
  title: text("title").notNull(),
  content: text("content"),
  leaveRequestId: uuid("leave_request_id"),
  isRead: boolean("is_read").default(false),
  isTodo: boolean("is_todo").default(false),
  todoDone: boolean("todo_done").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 预警规则
export const alertRules = pgTable("alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // 结束后宽限小时数，达到后提醒
  graceHours: real("grace_hours").default(0),
  // 提醒角色：teacher 中队长 / admin
  targetRole: text("target_role").notNull().default("teacher"),
  escalateHours: real("escalate_hours"), // 升级间隔（小时），达到后升级提醒管理员
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 预警记录（幂等，防止重复提醒）
export const alertRecords = pgTable("alert_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  leaveRequestId: uuid("leave_request_id").notNull(),
  ruleId: uuid("rule_id").notNull(),
  level: integer("level").default(1), // 1=中队长 2=升级
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 操作日志
export const operationLogs = pgTable("operation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  operatorId: uuid("operator_id"),
  operatorName: text("operator_name"),
  action: text("action").notNull(),
  targetType: text("target_type"), // leave / user / class / campus / flow ...
  targetId: text("target_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// Relations
// ============================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  class: one(classes, { fields: [users.classId], references: [classes.id] }),
  campus: one(campuses, { fields: [users.campusId], references: [campuses.id] }),
  leaves: many(leaveRequests, { relationName: "student_leaves" }),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  campus: one(campuses, { fields: [classes.campusId], references: [campuses.id] }),
  students: many(users),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one, many }) => ({
  student: one(users, {
    fields: [leaveRequests.studentId],
    references: [users.id],
    relationName: "student_leaves",
  }),
  approvals: many(approvalRecords),
  checkins: many(checkins),
  files: many(attachments),
}));

export const approvalRecordsRelations = relations(approvalRecords, ({ one }) => ({
  leaveRequest: one(leaveRequests, {
    fields: [approvalRecords.leaveRequestId],
    references: [leaveRequests.id],
  }),
}));

export const checkinsRelations = relations(checkins, ({ one }) => ({
  leaveRequest: one(leaveRequests, {
    fields: [checkins.leaveRequestId],
    references: [leaveRequests.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  leaveRequest: one(leaveRequests, {
    fields: [attachments.leaveRequestId],
    references: [leaveRequests.id],
  }),
}));

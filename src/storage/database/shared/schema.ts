import { pgTable, serial, timestamp, varchar, text, integer, date, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// Classes table
export const classes = pgTable(
  "classes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 100 }).notNull(),
    grade: varchar("grade", { length: 50 }).notNull(),
    description: text("description"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("classes_name_idx").on(table.name),
    index("classes_grade_idx").on(table.grade),
  ]
);

// Users table (students, teachers, admins)
export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    username: varchar("username", { length: 50 }).notNull().unique(),
    password_hash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().default("student"),
    class_id: varchar("class_id", { length: 36 }).references(() => classes.id),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 20 }),
    is_active: varchar("is_active", { length: 5 }).default("true").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("users_username_idx").on(table.username),
    index("users_role_idx").on(table.role),
    index("users_class_id_idx").on(table.class_id),
  ]
);

// Leave requests table
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    student_id: varchar("student_id", { length: 36 }).notNull().references(() => users.id),
    leave_type: varchar("leave_type", { length: 20 }).notNull(),
    start_date: date("start_date").notNull(),
    end_date: date("end_date").notNull(),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    teacher_id: varchar("teacher_id", { length: 36 }).references(() => users.id),
    approval_comment: text("approval_comment"),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("leave_requests_student_id_idx").on(table.student_id),
    index("leave_requests_teacher_id_idx").on(table.teacher_id),
    index("leave_requests_status_idx").on(table.status),
    index("leave_requests_leave_type_idx").on(table.leave_type),
    index("leave_requests_created_at_idx").on(table.created_at),
  ]
);

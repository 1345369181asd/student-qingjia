import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { LEAVE_TYPE_LABEL, LEAVE_STATUS_LABEL } from "@/lib/business";
import { writeOperationLog } from "@/lib/logger";

interface ExportRow {
  request_no: string;
  student_id: string;
  student_no_snapshot: string | null;
  student_name_snapshot: string | null;
  class_name_snapshot: string | null;
  department_snapshot?: string | null;
  major_name_snapshot?: string | null;
  grade_snapshot?: string | null;
  leave_type: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  duration_minutes: number | null;
  duration_days: number | null;
  leave_school: boolean;
  status: string;
  reason: string;
  checkin_status: string;
  checkin_at: string | null;
  is_overdue: boolean;
  created_at: string;
}

export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const leaveType = searchParams.get("leave_type") || undefined;
  const classId = searchParams.get("class_id") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  const db = await getClient();
  let q = db
    .from("leave_requests")
    .select(
      "request_no, student_id, student_no_snapshot, student_name_snapshot, department_snapshot, major_name_snapshot, grade_snapshot, class_name_snapshot, leave_type, start_time, end_time, duration_hours, duration_minutes, duration_days, leave_school, status, reason, checkin_status, checkin_at, is_overdue, created_at"
    )
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  if (leaveType) q = q.eq("leave_type", leaveType);
  if (from) q = q.gte("start_time", from);
  if (to) q = q.lte("start_time", `${to}T23:59:59+08:00`);

  if (user.role === "student") {
    q = q.eq("student_id", user.id);
  } else if (user.role === "teacher") {
    const { data: led } = await db.from("classes").select("id").eq("leader_id", user.id);
    const ownClassIds = (led ?? []).map((c) => (c as { id: string }).id);
    if (classId && ownClassIds.includes(classId)) {
      q = q.eq("class_name_snapshot", (await db.from("classes").select("name").eq("id", classId).maybeSingle())?.data?.name ?? "");
    } else {
      const { data: studentRows } = await db.from("users").select("id").in("class_id", ownClassIds);
      const ids = (studentRows ?? []).map((s) => (s as { id: string }).id);
      q = ids.length ? q.in("student_id", ids) : q.eq("student_id", "__none__");
    }
  } else if (classId) {
    const { data: studentRows } = await db.from("users").select("id").eq("class_id", classId);
    const ids = (studentRows ?? []).map((s) => (s as { id: string }).id);
    q = ids.length ? q.in("student_id", ids) : q.eq("student_id", "__none__");
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "导出失败" }, { status: 500 });
  const rows = (data ?? []) as ExportRow[];

  const formatDt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "");
  const checkinText: Record<string, string> = {
    none: "未销假",
    pending: "待确认",
    confirmed: "已确认",
    rejected: "已驳回",
    manual: "人工核验",
    done: "已销假",
  };

  const csv = toCsv(
    ["请假编号", "学号", "姓名", "系部", "专业", "年级", "班级", "请假类型", "开始时间", "结束时间", "实际时长(小时)", "折算天数(0.5天/半日)", "是否离校", "状态", "事由", "销假状态", "销假时间", "是否逾期", "提交时间"],
    rows.map((r) => [
      r.request_no,
      r.student_no_snapshot ?? "",
      r.student_name_snapshot ?? "",
      r.department_snapshot ?? "",
      r.major_name_snapshot ?? "",
      r.grade_snapshot ?? "",
      r.class_name_snapshot ?? "",
      LEAVE_TYPE_LABEL[r.leave_type as keyof typeof LEAVE_TYPE_LABEL] ?? r.leave_type,
      formatDt(r.start_time),
      formatDt(r.end_time),
      String(Math.round((r.duration_minutes ?? r.duration_hours * 60) / 60 * 100) / 100),
      String(r.duration_days ?? ""),
      r.leave_school ? "是" : "否",
      LEAVE_STATUS_LABEL[r.status as keyof typeof LEAVE_STATUS_LABEL] ?? r.status,
      r.reason,
      checkinText[r.checkin_status] ?? r.checkin_status,
      formatDt(r.checkin_at),
      r.is_overdue ? "是" : "否",
      formatDt(r.created_at),
    ])
  );

  if (user.role === "admin") {
    await writeOperationLog({
      operator: user,
      action: "export_leaves",
      targetType: "leave",
      detail: { status, leaveType, classId, from, to, count: rows.length },
      request,
    });
  }

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leaves_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

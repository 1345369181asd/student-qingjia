import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { LEAVE_TYPE_LABEL } from "@/lib/business";

type LeaveRow = {
  id: string;
  student_id: string;
  leave_type: string;
  status: string;
  duration_hours: number;
  duration_days: number | null;
  reason: string;
  created_at: string;
  class_name_snapshot: string | null;
  checkin_status: string;
  is_overdue: boolean;
};

// 统计报表：按班级/类型/时间维度，支持销假率、审批人处理量
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可查看统计" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id") || undefined;
  const leaveType = searchParams.get("leave_type") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  const db = await getClient();
  let q = db
    .from("leave_requests")
    .select(
      "id,student_id,leave_type,status,duration_hours,duration_days,reason,created_at,class_name_snapshot,checkin_status,is_overdue"
    );
  if (classId) {
    const { data: stuRows } = await db.from("users").select("id").eq("class_id", classId);
    const ids = (stuRows ?? []).map((s) => s.id as string);
    q = ids.length > 0 ? q.in("student_id", ids) : q.eq("student_id", "00000000-0000-0000-0000-000000000000");
  }
  if (leaveType) q = q.eq("leave_type", leaveType);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", `${to}T23:59:59+08:00`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: `统计失败: ${error.message}` }, { status: 500 });
  const leaves = (data ?? []) as LeaveRow[];

  const finished = leaves.filter((l) => l.status === "approved");
  const summary = {
    total: leaves.length,
    approved: leaves.filter((l) => l.status === "approved").length,
    rejected: leaves.filter((l) => l.status === "rejected").length,
    revoked: leaves.filter((l) => l.status === "revoked").length,
    pending: leaves.filter((l) => ["pending", "approving"].includes(l.status)).length,
    checkedIn: finished.filter((l) => l.checkin_status === "done").length,
    checkinRate: finished.length > 0 ? Math.round((finished.filter((l) => l.checkin_status === "done").length / finished.length) * 1000) / 10 : 0,
    overdue: leaves.filter((l) => l.is_overdue).length,
  };

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byClass: Record<string, number> = {};
  const byDate: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const byDuration: Record<string, number> = {
    "0.5天以内": 0,
    "1天": 0,
    "1.5-3天": 0,
    "3天以上": 0,
  };

  for (const l of leaves) {
    byType[LEAVE_TYPE_LABEL[l.leave_type] ?? l.leave_type] =
      (byType[LEAVE_TYPE_LABEL[l.leave_type] ?? l.leave_type] ?? 0) + 1;
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    const className = l.class_name_snapshot || "未分班";
    byClass[className] = (byClass[className] ?? 0) + 1;
    const day = (l.created_at || "").slice(0, 10);
    if (day) byDate[day] = (byDate[day] ?? 0) + 1;
    const reason = l.reason?.trim();
    if (reason) {
      const key = reason.length > 12 ? `${reason.slice(0, 12)}…` : reason;
      byReason[key] = (byReason[key] ?? 0) + 1;
    }
    const d = l.duration_days ?? Math.ceil((l.duration_hours * 60) / 720) * 0.5;
    if (d <= 0.5) byDuration["0.5天以内"] += 1;
    else if (d <= 1) byDuration["1天"] += 1;
    else if (d <= 3) byDuration["1.5-3天"] += 1;
    else byDuration["3天以上"] += 1;
  }

  // 审批人处理量
  const leaveIds = leaves.map((l) => l.id);
  const { data: records } =
    leaveIds.length > 0
      ? await db.from("approval_records").select("approver_name,action").in("leave_request_id", leaveIds)
      : { data: [] };
  const approverCount: Record<string, { name: string; approved: number; rejected: number }> = {};
  for (const r of (records ?? []) as Array<{ approver_name: string | null; action: string }>) {
    if (!r.approver_name) continue;
    if (!approverCount[r.approver_name]) {
      approverCount[r.approver_name] = { name: r.approver_name, approved: 0, rejected: 0 };
    }
    if (r.action === "approved") approverCount[r.approver_name].approved += 1;
    if (r.action === "rejected") approverCount[r.approver_name].rejected += 1;
  }

  return NextResponse.json({
    data: {
      summary,
      byType,
      byStatus,
      byClass,
      byDate,
      byReason,
      byDuration,
      approverStats: Object.values(approverCount),
    },
  });
}

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { closeTodos, createMessage } from "@/lib/notify";
import { writeOperationLog } from "@/lib/logger";
import { releaseActiveLeave } from "@/lib/business";
import { resolveScope } from "@/lib/scope";

// 批量销假确认（逐条校验管理范围，驳回不开放批量，避免误操作）
export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const canReview =
    user.roles.includes("teacher") ||
    user.roles.includes("head_teacher") ||
    user.roles.includes("admin") ||
    user.roles.includes("affair");
  if (!canReview) {
    return NextResponse.json({ error: "无销假确认权限" }, { status: 403 });
  }
  const body = (await request.json()) as { ids?: string[]; comment?: string };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "请选择至少一条销假申请" }, { status: 400 });
  }

  const db = await getClient();
  const batchId = randomUUID();
  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  // 管理范围：管理员/学工处全校；中队长所带班级；大队长名下中队长覆盖班级
  const scope = await resolveScope(db, user);
  const classIds = scope.all ? null : new Set(scope.classIds);

  for (const id of body.ids) {
    const { data: leave } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
    if (!leave) {
      results.push({ id, ok: false, reason: "申请不存在" });
      continue;
    }
    const lv = leave as {
      id: string;
      student_id: string;
      status: string;
      checkin_status: string;
      request_no: string;
    };
    if (lv.status !== "approved" || lv.checkin_status !== "pending") {
      results.push({ id, ok: false, reason: "非待确认状态" });
      continue;
    }
    const { data: student } = await db
      .from("users")
      .select("class_id")
      .eq("id", lv.student_id)
      .maybeSingle();
    const classId = (student as { class_id: string | null } | null)?.class_id;
    if (!classId || (classIds !== null && !classIds.has(classId))) {
      results.push({ id, ok: false, reason: "不在管理范围" });
      continue;
    }

    const { data: pending } = await db
      .from("checkins")
      .select("id")
      .eq("leave_request_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pending) {
      results.push({ id, ok: false, reason: "无待确认打卡" });
      continue;
    }
    const nowIso = new Date().toISOString();
    await db
      .from("checkins")
      .update({
        status: "approved",
        reviewer_id: user.id,
        reviewer_name: user.name,
        review_comment: body.comment?.trim() || null,
        reviewed_at: nowIso,
        batch_id: batchId,
      })
      .eq("id", (pending as { id: string }).id);
    await db
      .from("leave_requests")
      .update({
        checkin_status: "done",
        return_confirmed_at: nowIso,
        return_confirmer_id: user.id,
        is_overdue: false,
      })
      .eq("id", id);
    await closeTodos(id);
    await releaseActiveLeave(db, lv.student_id, id);
    await createMessage({
      userId: lv.student_id,
      type: "checkin_result",
      title: `销假已确认：${lv.request_no}`,
      content: "中队长已确认您返校销假",
      leaveRequestId: id,
    });
    results.push({ id, ok: true });
  }

  await writeOperationLog({
    operator: user,
    action: "batch_confirm_checkin",
    targetType: "checkin",
    detail: { batchId, total: body.ids.length, success: results.filter((r) => r.ok).length },
    request,
  });

  return NextResponse.json({
    data: {
      batchId,
      total: body.ids.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    },
  });
}

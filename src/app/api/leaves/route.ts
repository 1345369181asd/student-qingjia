import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  DURATION_RULE_VERSION,
  calcDurationMinutes,
  calcDurationHours,
  calcDurationDays,
  genRequestNo,
  matchFlow,
  findActiveLeave,
  acquireActiveLeave,
} from "@/lib/business";
import { resolveScope, resolveApproverIds } from "@/lib/scope";
import { createMessage } from "@/lib/notify";
import { writeOperationLog } from "@/lib/logger";

// 查询请假：学生=本人；中队长=负责班级学生；管理员=全部；支持组合筛选
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const checkinStatus = searchParams.get("checkinStatus");
  const studentNo = searchParams.get("studentNo")?.trim();
  const studentName = searchParams.get("studentName")?.trim();
  const classId = searchParams.get("classId");
  const overdue = searchParams.get("overdue");
  const scope = searchParams.get("scope");
  const startFrom = searchParams.get("startFrom");
  const startTo = searchParams.get("startTo");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));

  const db = await getClient();

  // 数据范围：学生=本人；管理角色按 resolveScope（班级/系部并集；admin/affair 全校）
  const isStudentOnly = user.roles.length === 1 && user.roles[0] === "student";
  const scopeInfo = await resolveScope(db, user);

  // 管理范围对应的学生 id 集合（按班级或系部）
  let scopedStudentIds: string[] | null = null;
  if (!isStudentOnly && !scopeInfo.all) {
    const studentQ = db.from("users").select("id").eq("role", "student");
    const ors: string[] = [];
    if (scopeInfo.classIds.length > 0) ors.push(`class_id.in.(${scopeInfo.classIds.join(",")})`);
    if (scopeInfo.departmentIds.length > 0)
      ors.push(`department_id.in.(${scopeInfo.departmentIds.join(",")})`);
    const { data: scopedStudents } =
      ors.length > 0 ? await studentQ.or(ors.join(",")) : { data: [] };
    scopedStudentIds = (scopedStudents ?? []).map((s) => s.id as string);
  }

  let query = db.from("leave_requests").select("*");

  if (isStudentOnly) {
    query = query.eq("student_id", user.id);
  } else if (!scopeInfo.all) {
    query =
      scopedStudentIds && scopedStudentIds.length > 0
        ? query.in("student_id", scopedStudentIds)
        : query.eq("student_id", "00000000-0000-0000-0000-000000000000");
  }

  // 待办：基于该用户未完成的 approval_todo 消息精确匹配
  let todoLeaveIds: string[] | null = null;
  if (scope === "todo" && user.role !== "student") {
    const { data: todos } = await db
      .from("messages")
      .select("leave_request_id")
      .eq("user_id", user.id)
      .eq("type", "approval_todo")
      .eq("is_todo", true)
      .eq("todo_done", false);
    todoLeaveIds = Array.from(
      new Set((todos ?? []).map((t) => t.leave_request_id as string | null).filter((v): v is string => !!v))
    );
    query = todoLeaveIds.length > 0 ? query.in("id", todoLeaveIds) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (status) {
    query = query.eq("status", status);
  }
  if (type) query = query.eq("leave_type", type);
  if (checkinStatus) query = query.eq("checkin_status", checkinStatus);
  if (classId) {
    const { data: classStudents } = await db
      .from("users")
      .select("id")
      .eq("class_id", classId)
      .eq("role", "student");
    const ids = (classStudents ?? []).map((s) => s.id as string);
    query = ids.length > 0 ? query.in("student_id", ids) : query.eq("student_id", "00000000-0000-0000-0000-000000000000");
  }
  if (studentNo) query = query.ilike("student_no_snapshot", `%${studentNo}%`);
  if (studentName) query = query.ilike("student_name_snapshot", `%${studentName}%`);
  if (startFrom) query = query.gte("start_time", startFrom);
  if (startTo) query = query.lte("start_time", startTo);
  if (overdue === "1") query = query.eq("is_overdue", true);

  query = query.order("created_at", { ascending: false });

  const { data: all, error } = await query;
  if (error) {
    return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });
  }

  // 关联表查询在多 FK 场景不稳定，降级：先取主表，再批量补 approvals/files/checkins
  const ids = (all ?? []).map((r) => r.id as string);
  type ApprovalRow = Record<string, unknown>;
  type FileRow = Record<string, unknown>;
  type CheckinRow = { created_at: string } & Record<string, unknown>;
  type StudentRow = {
    id: string;
    name: string;
    username: string;
    student_no: string;
    class_id: string | null;
    classes?: { name: string | null } | null;
  };
  let approvalMap = new Map<string, ApprovalRow[]>();
  let filesMap = new Map<string, FileRow[]>();
  let checkinsMap = new Map<string, CheckinRow[]>();
  let studentMap = new Map<string, StudentRow>();

  if (ids.length > 0) {
    const [{ data: approvals }, { data: files }, { data: checkinRows }, { data: students }] =
      await Promise.all([
        db.from("approval_records").select("*").in("leave_request_id", ids),
        db.from("attachments").select("id,file_name,content_type,file_size,created_at,leave_request_id").in("leave_request_id", ids),
        db.from("checkins").select("*").in("leave_request_id", ids),
        db
          .from("users")
          .select("id,name,username,student_no,class_id")
          .in(
            "id",
            (all ?? []).map((r) => r.student_id as string)
          ),
      ]);
    approvalMap = groupBy((approvals ?? []) as ApprovalRow[], "leave_request_id");
    filesMap = groupBy((files ?? []) as FileRow[], "leave_request_id");
    checkinsMap = groupBy((checkinRows ?? []) as CheckinRow[], "leave_request_id");
    // 班级名映射
    const classIds = Array.from(
      new Set(
        (students ?? [])
          .map((s) => (s as { class_id: string | null }).class_id)
          .filter((v): v is string => !!v)
      )
    );
    const { data: classRows } =
      classIds.length > 0 ? await db.from("classes").select("id,name").in("id", classIds) : { data: [] };
    const classNameMap = new Map((classRows ?? []).map((c) => [c.id as string, c.name as string]));
    const typedStudents = (students ?? []) as Array<Omit<StudentRow, "classes">>;
    studentMap = new Map(
      typedStudents.map((s) => [
        s.id,
        {
          ...s,
          classes: s.class_id ? { name: classNameMap.get(s.class_id) ?? null } : null,
        },
      ])
    );
  }

  let rows = (all ?? []).map((r) => ({
    ...r,
    approvals: (approvalMap.get(r.id as string) ?? []).sort(
      (a, b) => Number(a.node_order) - Number(b.node_order)
    ),
    files: filesMap.get(r.id as string) ?? [],
    checkin_records: (checkinsMap.get(r.id as string) ?? []).sort(
      (a, b) =>
        new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
    ),
    student: studentMap.get(r.student_id as string) ?? {
      name: r.student_name_snapshot,
      username: r.student_no_snapshot,
      student_no: r.student_no_snapshot,
      class_id: null,
      classes: { name: r.class_name_snapshot },
    },
  }));

  const total = rows.length;
  const startIdx = (page - 1) * pageSize;
  rows = rows.slice(startIdx, startIdx + pageSize);

  return NextResponse.json({ data: rows, total, page, pageSize });
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = row[key] as string;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(row);
  }
  return map;
}

// 学生创建请假
export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "student") {
    return NextResponse.json({ error: "仅学生可以提交请假申请" }, { status: 403 });
  }

  const body = (await request.json()) as {
    leaveType?: string;
    reason?: string;
    startTime?: string;
    endTime?: string;
    leaveSchool?: boolean;
    sleepOutside?: boolean;
    destination?: string;
    contactPhone?: string;
  };

  if (!body.leaveType || !body.reason?.trim() || !body.startTime || !body.endTime) {
    return NextResponse.json({ error: "请完整填写请假类型、事由和起止时间" }, { status: 400 });
  }
  const start = new Date(body.startTime);
  const end = new Date(body.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "结束时间必须晚于开始时间" }, { status: 400 });
  }
  // V3.2 计时：实际分钟数 / 实际小时数（展示）/ 折算天数（审批路由与统计用）
  const durationMinutes = calcDurationMinutes(start, end);
  const durationHours = calcDurationHours(start, end);
  const durationDays = calcDurationDays(start, end);

  const db = await getClient();

  // 请假类型有效
  const { data: typeRow } = await db
    .from("leave_types")
    .select("code,name,max_days_limit")
    .eq("code", body.leaveType)
    .eq("is_active", true)
    .maybeSingle();
  if (!typeRow) {
    return NextResponse.json({ error: "请假类型无效或已停用" }, { status: 400 });
  }
  const maxDaysLimit = (typeRow as { max_days_limit?: number | null }).max_days_limit ?? null;
  if (maxDaysLimit != null && durationDays > Number(maxDaysLimit)) {
    return NextResponse.json(
      { error: `该类型单次请假不得超过 ${maxDaysLimit} 天（本次折算 ${durationDays} 天）` },
      { status: 400 }
    );
  }

  // 规则一：同一学生同一时刻只允许存在一条“未结束普通请假链”
  // （待审批/审批中/已批准待销假，即使时间不重叠也拦截）
  const active = await findActiveLeave(db, user.id);
  if (active) {
    const statusLabel =
      active.status === "pending"
        ? "待审批"
        : active.status === "approving"
          ? "审批中"
          : "已批准待销假";
    return NextResponse.json(
      {
        error: `您已有一条未结束的请假申请 ${active.request_no}（${statusLabel}），请等待其审批结束或完成销假后再提交`,
        code: "ACTIVE_CHAIN_EXISTS",
        activeLeaveId: active.id,
      },
      { status: 409 }
    );
  }

  // 规则二（防御性保留）：时间重叠校验，防止并发提交穿透
  const { data: conflicts } = await db
    .from("leave_requests")
    .select("id,request_no,start_time,end_time,status,checkin_status")
    .eq("student_id", user.id)
    .in("status", ["pending", "approving", "approved"])
    .or(`checkin_status.is.null,checkin_status.neq.done`);
  const overlapped = (conflicts ?? []).filter((c) => {
    const cs = new Date(c.start_time as string).getTime();
    const ce = new Date(c.end_time as string).getTime();
    return start.getTime() < ce && end.getTime() > cs;
  });
  if (overlapped.length > 0) {
    return NextResponse.json(
      {
        error: `与已有请假申请 ${(overlapped[0] as { request_no: string }).request_no} 的时间存在冲突，请勿重复申请`,
      },
      { status: 409 }
    );
  }

  const leaveSchool = body.leaveSchool ?? false;

  // 匹配审批流（按折算天数 + 是否离校）
  const { data: flows } = await db.from("approval_flows").select("*").eq("is_active", true);
  const flow = matchFlow(
    (flows ?? []) as Array<{
      leave_type_code: string | null;
      min_days: number | null;
      max_days: number | null;
      require_leave_school: boolean | null;
      priority: number | null;
      nodes: Array<unknown>;
      is_active: boolean | null;
    }>,
    body.leaveType,
    durationDays,
    leaveSchool
  );
  if (!flow) {
    return NextResponse.json(
      { error: "未匹配到审批流程，请联系管理员配置审批规则" },
      { status: 422 }
    );
  }

  // 学生与组织快照（系部/专业/年级/班级，调班不影响历史单据）
  const { data: student } = await db
    .from("users")
    .select(
      "id,name,username,student_no,class_id,grade,major_id,department_id,department,major,classes:class_id(name),majors:major_id(id,name),departments:department_id(id,name)"
    )
    .eq("id", user.id)
    .maybeSingle();
  const s = student as {
    id: string;
    name: string;
    username: string;
    student_no: string | null;
    class_id: string | null;
    grade: string | null;
    major_id: string | null;
    department_id: string | null;
    department: string | null;
    major: string | null;
    classes?: { name: string } | null;
    majors?: { id: string; name: string } | null;
    departments?: { id: string; name: string } | null;
  } | null;

  const typedFlow = flow as unknown as {
    id: string;
    version: number;
    nodes: Array<{ order: number; name: string; role: string; assigneeId?: string | null }>;
  };
  const firstNode = typedFlow.nodes[0];
  // 按管理关系解析首节点合格审批人（任一合格人员处理即可）
  const approverIds = firstNode.assigneeId
    ? [firstNode.assigneeId]
    : await resolveApproverIds(db, firstNode.role, {
        class_id: s?.class_id ?? null,
        department_id: s?.department_id ?? null,
      });
  const approverId = approverIds[0] ?? null;

  // 唯一编号重试（极少冲突）
  let requestNo = genRequestNo();
  for (let i = 0; i < 3; i++) {
    const { data: dup } = await db
      .from("leave_requests")
      .select("id")
      .eq("request_no", requestNo)
      .maybeSingle();
    if (!dup) break;
    requestNo = genRequestNo();
  }

  const { data: leave, error } = await db
    .from("leave_requests")
    .insert({
      request_no: requestNo,
      student_id: user.id,
      student_no_snapshot: s?.student_no ?? s?.username ?? user.username,
      student_name_snapshot: s?.name ?? user.name,
      class_name_snapshot: s?.classes?.name ?? null,
      department_snapshot: s?.departments?.name ?? s?.department ?? null,
      major_id_snapshot: s?.major_id ?? null,
      major_name_snapshot: s?.majors?.name ?? s?.major ?? null,
      grade_snapshot: s?.grade ?? null,
      leave_type: body.leaveType,
      leave_type_name: (typeRow as { name: string }).name,
      reason: body.reason.trim(),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: durationMinutes,
      duration_days: durationDays,
      duration_rule_version: DURATION_RULE_VERSION,
      duration_hours: durationHours,
      leave_school: leaveSchool,
      sleep_outside: body.sleepOutside ?? false,
      destination: body.destination?.trim() || null,
      contact_phone: body.contactPhone?.trim() || null,
      status: "pending",
      current_node_order: 0,
      flow_snapshot: {
        flowId: typedFlow.id,
        version: typedFlow.version ?? 1,
        nodes: typedFlow.nodes,
      },
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: `创建失败: ${error.message}` }, { status: 500 });
  }
  const leaveId = (leave as { id: string }).id;

  // 原子占用未结束链（并发兜底：占用失败说明刚有另一条提交成功，回滚本单）
  const acquired = await acquireActiveLeave(db, user.id, leaveId);
  if (!acquired) {
    await db.from("leave_requests").delete().eq("id", leaveId).eq("student_id", user.id);
    return NextResponse.json(
      { error: "您已有一条未结束的请假申请，请勿重复提交", code: "ACTIVE_CHAIN_EXISTS" },
      { status: 409 }
    );
  }

  await writeOperationLog({
    operator: user,
    action: "create_leave",
    targetType: "leave",
    targetId: leaveId,
    detail: {
      requestNo,
      type: body.leaveType,
      durationMinutes,
      durationHours,
      durationDays,
      ruleVersion: DURATION_RULE_VERSION,
      flow: (flow as unknown as { name?: string }).name ?? null,
    },
    request,
  });

  // 首个节点审批人待办：合格审批人都收到（任一处理即关闭其余，不做会签）
  const approverIdList = approverIds;
  if (approverIdList.length > 0) {
    for (const uid of approverIdList) {
      await createMessage({
        userId: uid,
        type: "approval_todo",
        title: `新的请假申请待审批：${s?.name ?? user.name}（${(typeRow as { name: string }).name}，计 ${durationDays} 天）`,
        content: body.reason.trim(),
        leaveRequestId: leaveId,
        isTodo: true,
      });
    }
  } else {
    // 找不到审批人 -> 发给全部管理员作为异常待办，绝不自动批准/跳过
    const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
    for (const a of admins ?? []) {
      await createMessage({
        userId: a.user_id as string,
        type: "abnormal",
        title: `异常待办：申请 ${requestNo} 未找到「${firstNode.name}」审批人`,
        content: "请检查该学生班级的中队长配置、各级管理关系或流程节点审批人配置",
        leaveRequestId: leaveId,
        isTodo: true,
      });
    }
  }

  return NextResponse.json({
    data: {
      id: leaveId,
      requestNo,
      durationMinutes,
      durationHours,
      durationDays,
      durationRuleVersion: DURATION_RULE_VERSION,
      flowName: (flow as unknown as { name?: string }).name ?? null,
      nodes: typedFlow.nodes,
    },
  });
}

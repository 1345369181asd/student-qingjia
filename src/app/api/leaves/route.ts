import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { calcDurationHours, genRequestNo, matchFlow, resolveApproverId } from "@/lib/business";
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

  // 中队长数据范围：其作为 leader_id 的班级
  let scopedClassIds: string[] | null = null;
  if (user.role === "teacher") {
    const { data: ledClasses } = await db
      .from("classes")
      .select("id")
      .eq("leader_id", user.id)
      .eq("is_active", true);
    scopedClassIds = (ledClasses ?? []).map((c) => c.id as string);
  }

  // 中队长范围：先查出范围内学生 id
  let scopedStudentIds: string[] | null = null;
  if (user.role === "teacher") {
    if (scopedClassIds && scopedClassIds.length > 0) {
      const { data: scopedStudents } = await db
        .from("users")
        .select("id")
        .in("class_id", scopedClassIds)
        .eq("role", "student");
      scopedStudentIds = (scopedStudents ?? []).map((s) => s.id as string);
    } else {
      scopedStudentIds = [];
    }
  }

  let query = db.from("leave_requests").select("*");

  if (user.role === "student") query = query.eq("student_id", user.id);
  if (user.role === "teacher") {
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
  const duration = calcDurationHours(start, end);

  const db = await getClient();

  // 请假类型有效
  const { data: typeRow } = await db
    .from("leave_types")
    .select("code,name")
    .eq("code", body.leaveType)
    .eq("is_active", true)
    .maybeSingle();
  if (!typeRow) {
    return NextResponse.json({ error: "请假类型无效或已停用" }, { status: 400 });
  }

  // 时间冲突校验：与本人 pending/approving/approved 且未销假的申请时间重叠
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

  // 匹配审批流
  const { data: flows } = await db.from("approval_flows").select("*").eq("is_active", true);
  const flow = matchFlow(
    (flows ?? []) as Array<{
      leaveTypeCode: string | null;
      minHours: number | null;
      maxHours: number | null;
      requireLeaveSchool: boolean | null;
      priority: number | null;
      nodes: Array<unknown>;
      isActive: boolean | null;
    }>,
    body.leaveType,
    duration,
    leaveSchool
  );
  if (!flow) {
    return NextResponse.json(
      { error: "未匹配到审批流程，请联系管理员配置审批规则" },
      { status: 422 }
    );
  }

  // 学生与组织快照
  const { data: student } = await db
    .from("users")
    .select("id,name,username,student_no,class_id,department,classes:class_id(name)")
    .eq("id", user.id)
    .maybeSingle();
  const s = student as {
    id: string;
    name: string;
    username: string;
    student_no: string | null;
    class_id: string | null;
    department: string | null;
    classes?: { name: string } | null;
  } | null;

  const typedFlow = flow as unknown as {
    id: string;
    version: number;
    nodes: Array<{ order: number; name: string; role: "teacher" | "admin"; assigneeId?: string | null }>;
  };
  const firstNode = typedFlow.nodes[0];
  const approverId = await resolveApproverId(
    firstNode,
    { id: user.id, classId: s?.class_id ?? null },
    db
  );

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
      department_snapshot: s?.department ?? null,
      leave_type: body.leaveType,
      leave_type_name: (typeRow as { name: string }).name,
      reason: body.reason.trim(),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_hours: duration,
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

  await writeOperationLog({
    operator: user,
    action: "create_leave",
    targetType: "leave",
    targetId: leaveId,
    detail: { requestNo, type: body.leaveType, duration, flow: (flow as unknown as { name?: string }).name ?? null },
    request,
  });

  // 首个节点审批人待办；找不到审批人 -> 发给管理员作为异常待办，绝不自动批准
  const todoUserId = approverId ?? null;
  if (todoUserId) {
    await createMessage({
      userId: todoUserId,
      type: "approval_todo",
      title: `新的请假申请待审批：${s?.name ?? user.name}（${(typeRow as { name: string }).name}，${duration}小时）`,
      content: body.reason.trim(),
      leaveRequestId: leaveId,
      isTodo: true,
    });
  } else {
    const { data: admin } = await db.from("users").select("id").eq("role", "admin").limit(1).maybeSingle();
    if (admin) {
      await createMessage({
        userId: (admin as { id: string }).id,
        type: "abnormal",
        title: `异常待办：申请 ${requestNo} 未找到「${firstNode.name}」审批人`,
        content: "请检查班级中队长配置或流程节点审批人配置",
        leaveRequestId: leaveId,
        isTodo: true,
      });
    }
  }

  return NextResponse.json({
    data: {
      id: leaveId,
      requestNo,
      durationHours: duration,
      flowName: (flow as unknown as { name?: string }).name ?? null,
      nodes: typedFlow.nodes,
    },
  });
}

import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { genRequestNo, calcDurationHours } from "@/lib/business";

// 初始化演示数据（重复执行幂等：先清业务数据再插入）
export async function POST() {
  const db = await getClient();

  // 按依赖顺序清空
  for (const t of [
    "operation_logs",
    "alert_records",
    "messages",
    "attachments",
    "checkins",
    "approval_records",
    "leave_requests",
    "users",
    "approval_flows",
    "leave_types",
    "classes",
    "campuses",
    "alert_rules",
  ]) {
    await db.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  // 校区（围栏：北京天安门附近模拟坐标，半径 500 米）
  const { data: mainCampus } = await db
    .from("campuses")
    .insert({
      name: "主校区",
      address: "北京市东城区示范路 1 号",
      center_lat: 39.9087,
      center_lng: 116.3975,
      radius_meters: 500,
      boundary_tolerance_meters: 50,
      min_accuracy_meters: 100,
    })
    .select()
    .single();
  const campus = mainCampus as { id: string } | null;

  const { data: eastCampus } = await db
    .from("campuses")
    .insert({
      name: "东校区",
      address: "北京市朝阳区示范路 2 号",
      center_lat: 39.9163,
      center_lng: 116.4551,
      radius_meters: 400,
      boundary_tolerance_meters: 50,
      min_accuracy_meters: 100,
    })
    .select()
    .single();

  // 用户（先插教师/管理员，拿到 id 再给班级指定中队长）
  const adminHash = await hashPassword("admin123");
  const teacherHash = await hashPassword("teacher123");
  const studentHash = await hashPassword("student123");

  const { data: adminRow } = await db
    .from("users")
    .insert({
      username: "admin",
      password_hash: adminHash,
      name: "系统管理员",
      role: "admin",
    })
    .select()
    .single();

  const { data: teacherRow } = await db
    .from("users")
    .insert({
      username: "T2024001",
      password_hash: teacherHash,
      name: "张中队长",
      role: "teacher",
      phone: "13800000001",
    })
    .select()
    .single();

  const { data: teacher2Row } = await db
    .from("users")
    .insert({
      username: "T2024002",
      password_hash: teacherHash,
      name: "李中队长",
      role: "teacher",
      phone: "13800000002",
    })
    .select()
    .single();

  const adminId = (adminRow as { id: string }).id;
  const teacherId = (teacherRow as { id: string }).id;
  const teacher2Id = (teacher2Row as { id: string }).id;

  // 班级
  const { data: cls1 } = await db
    .from("classes")
    .insert({
      name: "计算机2401班",
      grade: "2024级",
      major: "计算机科学与技术",
      department: "信息工程系",
      leader_id: teacherId,
      campus_id: campus?.id ?? null,
      description: "软件方向",
    })
    .select()
    .single();
  const { data: cls2 } = await db
    .from("classes")
    .insert({
      name: "计算机2402班",
      grade: "2024级",
      major: "软件工程",
      department: "信息工程系",
      leader_id: teacher2Id,
      campus_id: campus?.id ?? null,
      description: "软件方向",
    })
    .select()
    .single();
  const { data: cls3 } = await db
    .from("classes")
    .insert({
      name: "数学2401班",
      grade: "2024级",
      major: "应用数学",
      department: "基础部",
      leader_id: teacherId,
      campus_id: eastCampus ? (eastCampus as { id: string }).id : null,
      description: "数学师范",
    })
    .select()
    .single();

  const class1Id = (cls1 as { id: string }).id;
  const class2Id = (cls2 as { id: string }).id;
  const class3Id = (cls3 as { id: string }).id;

  // 学生（含一名强制改密的新生）
  const students = [
    { username: "S2024001", name: "王小明", cls: class1Id, no: "S2024001" },
    { username: "S2024002", name: "李小红", cls: class1Id, no: "S2024002" },
    { username: "S2024003", name: "赵小刚", cls: class2Id, no: "S2024003" },
    { username: "S2024004", name: "刘小美", cls: class3Id, no: "S2024004" },
  ];
  const studentIds: Record<string, string> = {};
  for (const s of students) {
    const { data } = await db
      .from("users")
      .insert({
        username: s.username,
        password_hash: studentHash,
        name: s.name,
        role: "student",
        class_id: s.cls,
        campus_id: campus?.id ?? null,
        student_no: s.no,
        grade: "2024级",
        major: s.cls === class3Id ? "应用数学" : "计算机相关",
        department: s.cls === class3Id ? "基础部" : "信息工程系",
        student_status: "enrolled",
        phone: `139${s.no.slice(-8)}`,
        must_change_password: s.username === "S2024004",
      })
      .select()
      .single();
    studentIds[s.username] = (data as { id: string }).id;
  }

  // 请假类型
  await db.from("leave_types").insert([
    { code: "sick", name: "病假", sort_order: 1 },
    { code: "personal", name: "事假", sort_order: 2 },
    { code: "other", name: "其他", sort_order: 3 },
  ]);

  // 审批流（演示配置）
  // 1. 病假 <=24 小时：单级中队长
  await db.from("approval_flows").insert({
    name: "病假一级审批（24小时内）",
    leave_type_code: "sick",
    min_hours: 0,
    max_hours: 24,
    nodes: [{ order: 0, name: "中队长审批", role: "teacher" }],
    priority: 10,
  });
  // 2. 病假 >24 小时：中队长 + 管理员 两级
  await db.from("approval_flows").insert({
    name: "病假两级审批（超过24小时）",
    leave_type_code: "sick",
    min_hours: 24.01,
    max_hours: null,
    nodes: [
      { order: 0, name: "中队长审批", role: "teacher" },
      { order: 1, name: "学工处审批", role: "admin" },
    ],
    priority: 20,
  });
  // 3. 事假：统一两级审批
  await db.from("approval_flows").insert({
    name: "事假两级审批",
    leave_type_code: "personal",
    min_hours: 0,
    max_hours: null,
    nodes: [
      { order: 0, name: "中队长审批", role: "teacher" },
      { order: 1, name: "学工处审批", role: "admin" },
    ],
    priority: 5,
  });
  // 4. 其他/默认：中队长一级
  await db.from("approval_flows").insert({
    name: "通用一级审批",
    leave_type_code: null,
    min_hours: 0,
    max_hours: null,
    nodes: [{ order: 0, name: "中队长审批", role: "teacher" }],
    priority: 0,
  });

  // 预警规则（演示阈值，非校规）
  await db.from("alert_rules").insert([
    { name: "结束后2小时未销假提醒中队长", grace_hours: 2, target_role: "teacher", escalate_hours: 24 },
  ]);

  const now = Date.now();
  const iso = (offsetH: number) => new Date(now + offsetH * 3600000).toISOString();

  // 演示请假数据
  const leaves = [
    {
      student: "S2024001",
      type: "sick",
      typeName: "病假",
      start: iso(-48),
      end: iso(-20), // 已结束、已批准、已销假
      reason: "感冒发烧需要就医休息",
      leaveSchool: false,
      status: "approved",
      checkin: {
        status: "done" as const,
        lat: 39.9092,
        lng: 116.3978,
        accuracy: 20,
        inFence: true,
        method: "gps",
        atOffset: -19,
      },
      approvals: [
        { order: 0, name: "中队长审批", approver: teacherId, approverName: "张中队长", action: "approved", comment: "注意休息，按时服药" },
      ],
    },
    {
      student: "S2024002",
      type: "sick",
      typeName: "病假",
      start: iso(-30),
      end: iso(-6), // 已结束、已批准、未销假 -> 超时预警
      reason: "去医院检查牙齿",
      leaveSchool: true,
      status: "approved",
      checkin: null,
      approvals: [
        { order: 0, name: "中队长审批", approver: teacherId, approverName: "张中队长", action: "approved", comment: "同意" },
      ],
    },
    {
      student: "S2024003",
      type: "personal",
      typeName: "事假",
      start: iso(24),
      end: iso(72),
      reason: "家中有事需要回家处理",
      leaveSchool: true,
      status: "approving", // 两级流程：中队长已通过，待管理员
      currentNode: 1,
      approvals: [
        { order: 0, name: "中队长审批", approver: teacher2Id, approverName: "李中队长", action: "approved", comment: "情况属实" },
      ],
    },
    {
      student: "S2024001",
      type: "sick",
      typeName: "病假",
      start: iso(-72),
      end: iso(-60),
      reason: "肠胃炎",
      leaveSchool: false,
      status: "approved",
      checkin: {
        status: "pending" as const, // 已打卡待中队长确认
        lat: 39.9095,
        lng: 116.3981,
        accuracy: 35,
        inFence: true,
        method: "gps",
        atOffset: -59,
      },
      approvals: [
        { order: 0, name: "中队长审批", approver: teacherId, approverName: "张中队长", action: "approved", comment: "同意" },
      ],
    },
    {
      student: "S2024002",
      type: "other",
      typeName: "其他",
      start: iso(48),
      end: iso(96),
      reason: "参加学术论文答辩",
      leaveSchool: true,
      status: "rejected",
      approvals: [
        { order: 0, name: "中队长审批", approver: teacherId, approverName: "张中队长", action: "rejected", comment: "时间过长，请调整后重新提交" },
      ],
    },
    {
      student: "S2024004",
      type: "sick",
      typeName: "病假",
      start: iso(2),
      end: iso(10),
      reason: "发烧需要休息一天",
      leaveSchool: false,
      status: "pending", // 待中队长审批
      approvals: [],
    },
  ];

  for (const lv of leaves) {
    const sId = studentIds[lv.student];
    const duration = calcDurationHours(lv.start, lv.end);
    const snapshot = {
      S2024001: { no: "S2024001", name: "王小明", cls: "计算机2401班", dept: "信息工程系" },
      S2024002: { no: "S2024002", name: "李小红", cls: "计算机2401班", dept: "信息工程系" },
      S2024003: { no: "S2024003", name: "赵小刚", cls: "计算机2402班", dept: "信息工程系" },
      S2024004: { no: "S2024004", name: "刘小美", cls: "数学2401班", dept: "基础部" },
    }[lv.student]!;

    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        request_no: genRequestNo(new Date(now - 86400000)),
        student_id: sId,
        student_no_snapshot: snapshot.no,
        student_name_snapshot: snapshot.name,
        class_name_snapshot: snapshot.cls,
        department_snapshot: snapshot.dept,
        leave_type: lv.type,
        leave_type_name: lv.typeName,
        reason: lv.reason,
        start_time: lv.start,
        end_time: lv.end,
        duration_hours: duration,
        leave_school: lv.leaveSchool,
        sleep_outside: false,
        destination: lv.leaveSchool ? "回家" : null,
        contact_phone: "13900000000",
        status: lv.status,
        current_node_order: "currentNode" in lv ? (lv as { currentNode: number }).currentNode : lv.status === "approved" || lv.status === "rejected" ? 99 : 0,
        checkin_status: lv.checkin?.status ?? "none",
        checkin_lat: lv.checkin?.lat ?? null,
        checkin_lng: lv.checkin?.lng ?? null,
        checkin_accuracy: lv.checkin?.accuracy ?? null,
        checkin_at: lv.checkin ? iso(lv.checkin.atOffset) : null,
        checkin_in_fence: lv.checkin?.inFence ?? null,
        checkin_method: lv.checkin?.method ?? null,
        checkin_campus_id: lv.checkin ? campus?.id : null,
        return_confirmed_at: lv.checkin?.status === "done" ? iso(lv.checkin.atOffset + 0.2) : null,
        return_confirmer_id: lv.checkin?.status === "done" ? teacherId : null,
      })
      .select()
      .single();
    const leaveId = (leave as { id: string }).id;

    for (const a of lv.approvals) {
      await db.from("approval_records").insert({
        leave_request_id: leaveId,
        node_order: a.order,
        node_name: a.name,
        approver_id: a.approver,
        approver_name: a.approverName,
        action: a.action,
        comment: a.comment,
      });
    }
    if (lv.checkin) {
      await db.from("checkins").insert({
        leave_request_id: leaveId,
        student_id: sId,
        lat: lv.checkin.lat,
        lng: lv.checkin.lng,
        accuracy: lv.checkin.accuracy,
        client_located_at: iso(lv.checkin.atOffset),
        server_received_at: iso(lv.checkin.atOffset),
        in_fence: lv.checkin.inFence,
        method: lv.checkin.method,
        campus_id: campus?.id,
        campus_name: "主校区",
        status: lv.checkin.status === "done" ? "approved" : "pending",
        reviewer_id: lv.checkin.status === "done" ? teacherId : null,
        reviewer_name: lv.checkin.status === "done" ? "张中队长" : null,
        reviewed_at: lv.checkin.status === "done" ? iso(lv.checkin.atOffset + 0.2) : null,
      });
    }

    // 消息 / 待办
    if (lv.status === "pending") {
      await db.from("messages").insert({
        user_id: teacherId,
        type: "approval_todo",
        title: `新的请假申请待审批：${snapshot.name}（${lv.typeName}）`,
        content: lv.reason,
        leave_request_id: leaveId,
        is_todo: true,
      });
    }
    if (lv.status === "approving") {
      await db.from("messages").insert({
        user_id: adminId,
        type: "approval_todo",
        title: `请假申请待二级审批：${snapshot.name}（${lv.typeName}）`,
        content: lv.reason,
        leave_request_id: leaveId,
        is_todo: true,
      });
    }
    if (lv.checkin?.status === "pending") {
      await db.from("messages").insert({
        user_id: teacherId,
        type: "checkin_todo",
        title: `销假打卡待确认：${snapshot.name}`,
        content: "学生已在校区内完成定位打卡",
        leave_request_id: leaveId,
        is_todo: true,
      });
    }
  }

  return NextResponse.json({
    success: true,
    message: "演示数据初始化完成",
    accounts: [
      { role: "管理员", username: "admin", password: "admin123" },
      { role: "中队长", username: "T2024001", password: "teacher123" },
      { role: "中队长", username: "T2024002", password: "teacher123" },
      { role: "学生", username: "S2024001", password: "student123" },
      { role: "学生(需改密)", username: "S2024004", password: "student123" },
    ],
  });
}

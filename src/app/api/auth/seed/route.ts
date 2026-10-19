import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { genRequestNo, calcDurationHours } from "@/lib/business";
import type { AppRole } from "@/lib/auth";

// 初始化演示数据（重复执行幂等：先清业务数据再插入）
// V3.2：学校→系部→专业→年级→班级→学生组织树 + 六角色 + 三类管理关系
export async function POST() {
  const db = await getClient();

  // 按依赖顺序清空（新增组织/角色/关系表）
  for (const t of [
    "operation_logs",
    "alert_records",
    "messages",
    "attachments",
    "checkins",
    "approval_records",
    "leave_requests",
    "rel_teacher_classes",
    "rel_head_teachers",
    "rel_leader_departments",
    "management_changes",
    "user_roles",
    "users",
    "approval_flows",
    "leave_types",
    "classes",
    "majors",
    "departments",
    "campuses",
    "alert_rules",
  ]) {
    await db.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  // ---------- 校区 ----------
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

  // ---------- 系部 ----------
  const deptDefs = [
    { code: "D_CS", name: "信息工程系" },
    { code: "D_MA", name: "基础部" },
  ];
  const deptIds: Record<string, string> = {};
  for (const d of deptDefs) {
    const { data } = await db.from("departments").insert({ code: d.code, name: d.name }).select().single();
    deptIds[d.code] = (data as { id: string }).id;
  }

  // ---------- 专业（唯一归属系部） ----------
  const majorDefs = [
    { code: "M_CS", name: "计算机应用技术", dept: "D_CS" },
    { code: "M_SE", name: "软件工程", dept: "D_CS" },
    { code: "M_MA", name: "应用数学", dept: "D_MA" },
  ];
  const majorIds: Record<string, string> = {};
  for (const m of majorDefs) {
    const { data } = await db
      .from("majors")
      .insert({ code: m.code, name: m.name, department_id: deptIds[m.dept] })
      .select()
      .single();
    majorIds[m.code] = (data as { id: string }).id;
  }

  // ---------- 用户：教师/管理者先建，班级才能挂中队长 ----------
  const adminHash = await hashPassword("admin123");
  const teacherHash = await hashPassword("teacher123");
  const studentHash = await hashPassword("student123");
  const staffHash = await hashPassword("staff123");

  interface StaffDef {
    username: string;
    name: string;
    roles: AppRole[];
    phone?: string;
  }
  const staffDefs: StaffDef[] = [
    { username: "admin", name: "系统管理员", roles: ["admin"], phone: "13800000000" },
    { username: "T2024001", name: "张中队长", roles: ["teacher"], phone: "13800000001" },
    { username: "T2024002", name: "李中队长", roles: ["teacher"], phone: "13800000002" },
    { username: "H2024001", name: "王大队长", roles: ["head_teacher"], phone: "13800000003" },
    { username: "A2024001", name: "赵学工处", roles: ["affair"], phone: "13800000004" },
    { username: "L2024001", name: "陈院领导", roles: ["college_leader"], phone: "13800000005" },
    // 一人多角色示例：既是中队长又是学工处
    { username: "T2024003", name: "周兼任", roles: ["teacher", "affair"], phone: "13800000006" },
  ];

  const staffIds: Record<string, string> = {};
  for (const s of staffDefs) {
    const hash =
      s.username === "admin"
        ? adminHash
        : s.username === "T2024001" || s.username === "T2024002" || s.username === "T2024003"
          ? teacherHash
          : staffHash;
    const { data } = await db
      .from("users")
      .insert({
        username: s.username,
        password_hash: hash,
        name: s.name,
        role: s.roles[0], // 主角色（兼容）
        phone: s.phone ?? null,
        is_active: true,
      })
      .select()
      .single();
    const uid = (data as { id: string }).id;
    staffIds[s.username] = uid;
    await db.from("user_roles").insert(s.roles.map((r) => ({ user_id: uid, role: r })));
  }
  const adminId = staffIds["admin"];
  const teacherId = staffIds["T2024001"];
  const teacher2Id = staffIds["T2024002"];
  const headTeacherId = staffIds["H2024001"];
  const affairId = staffIds["A2024001"];
  const leaderId = staffIds["L2024001"];

  // ---------- 班级（挂专业→自动带系部） ----------
  const classDefs = [
    {
      name: "计算机2401班",
      grade: "2024级",
      major: "M_CS",
      leader: teacherId,
      campus: campus?.id ?? null,
      desc: "软件方向",
    },
    {
      name: "软件2401班",
      grade: "2024级",
      major: "M_SE",
      leader: teacher2Id,
      campus: campus?.id ?? null,
      desc: "工程方向",
    },
    {
      name: "数学2401班",
      grade: "2024级",
      major: "M_MA",
      leader: teacherId,
      campus: eastCampus ? (eastCampus as { id: string }).id : null,
      desc: "数学师范",
    },
  ];
  const classIds: Record<string, string> = {};
  for (const c of classDefs) {
    const majorId = majorIds[c.major];
    const deptId = majorDefs.find((m) => m.code === c.major)!.dept;
    const { data } = await db
      .from("classes")
      .insert({
        name: c.name,
        grade: c.grade,
        major: majorDefs.find((m) => m.code === c.major)!.name,
        department: deptDefs.find((d) => d.code === deptId)!.name,
        major_id: majorId,
        department_id: deptIds[deptId],
        leader_id: c.leader,
        campus_id: c.campus,
        description: c.desc,
      })
      .select()
      .single();
    classIds[c.name] = (data as { id: string }).id;
  }
  const class1Id = classIds["计算机2401班"];
  const class2Id = classIds["软件2401班"];
  const class3Id = classIds["数学2401班"];

  // ---------- 管理关系（独立授权，不靠角色名推定） ----------
  // 中队长-班级
  await db.from("rel_teacher_classes").insert([
    { teacher_id: teacherId, class_id: class1Id },
    { teacher_id: teacher2Id, class_id: class2Id },
    { teacher_id: teacherId, class_id: class3Id },
  ]);
  // 大队长-中队长（王大队长管张、李两位中队长）
  await db.from("rel_head_teachers").insert([
    { head_teacher_id: headTeacherId, teacher_id: teacherId },
    { head_teacher_id: headTeacherId, teacher_id: teacher2Id },
  ]);
  // 院领导（系主任）-系部：陈院领导分管信息工程系与基础部
  await db.from("rel_leader_departments").insert([
    { leader_id: leaderId, department_id: deptIds["D_CS"] },
    { leader_id: leaderId, department_id: deptIds["D_MA"] },
  ]);

  // ---------- 学生 ----------
  const students = [
    { username: "S2024001", name: "王小明", cls: class1Id, major: "M_CS", dept: "D_CS", majorText: "计算机应用技术", deptText: "信息工程系" },
    { username: "S2024002", name: "李小红", cls: class1Id, major: "M_CS", dept: "D_CS", majorText: "计算机应用技术", deptText: "信息工程系" },
    { username: "S2024003", name: "赵小刚", cls: class2Id, major: "M_SE", dept: "D_CS", majorText: "软件工程", deptText: "信息工程系" },
    { username: "S2024004", name: "刘小美", cls: class3Id, major: "M_MA", dept: "D_MA", majorText: "应用数学", deptText: "基础部" },
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
        major_id: majorIds[s.major],
        department_id: deptIds[s.dept],
        campus_id: campus?.id ?? null,
        student_no: s.username,
        grade: "2024级",
        major: s.majorText,
        department: s.deptText,
        student_status: "enrolled",
        phone: `139${s.username.slice(-8)}`,
        must_change_password: s.username === "S2024004",
      })
      .select()
      .single();
    const uid = (data as { id: string }).id;
    studentIds[s.username] = uid;
    await db.from("user_roles").insert({ user_id: uid, role: "student" });
  }

  // ---------- 请假类型 ----------
  await db.from("leave_types").insert([
    { code: "sick", name: "病假", sort_order: 1 },
    { code: "personal", name: "事假", sort_order: 2 },
    { code: "other", name: "其他", sort_order: 3 },
  ]);

  // ---------- 审批流（按折算天数匹配，节点角色覆盖六角色） ----------
  // 1. 离校：中队长一级（强规则，优先级最高）
  await db.from("approval_flows").insert({
    name: "离校一级审批（中队长）",
    leave_type_code: null,
    min_days: 0,
    max_days: null,
    require_leave_school: true,
    nodes: [{ order: 0, name: "中队长审批", role: "teacher" }],
    priority: 60,
  });
  // 2. 长假（>3天）：中队长 → 学工处 → 分管院领导（系主任）三级
  await db.from("approval_flows").insert({
    name: "长假三级审批（3天以上，含院领导）",
    leave_type_code: null,
    min_days: 3.5,
    max_days: null,
    require_leave_school: false,
    nodes: [
      { order: 0, name: "中队长审批", role: "teacher" },
      { order: 1, name: "学工处审批", role: "affair" },
      { order: 2, name: "分管院领导审批", role: "college_leader" },
    ],
    priority: 50,
  });
  // 3. 病假超过 1 天（≤3天）：中队长 → 大队长两级
  await db.from("approval_flows").insert({
    name: "病假多级审批（超过1天：中队长→大队长→分管院领导）",
    leave_type_code: "sick",
    min_days: 1.5,
    max_days: 30,
    require_leave_school: false,
    nodes: [
      { order: 0, name: "中队长审批", role: "teacher" },
      { order: 1, name: "大队长审批", role: "head_teacher" },
      { order: 2, name: "分管院领导审批", role: "college_leader" },
    ],
    priority: 30,
  });
  // 4. 病假 1 天以内：中队长一级
  await db.from("approval_flows").insert({
    name: "病假一级审批（1天以内，含1天）",
    leave_type_code: "sick",
    min_days: 0,
    max_days: 1,
    require_leave_school: false,
    nodes: [{ order: 0, name: "中队长审批", role: "teacher" }],
    priority: 20,
  });
  // 5. 事假：中队长 → 学工处两级
  await db.from("approval_flows").insert({
    name: "事假两级审批（中队长→学工处）",
    leave_type_code: "personal",
    min_days: 0,
    max_days: 3,
    require_leave_school: false,
    nodes: [
      { order: 0, name: "中队长审批", role: "teacher" },
      { order: 1, name: "学工处审批", role: "affair" },
    ],
    priority: 10,
  });
  // 6. 通用（非离校）：中队长一级（兜底，最低优先级）
  await db.from("approval_flows").insert({
    name: "通用一级审批（非离校）",
    leave_type_code: null,
    min_days: 0,
    max_days: null,
    require_leave_school: false,
    nodes: [{ order: 0, name: "中队长审批", role: "teacher" }],
    priority: 0,
  });

  // ---------- 预警规则 ----------
  await db.from("alert_rules").insert([
    { name: "结束后2小时未销假提醒中队长", grace_hours: 2, target_role: "teacher", escalate_hours: 24 },
  ]);

  const now = Date.now();
  const iso = (offsetH: number) => new Date(now + offsetH * 3600000).toISOString();

  const snapshotMap: Record<
    string,
    { no: string; name: string; cls: string; dept: string; major: string; grade: string }
  > = {
    S2024001: { no: "S2024001", name: "王小明", cls: "计算机2401班", dept: "信息工程系", major: "计算机应用技术", grade: "2024级" },
    S2024002: { no: "S2024002", name: "李小红", cls: "计算机2401班", dept: "信息工程系", major: "计算机应用技术", grade: "2024级" },
    S2024003: { no: "S2024003", name: "赵小刚", cls: "软件2401班", dept: "信息工程系", major: "软件工程", grade: "2024级" },
    S2024004: { no: "S2024004", name: "刘小美", cls: "数学2401班", dept: "基础部", major: "应用数学", grade: "2024级" },
  };

  // ---------- 演示请假数据 ----------
  const leaves = [
    {
      student: "S2024001",
      type: "sick",
      typeName: "病假",
      start: iso(-48),
      end: iso(-20),
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
      end: iso(-6),
      reason: "去医院检查牙齿",
      leaveSchool: true,
      status: "approved",
      checkin: null,
      approvals: [
        { order: 0, name: "中队长审批", approver: teacherId, approverName: "张中队长", action: "approved", comment: "同意" },
      ],
    },
    {
      // 事假两级：中队长已过，待学工处
      student: "S2024003",
      type: "personal",
      typeName: "事假",
      start: iso(24),
      end: iso(48),
      reason: "家中有事需要回家处理",
      leaveSchool: false,
      status: "approving",
      currentNode: 1,
      nextRole: "affair" as const,
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
        status: "pending" as const,
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
      status: "pending",
      approvals: [],
    },
  ];

  for (const lv of leaves) {
    const sId = studentIds[lv.student];
    const snap = snapshotMap[lv.student];
    const duration = calcDurationHours(lv.start, lv.end);
    const durationMinutes = Math.round(duration * 60);
    const durationDays = Math.ceil(durationMinutes / 720) * 0.5;

    const { data: leave, error: leaveErr } = await db
      .from("leave_requests")
      .insert({
        request_no: genRequestNo(new Date(now - 86400000)),
        student_id: sId,
        student_no_snapshot: snap.no,
        student_name_snapshot: snap.name,
        class_name_snapshot: snap.cls,
        department_snapshot: snap.dept,
        major_name_snapshot: snap.major,
        grade_snapshot: snap.grade,
        leave_type: lv.type,
        leave_type_name: lv.typeName,
        reason: lv.reason,
        start_time: lv.start,
        end_time: lv.end,
        duration_minutes: durationMinutes,
        duration_days: durationDays,
        duration_rule_version: "0.5day-v1",
        duration_hours: duration,
        leave_school: lv.leaveSchool,
        sleep_outside: false,
        destination: lv.leaveSchool ? "回家" : null,
        contact_phone: "13900000000",
        status: lv.status,
        current_node_order:
          "currentNode" in lv
            ? (lv as { currentNode: number }).currentNode
            : lv.status === "approved" || lv.status === "rejected"
              ? 99
              : 0,
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
    if (!leave) {
      console.error("[seed] leave insert failed:", lv.student, lv.type, leaveErr);
      throw new Error(`seed leave insert failed: ${leaveErr?.message ?? "no row"}`);
    }
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

    // 消息 / 待办（按节点角色解析的演示待办，直接指定演示账号）
    if (lv.status === "pending") {
      const todoUser = lv.student === "S2024004" ? teacherId : teacherId;
      await db.from("messages").insert({
        user_id: todoUser,
        type: "approval_todo",
        title: `新的请假申请待审批：${snap.name}（${lv.typeName}）`,
        content: lv.reason,
        leave_request_id: leaveId,
        is_todo: true,
      });
    }
    if (lv.status === "approving") {
      const nextRole = (lv as { nextRole?: AppRole }).nextRole;
      const todoUserId = nextRole === "affair" ? affairId : adminId;
      await db.from("messages").insert({
        user_id: todoUserId,
        type: "approval_todo",
        title: `请假申请待下一节点审批：${snap.name}（${lv.typeName}）`,
        content: lv.reason,
        leave_request_id: leaveId,
        is_todo: true,
      });
    }
    if (lv.checkin?.status === "pending") {
      await db.from("messages").insert({
        user_id: teacherId,
        type: "checkin_todo",
        title: `销假打卡待确认：${snap.name}`,
        content: "学生已在校区内完成定位打卡",
        leave_request_id: leaveId,
        is_todo: true,
      });
    }
  }

  // 回填未结束请假链占用
  {
    const { data: actives } = await db
      .from("leave_requests")
      .select("id,student_id,status,checkin_status,leave_school")
      .or("status.eq.pending,status.eq.approving,status.eq.approved");
    const earliest = new Map<string, string>();
    for (const row of (actives ?? []) as Array<Record<string, unknown>>) {
      const sid = row.student_id as string;
      const active =
        row.status === "pending" ||
        row.status === "approving" ||
        (row.status === "approved" && row.leave_school === true && row.checkin_status !== "done");
      if (active && !earliest.has(sid)) earliest.set(sid, row.id as string);
    }
    for (const [sid, lid] of earliest) {
      await db.from("users").update({ active_leave_id: lid }).eq("id", sid);
    }
  }

  return NextResponse.json({
    success: true,
    message: "演示数据初始化完成（组织树+多角色+管理关系）",
    accounts: [
      { role: "管理员", username: "admin", password: "admin123" },
      { role: "中队长", username: "T2024001", password: "teacher123" },
      { role: "中队长", username: "T2024002", password: "teacher123" },
      { role: "大队长", username: "H2024001", password: "staff123" },
      { role: "学工处", username: "A2024001", password: "staff123" },
      { role: "分管院领导", username: "L2024001", password: "staff123" },
      { role: "中队长+学工处(多角色)", username: "T2024003", password: "teacher123" },
      { role: "学生", username: "S2024001", password: "student123" },
      { role: "学生(需改密)", username: "S2024004", password: "student123" },
    ],
  });
}

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { writeOperationLog } from "@/lib/logger";

type PreviewRow = {
  rowNo: number;
  studentNo: string;
  name: string;
  className: string;
  grade: string;
  departmentName: string;
  majorName: string;
  password: string;
  action: "create" | "update" | "skip";
  errors: string[];
  classId?: string;
  majorId?: string;
  departmentId?: string;
  existingId?: string;
};

// CSV 学生导入：mode=preview 预览校验；mode=commit 确认写入
// 支持两种表头：
//   旧：学号,姓名,班级名称,初始密码
//   新：学号,姓名,年级,系部名称,专业名称,班级名称,初始密码
export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (!user.roles.includes("admin")) {
    return NextResponse.json({ error: "仅管理员可导入学生" }, { status: 403 });
  }

  const body = (await request.json()) as { csv?: string; mode?: "preview" | "commit" };
  if (!body.csv?.trim()) {
    return NextResponse.json({ error: "文件内容为空" }, { status: 400 });
  }
  const mode = body.mode === "commit" ? "commit" : "preview";

  const rows = parseCsv(body.csv);
  if (rows.length < 2) {
    return NextResponse.json({ error: "CSV 缺少数据行" }, { status: 400 });
  }
  const header = rows[0].map((h) => h.trim());
  const legacyHeader = ["学号", "姓名", "班级名称", "初始密码"];
  const fullHeader = ["学号", "姓名", "年级", "系部名称", "专业名称", "班级名称", "初始密码"];
  const isLegacy = header.length === legacyHeader.length && legacyHeader.every((h, i) => header[i] === h);
  const isFull = header.length === fullHeader.length && fullHeader.every((h, i) => header[i] === h);
  if (!isLegacy && !isFull) {
    return NextResponse.json(
      {
        error: `表头不正确，应为：${fullHeader.join(",")}（或旧版：${legacyHeader.join(",")}），实际：${header.join(",")}`,
      },
      { status: 400 }
    );
  }
  // 列索引映射（旧表无年级/系部/专业列）
  const col = {
    no: 0,
    name: 1,
    grade: isFull ? 2 : -1,
    dept: isFull ? 3 : -1,
    major: isFull ? 4 : -1,
    className: isFull ? 5 : 2,
    password: isFull ? 6 : 3,
  };

  const db = await getClient();
  const { data: classRows } = await db
    .from("classes")
    .select("id, name, major_id, department_id, grade")
    .eq("is_active", true);
  const classMap = new Map<
    string,
    { id: string; majorId: string | null; departmentId: string | null; grade: string | null }
  >();
  for (const c of classRows ?? []) {
    const row = c as {
      id: string;
      name: string;
      major_id: string | null;
      department_id: string | null;
      grade: string | null;
    };
    classMap.set(row.name.trim(), {
      id: row.id,
      majorId: row.major_id,
      departmentId: row.department_id,
      grade: row.grade,
    });
  }
  const { data: majorRows } = await db.from("majors").select("id, name, department_id").eq("is_active", true);
  const majorMap = new Map<string, { id: string; departmentId: string }>();
  for (const m of majorRows ?? []) {
    const row = m as { id: string; name: string; department_id: string };
    majorMap.set(row.name.trim(), { id: row.id, departmentId: row.department_id });
  }
  const { data: deptRows } = await db.from("departments").select("id, name").eq("is_active", true);
  const deptMap = new Map<string, string>();
  for (const d of deptRows ?? []) {
    const row = d as { id: string; name: string };
    deptMap.set(row.name.trim(), row.id);
  }
  const { data: existingStudents } = await db
    .from("users")
    .select("id, username")
    .eq("role", "student");
  const existingMap = new Map<string, string>();
  for (const s of existingStudents ?? []) {
    existingMap.set((s as { username: string }).username.trim(), (s as { id: string }).id);
  }

  const preview: PreviewRow[] = [];
  const seenInFile = new Set<string>();
  const passwordRe = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

  const get = (arr: string[], idx: number): string => (idx >= 0 ? (arr[idx] ?? "").trim() : "");

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (cols.length === 1 && cols[0].trim() === "") continue;
    const studentNo = get(cols, col.no);
    const name = get(cols, col.name);
    const gradeInput = get(cols, col.grade);
    const deptName = get(cols, col.dept);
    const majorName = get(cols, col.major);
    const className = get(cols, col.className);
    const password = get(cols, col.password);
    const errors: string[] = [];

    if (!studentNo) errors.push("学号必填");
    else if (!/^[A-Za-z0-9]{6,20}$/.test(studentNo)) errors.push("学号应为6-20位字母或数字");
    if (!name) errors.push("姓名必填");
    else if (name.length > 50) errors.push("姓名过长");
    if (!className) errors.push("班级名称必填");
    if (seenInFile.has(studentNo)) errors.push("文件内学号重复");
    else if (studentNo) seenInFile.add(studentNo);

    const cls = classMap.get(className);
    if (className && !cls) errors.push(`班级「${className}」不存在`);

    // 组织归属：以班级绑定为权威来源；填写的系部/专业/年级需与班级一致（组合校验）
    let majorId = cls?.majorId ?? undefined;
    let departmentId = cls?.departmentId ?? undefined;
    const grade = gradeInput || cls?.grade || "";

    if (isFull) {
      if (deptName) {
        const deptId = deptMap.get(deptName);
        if (!deptId) errors.push(`系部「${deptName}」不存在`);
        else if (cls?.departmentId && cls.departmentId !== deptId)
          errors.push(`班级「${className}」不属于系部「${deptName}」`);
        else departmentId = deptId;
      }
      if (majorName) {
        const major = majorMap.get(majorName);
        if (!major) errors.push(`专业「${majorName}」不存在`);
        else {
          if (deptName) {
            const deptId = deptMap.get(deptName);
            if (deptId && major.departmentId !== deptId)
              errors.push(`专业「${majorName}」不属于系部「${deptName}」`);
          }
          if (cls?.majorId && cls.majorId !== major.id)
            errors.push(`班级「${className}」不属于专业「${majorName}」`);
          majorId = major.id;
          departmentId = departmentId ?? major.departmentId;
        }
      }
    }

    const existingId = existingMap.get(studentNo);
    const isUpdate = Boolean(existingId);
    if (!isUpdate) {
      if (!password) errors.push("初始密码必填");
      else if (!passwordRe.test(password)) errors.push("密码至少8位，须包含字母和数字");
    }

    preview.push({
      rowNo: i + 1,
      studentNo,
      name,
      className,
      grade,
      departmentName: deptName,
      majorName,
      password,
      action: errors.length > 0 ? "skip" : isUpdate ? "update" : "create",
      errors,
      classId: cls?.id,
      majorId,
      departmentId,
      existingId: existingId ?? undefined,
    });
  }

  if (mode === "preview") {
    return NextResponse.json({
      data: {
        total: preview.length,
        createCount: preview.filter((r) => r.action === "create").length,
        updateCount: preview.filter((r) => r.action === "update").length,
        errorCount: preview.filter((r) => r.errors.length > 0).length,
        rows: preview,
      },
    });
  }

  // commit：仅落无错误行
  let createCount = 0;
  let updateCount = 0;
  const failed: Array<{ rowNo: number; reason: string }> = [];
  for (const r of preview) {
    if (r.errors.length > 0 || r.action === "skip") {
      failed.push({ rowNo: r.rowNo, reason: r.errors.join("；") });
      continue;
    }
    if (r.action === "create" && r.classId) {
      const userId = randomUUID();
      const { error } = await db.from("users").insert({
        id: userId,
        username: r.studentNo,
        password_hash: await bcrypt.hash(r.password, 10),
        name: r.name,
        role: "student",
        class_id: r.classId,
        major_id: r.majorId ?? null,
        department_id: r.departmentId ?? null,
        grade: r.grade || null,
        must_change_password: true,
      });
      if (error) {
        failed.push({ rowNo: r.rowNo, reason: error.message });
      } else {
        const { error: roleErr } = await db
          .from("user_roles")
          .upsert({ user_id: userId, role: "student" }, { onConflict: "user_id,role" });
        if (roleErr) failed.push({ rowNo: r.rowNo, reason: `角色写入失败: ${roleErr.message}` });
        else createCount += 1;
      }
    } else if (r.action === "update" && r.existingId && r.classId) {
      const { error } = await db
        .from("users")
        .update({
          name: r.name,
          class_id: r.classId,
          major_id: r.majorId ?? null,
          department_id: r.departmentId ?? null,
          grade: r.grade || null,
          is_active: true,
        })
        .eq("id", r.existingId);
      if (error) {
        failed.push({ rowNo: r.rowNo, reason: error.message });
      } else {
        await db
          .from("user_roles")
          .upsert({ user_id: r.existingId, role: "student" }, { onConflict: "user_id,role" });
        updateCount += 1;
      }
    }
  }

  await writeOperationLog({
    operator: user,
    action: "import_students",
    targetType: "user",
    detail: { createCount, updateCount, failedCount: failed.length, failed },
    request,
  });

  return NextResponse.json({
    data: { createCount, updateCount, failedCount: failed.length, failed, rows: preview },
  });
}

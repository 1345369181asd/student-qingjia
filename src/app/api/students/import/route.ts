import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { writeOperationLog } from "@/lib/logger";

type PreviewRow = {
  rowNo: number;
  studentNo: string;
  name: string;
  className: string;
  password: string;
  action: "create" | "update" | "skip";
  errors: string[];
  classId?: string;
  existingId?: string;
};

// CSV 学生导入：mode=preview 预览校验；mode=commit 确认写入
export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
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
  const expected = ["学号", "姓名", "班级名称", "初始密码"];
  for (let i = 0; i < expected.length; i++) {
    if (header[i] !== expected[i]) {
      return NextResponse.json(
        { error: `表头不正确，应为：${expected.join(",")}，实际：${header.join(",")}` },
        { status: 400 }
      );
    }
  }

  const db = await getClient();
  const { data: classRows } = await db.from("classes").select("id, name").eq("is_active", true);
  const classMap = new Map<string, string>();
  for (const c of classRows ?? []) {
    classMap.set((c as { name: string }).name.trim(), (c as { id: string }).id);
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

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (cols.length === 1 && cols[0].trim() === "") continue;
    const studentNo = (cols[0] ?? "").trim();
    const name = (cols[1] ?? "").trim();
    const className = (cols[2] ?? "").trim();
    const password = (cols[3] ?? "").trim();
    const errors: string[] = [];

    if (!studentNo) errors.push("学号必填");
    else if (!/^[A-Za-z0-9]{6,20}$/.test(studentNo)) errors.push("学号应为6-20位字母或数字");
    if (!name) errors.push("姓名必填");
    else if (name.length > 50) errors.push("姓名过长");
    if (!className) errors.push("班级名称必填");
    const classId = classMap.get(className);
    if (className && !classId) errors.push(`班级「${className}」不存在`);
    if (seenInFile.has(studentNo)) errors.push("文件内学号重复");
    else if (studentNo) seenInFile.add(studentNo);

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
      password,
      action: errors.length > 0 ? "skip" : isUpdate ? "update" : "create",
      errors,
      classId: classId ?? undefined,
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
      const { error } = await db.from("users").insert({
        username: r.studentNo,
        password_hash: await bcrypt.hash(r.password, 10),
        name: r.name,
        role: "student",
        class_id: r.classId,
        must_change_password: true,
      });
      if (error) {
        failed.push({ rowNo: r.rowNo, reason: error.message });
      } else {
        createCount += 1;
      }
    } else if (r.action === "update" && r.existingId && r.classId) {
      const { error } = await db
        .from("users")
        .update({ name: r.name, class_id: r.classId, is_active: true })
        .eq("id", r.existingId);
      if (error) {
        failed.push({ rowNo: r.rowNo, reason: error.message });
      } else {
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

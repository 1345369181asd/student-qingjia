import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { toCsv } from "@/lib/csv";

// 学生导入模板下载
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可下载模板" }, { status: 403 });
  }
  const csv = toCsv(
    ["学号", "姓名", "班级名称", "初始密码"],
    [["2024010101", "张三", "计算机2401班", "Stu@12345"]]
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="student_import_template.csv"',
    },
  });
}

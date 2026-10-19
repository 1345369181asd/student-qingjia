import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { getClient } from "@/lib/db";

// 学生导入模板下载（含系部/专业/年级列；系部/专业需与班级归属一致）
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (!user.roles.includes("admin")) {
    return NextResponse.json({ error: "仅管理员可下载模板" }, { status: 403 });
  }

  // 尽量用系统中真实的系部/专业/班级给出示例，降低填写错误
  const db = await getClient();
  const { data: sample } = await db
    .from("classes")
    .select("name, grade, majors(name), departments(name)")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const s = sample as
    | {
        name: string;
        grade: string | null;
        majors: { name: string } | null;
        departments: { name: string } | null;
      }
    | null;

  const csv = toCsv(
    ["学号", "姓名", "年级", "系部名称", "专业名称", "班级名称", "初始密码"],
    [
      [
        "2024010101",
        "张三",
        s?.grade ?? "2024",
        s?.departments?.name ?? "信息工程系",
        s?.majors?.name ?? "计算机应用技术",
        s?.name ?? "计算机2401班",
        "Stu@12345",
      ],
    ]
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="student_import_template.csv"',
    },
  });
}

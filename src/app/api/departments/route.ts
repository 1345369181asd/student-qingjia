import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 列表（含专业数/班级数/学生数）
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin", "affair", "teacher", "head_teacher", "college_leader"]);
  if (denied) return denied;

  const db = await getClient();
  const keyword = req.nextUrl.searchParams.get("keyword")?.trim();
  const includeInactive = req.nextUrl.searchParams.get("includeInactive");

  let q = db.from("departments").select("*").order("code");
  if (!includeInactive) q = q.eq("is_active", true);
  if (keyword) q = q.or(`name.ilike.%${keyword}%,code.ilike.%${keyword}%`);
  const { data: depts, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 统计专业 / 班级 / 学生数量
  const { data: majors } = await db.from("majors").select("id, department_id");
  const { data: classes } = await db
    .from("classes")
    .select("id, department_id")
    .eq("is_active", true);
  const { data: students } = await db
    .from("users")
    .select("id, department_id")
    .eq("role", "student")
    .eq("is_active", true);

  const data = (depts ?? []).map((d) => {
    const majorIds = new Set(
      (majors ?? []).filter((m) => m.department_id === d.id).map((m) => m.id)
    );
    const classCount = (classes ?? []).filter((c) => c.department_id === d.id).length;
    const studentCount = (students ?? []).filter((s) => s.department_id === d.id).length;
    return {
      ...d,
      majorCount: majorIds.size,
      classCount,
      studentCount,
    };
  });

  return NextResponse.json({ data });
}

// 新建系部（仅管理员）
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin"]);
  if (denied) return denied;

  const body = await req.json();
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!code || !name) {
    return NextResponse.json({ error: "系部编码和名称必填" }, { status: 400 });
  }

  const db = await getClient();
  const { data: dup } = await db.from("departments").select("id").eq("code", code).maybeSingle();
  if (dup) return NextResponse.json({ error: "系部编码已存在" }, { status: 400 });

  const { data, error } = await db
    .from("departments")
    .insert({ code, name, is_active: body.isActive !== false })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeOperationLog({
    operatorId: auth.id,
    operatorName: auth.name,
    action: "department_create",
    targetType: "department",
    targetId: data.id,
    detail: { code, name },
  });
  return NextResponse.json({ data });
}

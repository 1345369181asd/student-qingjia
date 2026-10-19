import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 列表：可按系部过滤，返回系部信息与班级/学生数
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin", "affair", "teacher", "head_teacher", "college_leader"]);
  if (denied) return denied;

  const db = await getClient();
  const departmentId = req.nextUrl.searchParams.get("departmentId");
  const keyword = req.nextUrl.searchParams.get("keyword")?.trim();
  const includeInactive = req.nextUrl.searchParams.get("includeInactive");

  let q = db
    .from("majors")
    .select("*, department:departments(id, code, name)")
    .order("code");
  if (departmentId) q = q.eq("department_id", departmentId);
  if (!includeInactive) q = q.eq("is_active", true);
  if (keyword) q = q.or(`name.ilike.%${keyword}%,code.ilike.%${keyword}%`);
  const { data: majors, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: classes } = await db.from("classes").select("id, major_id");
  const { data: students } = await db
    .from("users")
    .select("id, major_id")
    .eq("role", "student")
    .eq("is_active", true);

  const data = (majors ?? []).map((m) => ({
    ...m,
    classCount: (classes ?? []).filter((c) => c.major_id === m.id).length,
    studentCount: (students ?? []).filter((s) => s.major_id === m.id).length,
  }));
  return NextResponse.json({ data });
}

// 新建专业（必须指定唯一系部）
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = requireRole(auth, ["admin"]);
  if (denied) return denied;

  const body = await req.json();
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const departmentId = String(body.departmentId ?? "").trim();
  if (!code || !name || !departmentId) {
    return NextResponse.json({ error: "专业编码、名称、所属系部必填" }, { status: 400 });
  }

  const db = await getClient();
  const { data: dept } = await db
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .maybeSingle();
  if (!dept) return NextResponse.json({ error: "所属系部不存在" }, { status: 400 });

  const { data: dup } = await db.from("majors").select("id").eq("code", code).maybeSingle();
  if (dup) return NextResponse.json({ error: "专业编码已存在" }, { status: 400 });

  const { data, error } = await db
    .from("majors")
    .insert({ code, name, department_id: departmentId, is_active: body.isActive !== false })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeOperationLog({
    operatorId: auth.id,
    operatorName: auth.name,
    action: "major_create",
    targetType: "major",
    targetId: data.id,
    detail: { code, name, departmentId },
  });
  return NextResponse.json({ data });
}

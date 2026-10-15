import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 班级列表：登录用户可查（注册关闭后仍需供学生/教师展示组织信息）
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const db = await getClient();
  const { data, error } = await db
    .from("classes")
    .select("*")
    .order("grade", { ascending: false })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: "查询失败" }, { status: 500 });
  // 补充中队长姓名（前端也可用 users 列表自行映射）
  const { data: leaders } = await db.from("users").select("id,name,username").eq("role", "teacher");
  const leaderMap = new Map((leaders ?? []).map((l) => [l.id, l]));
  const withLeader = (data ?? []).map((c) => ({
    ...c,
    leader: c.leader_id ? leaderMap.get(c.leader_id) ?? null : null,
  }));
  return NextResponse.json({ data: withLeader });
}

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const body = (await request.json()) as {
    name?: string;
    grade?: string | null;
    leader_id?: string | null;
    campus_id?: string | null;
    description?: string | null;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "班级名称必填" }, { status: 400 });
  }

  const db = await getClient();
  const { data, error } = await db
    .from("classes")
    .insert({
      name: body.name.trim(),
      grade: body.grade ?? null,
      leader_id: body.leader_id ?? null,
      campus_id: body.campus_id ?? null,
      description: body.description ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "创建失败" }, { status: 500 });

  await writeOperationLog({
    operator: user,
    action: "create_class",
    targetType: "class",
    targetId: (data as { id: string }).id,
    detail: { name: body.name },
    request,
  });
  return NextResponse.json({ data });
}

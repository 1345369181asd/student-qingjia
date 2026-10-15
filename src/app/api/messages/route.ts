import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// 当前登录用户站内消息（可按是否已读过滤）
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";

  const db = await getClient();
  let q = db
    .from("messages")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (unreadOnly) q = q.eq("is_read", false);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "查询失败" }, { status: 500 });

  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return NextResponse.json({ data, unread_count: count ?? 0 });
}

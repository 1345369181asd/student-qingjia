import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const db = await getClient();
  const { error } = await db
    .from("messages")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("is_read", false);
  if (error) return NextResponse.json({ error: "操作失败" }, { status: 500 });
  return NextResponse.json({ success: true });
}

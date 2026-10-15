import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  const db = await getClient();
  const { error } = await db
    .from("messages")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "操作失败" }, { status: 500 });
  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(TOKEN_COOKIE);
  return res;
}

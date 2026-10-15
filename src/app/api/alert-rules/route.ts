import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

interface AlertRuleRow {
  id: string;
  approve_timeout_hours: number;
  checkin_grace_minutes: number;
  enabled: boolean;
  updated_at: string | null;
}

const DEFAULTS = { approve_timeout_hours: 24, checkin_grace_minutes: 30 };

export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const db = await getClient();
  const { data } = await db
    .from("alert_rules")
    .select("*")
    .eq("enabled", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    data: {
      approve_timeout_hours: data?.approve_timeout_hours ?? DEFAULTS.approve_timeout_hours,
      checkin_grace_minutes: data?.checkin_grace_minutes ?? DEFAULTS.checkin_grace_minutes,
    },
  });
}

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可配置预警规则" }, { status: 403 });
  }
  const body = (await request.json()) as {
    approve_timeout_hours?: number;
    checkin_grace_minutes?: number;
  };

  const updates: Partial<AlertRuleRow> = { updated_at: new Date().toISOString() };
  if (typeof body.approve_timeout_hours === "number" && body.approve_timeout_hours > 0) {
    updates.approve_timeout_hours = Math.round(body.approve_timeout_hours);
  }
  if (typeof body.checkin_grace_minutes === "number" && body.checkin_grace_minutes >= 0) {
    updates.checkin_grace_minutes = Math.round(body.checkin_grace_minutes);
  }

  const db = await getClient();
  const { data: existing } = await db
    .from("alert_rules")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await db.from("alert_rules").update(updates).eq("id", existing.id);
  } else {
    await db.from("alert_rules").insert(DEFAULTS);
  }

  return NextResponse.json({ success: true });
}

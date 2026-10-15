import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 校区列表：登录用户均可查看（学生销假需要自己的校区围栏展示）
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const db = await getClient();
  const { data, error } = await db
    .from("campuses")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "查询失败" }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const body = (await request.json()) as {
    name?: string;
    address?: string;
    centerLat?: number | null;
    centerLng?: number | null;
    radiusMeters?: number | null;
    polygon?: Array<{ lat: number; lng: number }> | null;
    boundaryToleranceMeters?: number;
    minAccuracyMeters?: number;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "校区名称必填" }, { status: 400 });
  }

  const db = await getClient();
  const { data, error } = await db
    .from("campuses")
    .insert({
      name: body.name.trim(),
      address: body.address ?? null,
      center_lat: body.centerLat ?? null,
      center_lng: body.centerLng ?? null,
      radius_meters: body.radiusMeters ?? null,
      polygon: body.polygon ?? null,
      boundary_tolerance_meters: body.boundaryToleranceMeters ?? 50,
      min_accuracy_meters: body.minAccuracyMeters ?? 100,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "创建失败" }, { status: 500 });

  await writeOperationLog({
    operator: user,
    action: "create_campus",
    targetType: "campus",
    targetId: (data as { id: string }).id,
    detail: { name: body.name },
    request,
  });
  return NextResponse.json({ data });
}

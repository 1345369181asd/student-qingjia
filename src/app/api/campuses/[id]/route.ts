import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

interface Body {
  name?: string;
  address?: string;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusMeters?: number | null;
  polygon?: Array<{ lat: number; lng: number }> | null;
  boundaryToleranceMeters?: number;
  minAccuracyMeters?: number;
  isActive?: boolean;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const body = (await request.json()) as Body;
  const db = await getClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields: Array<keyof Body> = [
    "name",
    "address",
    "centerLat",
    "centerLng",
    "radiusMeters",
    "polygon",
    "boundaryToleranceMeters",
    "minAccuracyMeters",
    "isActive",
  ];
  const map: Record<string, string> = {
    name: "name",
    address: "address",
    centerLat: "center_lat",
    centerLng: "center_lng",
    radiusMeters: "radius_meters",
    polygon: "polygon",
    boundaryToleranceMeters: "boundary_tolerance_meters",
    minAccuracyMeters: "min_accuracy_meters",
    isActive: "is_active",
  };
  for (const f of fields) {
    if (body[f] !== undefined) patch[map[f]] = body[f] as unknown;
  }

  const { data, error } = await db.from("campuses").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "更新失败" }, { status: 500 });

  await writeOperationLog({
    operator: user,
    action: "update_campus",
    targetType: "campus",
    targetId: id,
    request,
  });
  return NextResponse.json({ data });
}

// 历史业务可能引用校区：停用而非物理删除
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const roleErr = requireRole(user, ["admin"]);
  if (roleErr) return roleErr;

  const { id } = await params;
  const db = await getClient();
  await db.from("campuses").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);

  await writeOperationLog({
    operator: user,
    action: "deactivate_campus",
    targetType: "campus",
    targetId: id,
    request,
  });
  return NextResponse.json({ success: true });
}

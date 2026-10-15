import { NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// 受控附件访问：校验数据范围后返回短期签名 URL（不公开整目录）
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  const { id } = await params;

  const db = await getClient();
  const { data: att } = await db
    .from("attachments")
    .select("id,file_key,file_name,leave_request_id,leave:leave_request_id(student_id)")
    .eq("id", id)
    .maybeSingle();
  if (!att) return NextResponse.json({ error: "附件不存在" }, { status: 404 });

  const leaveRel = att.leave as unknown as { student_id: string } | { student_id: string }[] | null;
  const ownerId = Array.isArray(leaveRel) ? leaveRel[0]?.student_id : leaveRel?.student_id;
  if (user.role === "student" && ownerId !== user.id) {
    return NextResponse.json({ error: "无权访问该附件" }, { status: 403 });
  }
  if (user.role === "teacher") {
    const { data: cls } = await db
      .from("classes")
      .select("id")
      .eq("leader_id", user.id)
      .eq("is_active", true);
    const classIds = new Set((cls ?? []).map((c) => c.id as string));
    const { data: stu } = await db.from("users").select("class_id").eq("id", ownerId).maybeSingle();
    const studentClassId = (stu as { class_id: string | null } | null)?.class_id;
    if (!studentClassId || !classIds.has(studentClassId)) {
      return NextResponse.json({ error: "无权访问该附件" }, { status: 403 });
    }
  }

  const storage = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: "",
    secretKey: "",
    bucketName: process.env.COZE_BUCKET_NAME,
    region: "cn-beijing",
  });
  const url = await storage.generatePresignedUrl({
    key: (att as { file_key: string }).file_key,
    expireTime: 600,
  });
  return NextResponse.json({ url, fileName: (att as { file_name: string }).file_name });
}

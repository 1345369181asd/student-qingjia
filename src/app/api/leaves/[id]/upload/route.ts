import { NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { getClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { writeOperationLog } from "@/lib/logger";

// 限制：图片/PDF/常见文档，单文件 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE = 10 * 1024 * 1024;

// 安全文件名：仅保留字母数字点下划线短横，中文替换为拼音风险大，这里统一转 ascii 安全名
function sanitizeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot) : "";
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const safeBase =
    base
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 80) || "file";
  const safeExt = ext.replace(/[^A-Za-z0-9.]/g, "").slice(0, 10);
  return `${safeBase}${safeExt}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof Response) return user;
  if (user.role !== "student") {
    return NextResponse.json({ error: "仅学生可上传证明附件" }, { status: 403 });
  }
  const { id } = await params;

  const db = await getClient();
  const { data: leave } = await db
    .from("leave_requests")
    .select("id,student_id,status")
    .eq("id", id)
    .maybeSingle();
  if (!leave) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  const lv = leave as { id: string; student_id: string; status: string };
  if (lv.student_id !== user.id) {
    return NextResponse.json({ error: "只能为本人申请上传附件" }, { status: 403 });
  }
  if (!["pending", "approving"].includes(lv.status)) {
    return NextResponse.json({ error: "申请已结束，不能再上传附件" }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "未找到文件" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "文件不能超过 10MB" }, { status: 400 });
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "仅支持图片、PDF 或 Word 文档" }, { status: 400 });
  }

  const storage = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: "",
    secretKey: "",
    bucketName: process.env.COZE_BUCKET_NAME,
    region: "cn-beijing",
  });

  const safeName = sanitizeFileName(file.name);
  const objectName = `leaves/${id}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileKey = await storage.uploadFile({
    fileContent: buffer,
    fileName: objectName,
    contentType,
  });

  const { data, error } = await db
    .from("attachments")
    .insert({
      leave_request_id: id,
      file_key: fileKey,
      file_name: file.name,
      content_type: contentType,
      file_size: file.size,
      uploaded_by: user.id,
    })
    .select("id,file_name,content_type,file_size,created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: "附件记录保存失败" }, { status: 500 });
  }

  await writeOperationLog({
    operator: user,
    action: "upload_attachment",
    targetType: "leave",
    targetId: id,
    detail: { fileName: file.name, size: file.size },
    request,
  });

  return NextResponse.json({ data });
}

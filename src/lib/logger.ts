import { getClient } from "@/lib/db";
import type { AuthUser } from "@/lib/auth";

interface LogInput {
  operator?: AuthUser | null;
  /** 无完整 AuthUser 时（如内部路由）可直接传 id/name */
  operatorId?: string | null;
  operatorName?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  request?: Request | null;
}

export async function writeOperationLog(input: LogInput): Promise<void> {
  try {
    const db = await getClient();
    let ipAddress: string | null = null;
    if (input.request) {
      ipAddress =
        input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        input.request.headers.get("x-real-ip") ||
        null;
    }
    await db.from("operation_logs").insert({
      operator_id: input.operator?.id ?? input.operatorId ?? null,
      operator_name: input.operator?.name ?? input.operatorName ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      detail: (input.detail ?? {}) as Record<string, unknown>,
      ip: ipAddress,
      user_agent: input.request?.headers.get("user-agent") ?? null,
    });
  } catch {
    // 日志失败不阻断主业务
  }
}

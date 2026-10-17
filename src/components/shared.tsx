"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const TOKEN_KEY = "leave_system_token";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

// 受控签名 URL：经后端换取临时签名地址后打开，避免把私有直链暴露给前端
export async function openAttachment(attachmentId: string): Promise<void> {
  const res = await fetch(`/api/files/${attachmentId}/url`, {
    headers: authHeaders(),
  });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || "无法获取附件地址");
  }
  window.open(data.url, "_blank", "noopener,noreferrer");
}

export function LoadingSpinner({ size = 32 }: { size?: number }) {
  return <Loader2 className="animate-spin text-indigo-500" style={{ width: size, height: size }} />;
}

export function EmptyState({
  text = "暂无数据",
  icon,
}: {
  text?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      {icon ?? <div className="w-12 h-12 rounded-full bg-slate-100 mb-3" />}
      <p className="text-sm">{text}</p>
    </div>
  );
}

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  personal: "事假",
  sick: "病假",
  public: "公假",
  family: "家庭事假",
  other: "其他",
};

export const LEAVE_STATUS_LABEL: Record<string, string> = {
  pending: "待审批",
  approving: "审批中",
  approved: "已通过",
  rejected: "已驳回",
  revoked: "已撤销",
};

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// 输入可能是 "YYYY-MM-DDTHH:mm" 或 ISO；输出本地 "YYYY-MM-DD HH:mm"
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 16 ? value.replace(" ", "T") : value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

// 统一时长展示：折算天数为主，括号内附实际小时数（V3.2）
// 兼容旧数据：duration_days 缺失时由 duration_hours 现算（ceil(h*60/720)*0.5）
export function formatDuration(row: {
  duration_days?: number | string | null;
  duration_hours?: number | string | null;
}): string {
  const hours = row.duration_hours != null ? Number(row.duration_hours) : null;
  let days = row.duration_days != null ? Number(row.duration_days) : null;
  if ((days == null || Number.isNaN(days)) && hours != null && !Number.isNaN(hours)) {
    days = Math.ceil((hours * 60) / 720) * 0.5;
  }
  const dayText = days != null ? `${days} 天` : null;
  const hourText = hours != null ? `${hours} 小时` : null;
  if (dayText && hourText) return `${dayText}（${hourText}）`;
  return dayText ?? hourText ?? "—";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 16 ? value.replace(" ", "T") : value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export const CHECKIN_STATUS_LABEL: Record<string, string> = {
  none: "未销假",
  pending: "销假待确认",
  done: "已销假",
  rejected: "销假被驳回",
};

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

const checkinStyles: Record<string, string> = {
  none: "bg-slate-100 text-slate-600 border-slate-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  done: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
};

export function LeaveTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-medium text-indigo-700">
      {LEAVE_TYPE_LABEL[type] ?? type}
    </span>
  );
}

export function LeaveStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        statusStyles[status] ?? "bg-slate-100 text-slate-600 border-slate-200"
      )}
    >
      {LEAVE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function CheckinBadge({ status }: { status: string | null }) {
  const key = status ?? "none";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        checkinStyles[key] ?? checkinStyles.none
      )}
    >
      {CHECKIN_STATUS_LABEL[key] ?? "未销假"}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("bg-white rounded-xl border border-slate-200 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function messageTypeLabel(type: string): string {
  const map: Record<string, string> = {
    approval: "审批通知",
    todo: "待办提醒",
    overdue: "超时预警",
    system: "系统通知",
  };
  return map[type] ?? type;
}

export function messageTypeClass(type: string): string {
  const map: Record<string, string> = {
    approval: "bg-indigo-100 text-indigo-700",
    todo: "bg-amber-100 text-amber-700",
    overdue: "bg-rose-100 text-rose-700",
    system: "bg-slate-100 text-slate-600",
  };
  return map[type] ?? "bg-slate-100 text-slate-600";
}

export { cn };

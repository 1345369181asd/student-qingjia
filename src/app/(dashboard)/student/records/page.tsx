"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  PageHeader,
  LeaveStatusBadge,
  LeaveTypeBadge,
  CheckinBadge,
  LoadingSpinner,
  EmptyState,
  authHeaders,
  formatDateTime,
  formatDuration,
} from "@/components/shared";
import { MapPin, XCircle, ChevronDown, ChevronUp, FileText, ShieldQuestion } from "lucide-react";

interface ApprovalRecord {
  node_order: number;
  node_name: string;
  approver_name: string | null;
  action: string;
  comment: string | null;
  created_at: string;
}
interface Attachment {
  id: string;
  file_name: string;
  file_size: number | null;
}
interface LeaveRow {
  id: string;
  request_no: string;
  leave_type: string;
  leave_type_name?: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  reason: string;
  status: string;
  checkin_status: string;
  checkin_in_fence: boolean | null;
  checkin_remark: string | null;
  leave_school: boolean;
  sleep_outside: boolean;
  destination: string | null;
  created_at: string;
  records?: ApprovalRecord[];
  attachments?: Attachment[];
}

export default function StudentRecords() {
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leaves?include=detail", { headers: authHeaders() });
      const data = await res.json();
      setLeaves(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, kind: "revoke" | "manual") => {
    setBusy(id);
    setToast(null);
    try {
      if (kind === "revoke") {
        const res = await fetch(`/api/leaves/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "撤回失败");
        setToast({ ok: true, text: "申请已撤回" });
      } else {
        const res = await fetch(`/api/leaves/${id}/checkin`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ forceSubmit: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "提交失败");
        setToast({ ok: true, text: "人工核验申请已提交，请等待管理员处理" });
      }
      load();
    } catch (err) {
      setToast({ ok: false, text: err instanceof Error ? err.message : "操作失败" });
    } finally {
      setBusy(null);
    }
  };

  const downloadFile = async (attId: string, name: string) => {
    const res = await fetch(`/api/files/${attId}/url`, { headers: authHeaders() });
    const data = await res.json();
    if (data.url) window.open(data.url as string, "_blank");
    else setToast({ ok: false, text: `无法打开附件 ${name}` });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="请假记录" description="查看申请进度、审批意见，可撤回待审批申请或办理销假" />

      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            toast.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {toast.text}
        </div>
      )}

      {loading ? (
        <Card className="p-10 flex justify-center">
          <LoadingSpinner />
        </Card>
      ) : leaves.length === 0 ? (
        <Card className="p-6">
          <EmptyState text="暂无请假记录" />
        </Card>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => {
            const open = expanded === leave.id;
            const canRevoke = ["pending", "approving"].includes(leave.status);
            const canCheckin =
              leave.status === "approved" && ["none", "rejected"].includes(leave.checkin_status);
            return (
              <Card key={leave.id} className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <LeaveTypeBadge type={leave.leave_type} />
                      <LeaveStatusBadge status={leave.status} />
                      <CheckinBadge status={leave.checkin_status} />
                      <span className="text-xs text-slate-400">{leave.request_no}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      {formatDateTime(leave.start_time)} ~ {formatDateTime(leave.end_time)}（
                      {formatDuration(leave)}）
                    </p>
                    <p className="mt-1 text-sm text-slate-500 line-clamp-1">{leave.reason}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canRevoke && (
                      <button
                        onClick={() => act(leave.id, "revoke")}
                        disabled={busy === leave.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> 撤回
                      </button>
                    )}
                    {canCheckin && (
                      <a
                        href="/student"
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50"
                      >
                        <MapPin className="h-3.5 w-3.5" /> 去销假
                      </a>
                    )}
                    <button
                      onClick={() => setExpanded(open ? null : leave.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      详情
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="mt-4 border-t border-slate-100 pt-4 space-y-4 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-slate-600">
                      <p>是否离校：{leave.leave_school ? "是" : "否"}</p>
                      <p>是否外宿：{leave.sleep_outside ? "是" : "否"}</p>
                      {leave.destination && <p>目的地：{leave.destination}</p>}
                      <p>提交时间：{formatDateTime(leave.created_at)}</p>
                    </div>

                    {leave.checkin_status !== "none" && (
                      <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
                        <p className="font-medium text-slate-700">销假信息</p>
                        <p className="mt-1">
                          状态：
                          {leave.checkin_in_fence === true
                            ? "围栏内打卡"
                            : leave.checkin_in_fence === false
                              ? "围栏外（人工核验）"
                              : "—"}
                        </p>
                        {leave.checkin_remark && <p className="mt-1">备注：{leave.checkin_remark}</p>}
                        {canCheckin && (
                          <button
                            onClick={() => act(leave.id, "manual")}
                            disabled={busy === leave.id}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50"
                          >
                            <ShieldQuestion className="h-3.5 w-3.5" /> 申请人工核验返校
                          </button>
                        )}
                      </div>
                    )}

                    {leave.attachments && leave.attachments.length > 0 && (
                      <div>
                        <p className="font-medium text-slate-700 mb-2">凭证附件</p>
                        <div className="flex flex-wrap gap-2">
                          {leave.attachments.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => downloadFile(a.id, a.file_name)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                            >
                              <FileText className="h-3.5 w-3.5" /> {a.file_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="font-medium text-slate-700 mb-2">审批轨迹</p>
                      {leave.records && leave.records.length > 0 ? (
                        <ol className="space-y-2 border-l-2 border-slate-100 pl-4">
                          {leave.records
                            .slice()
                            .sort((a, b) => a.node_order - b.node_order)
                            .map((r, i) => (
                              <li key={i} className="relative">
                                <p className="text-sm text-slate-700">
                                  {r.node_name} · {r.approver_name ?? "—"} ·{" "}
                                  <span
                                    className={
                                      r.action === "approved" ? "text-emerald-600" : "text-rose-600"
                                    }
                                  >
                                    {r.action === "approved" ? "通过" : "驳回"}
                                  </span>
                                </p>
                                {r.comment && <p className="text-xs text-slate-500">意见：{r.comment}</p>}
                                <p className="text-xs text-slate-400">{formatDateTime(r.created_at)}</p>
                              </li>
                            ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-slate-400">暂无审批记录</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

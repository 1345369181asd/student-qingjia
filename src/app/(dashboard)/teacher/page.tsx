"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Card,
  PageHeader,
  LeaveStatusBadge,
  LeaveTypeBadge,
  LoadingSpinner,
  EmptyState,
  getToken,
  openAttachment,
  formatDateTime,
  formatDuration,
} from "@/components/shared";
import { Paperclip, Eye } from "lucide-react";

interface LeaveRow {
  id: string;
  request_no: string;
  leave_type: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  duration_days?: number | null;
  leave_school: boolean;
  sleep_outside: boolean;
  status: string;
  reason: string;
  destination: string | null;
  contact_phone: string | null;
  student_name_snapshot: string | null;
  student_no_snapshot: string | null;
  class_name_snapshot: string | null;
  files?: Array<{ id: string; file_name: string; content_type: string | null }>;
}

export default function TeacherPending() {
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionId, setActionId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/leaves?scope=todo&pageSize=100", {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = (await res.json()) as { data: LeaveRow[] };
    setLeaves(data.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSelected = useMemo(
    () => leaves.length > 0 && leaves.every((lv) => selected.has(lv.id)),
    [leaves, selected]
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(leaves.map((lv) => lv.id)));
  };

  const [detailId, setDetailId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const detailLeave = leaves.find((lv) => lv.id === detailId) ?? null;

  const submit = async (id: string, action: "approved" | "rejected", batch = false) => {
    // 单条驳回必须填写意见（需求：驳回应说明原因）
    if (!batch && action === "rejected" && !comment.trim()) {
      setFormError("驳回时必须填写审批意见");
      return;
    }
    setFormError("");
    setSubmitting(true);
    const ids = batch ? Array.from(selected) : [id];
    const res = await fetch(batch ? "/api/leaves/batch-approve" : `/api/leaves/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(
        batch
          ? { ids, action, comment: comment.trim() || undefined }
          : { action, comment: comment.trim() || undefined }
      ),
    });
    if (res.ok) {
      setActionId(null);
      setComment("");
      setSelected(new Set());
      await load();
    } else {
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(d?.error ?? "操作失败");
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="待审批请假"
        description="审批你管理范围内学生的请假申请"
        actions={
          selected.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">已选 {selected.size} 条</span>
              <button
                disabled={submitting}
                onClick={() => void submit("", "approved", true)}
                className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                批量通过
              </button>
              <button
                disabled={submitting}
                onClick={() => void submit("", "rejected", true)}
                className="px-3 py-1.5 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
              >
                批量驳回
              </button>
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : leaves.length === 0 ? (
        <EmptyState text="暂无待审批申请" />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th className="px-4 py-3 text-left font-medium">学生</th>
                  <th className="px-4 py-3 text-left font-medium">类型</th>
                  <th className="px-4 py-3 text-left font-medium">起止时间</th>
                  <th className="px-4 py-3 text-left font-medium">时长</th>
                  <th className="px-4 py-3 text-left font-medium">事由</th>
                  <th className="px-4 py-3 text-left font-medium">凭证</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.map((lv) => (
                  <tr key={lv.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(lv.id)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(lv.id)) next.delete(lv.id);
                          else next.add(lv.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{lv.student_name_snapshot}</p>
                      <p className="text-xs text-slate-400">
                        {lv.student_no_snapshot} · {lv.class_name_snapshot}
                      </p>
                      <p className="font-mono text-[11px] text-slate-300 mt-0.5">{lv.request_no}</p>
                    </td>
                    <td className="px-4 py-3">
                      <LeaveTypeBadge type={lv.leave_type} />
                      {lv.leave_school && (
                        <span className="ml-1 text-xs text-amber-600">离校</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                      {new Date(lv.start_time).toLocaleString("zh-CN", { hour12: false })}
                      <br />~ {new Date(lv.end_time).toLocaleString("zh-CN", { hour12: false })}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDuration(lv)}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[220px]">
                      <p className="line-clamp-2">{lv.reason}</p>
                      {lv.destination && <p className="text-xs text-slate-400 mt-1">去向：{lv.destination}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {lv.files && lv.files.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {lv.files.slice(0, 2).map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                void openAttachment(f.id).catch((e: unknown) =>
                                  alert(e instanceof Error ? e.message : "打开失败")
                                );
                              }}
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline max-w-[140px]"
                              title={f.file_name}
                            >
                              <Paperclip className="h-3 w-3 shrink-0" />
                              <span className="truncate">{f.file_name}</span>
                            </button>
                          ))}
                          {lv.files.length > 2 && (
                            <span className="text-[11px] text-slate-400">
                              等 {lv.files.length} 个
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">无</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setDetailId(lv.id)}
                          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          详情
                        </button>
                        <button
                          onClick={() => {
                            setActionId(actionId === lv.id ? null : lv.id);
                            setComment("");
                            setFormError("");
                          }}
                          className="text-sm text-indigo-600 hover:text-indigo-800"
                        >
                          审批
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {actionId && (
            <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-3">
              {formError && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="审批意见（通过可选；驳回必须填写原因）"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setActionId(null)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  disabled={submitting}
                  onClick={() => void submit(actionId, "rejected")}
                  className="px-4 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
                >
                  驳回
                </button>
                <button
                  disabled={submitting}
                  onClick={() => void submit(actionId, "approved")}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  通过
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {detailLeave && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
          onClick={() => setDetailId(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <div>
                <h3 className="font-semibold text-slate-800">请假申请详情</h3>
                <p className="text-xs text-slate-400 font-mono">{detailLeave.request_no}</p>
              </div>
              <button
                onClick={() => setDetailId(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              <DetailRow label="学生" value={`${detailLeave.student_name_snapshot}（${detailLeave.student_no_snapshot}）`} />
              <DetailRow label="班级" value={detailLeave.class_name_snapshot ?? "-"} />
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-20 shrink-0">类型</span>
                <LeaveTypeBadge type={detailLeave.leave_type} />
                {detailLeave.leave_school && (
                  <span className="text-xs text-amber-600">离校{detailLeave.sleep_outside ? "·外宿" : ""}</span>
                )}
              </div>
              <DetailRow
                label="起止时间"
                value={`${formatDateTime(detailLeave.start_time)} 至 ${formatDateTime(detailLeave.end_time)}（${formatDuration(detailLeave)}）`}
              />
              {detailLeave.destination && <DetailRow label="目的地" value={detailLeave.destination} />}
              {detailLeave.contact_phone && <DetailRow label="紧急联系" value={detailLeave.contact_phone} />}
              <div>
                <p className="text-slate-500 mb-1">请假事由</p>
                <p className="bg-slate-50 rounded-lg p-3 text-slate-700 whitespace-pre-wrap">{detailLeave.reason}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-1.5">证明附件</p>
                {detailLeave.files && detailLeave.files.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {detailLeave.files.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          void openAttachment(f.id).catch((e: unknown) =>
                            alert(e instanceof Error ? e.message : "打开失败")
                          )
                        }
                        className="inline-flex items-center gap-2 text-left text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <span className="truncate">{f.file_name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm">无附件</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                onClick={() => setDetailId(null)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setActionId(detailLeave.id);
                  setDetailId(null);
                  setComment("");
                  setFormError("");
                }}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                去审批
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-slate-500 w-20 shrink-0">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

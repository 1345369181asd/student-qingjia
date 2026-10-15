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
} from "@/components/shared";

interface LeaveRow {
  id: string;
  request_no: string;
  leave_type: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  leave_school: boolean;
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

  const submit = async (id: string, action: "approved" | "rejected", batch = false) => {
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
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{lv.duration_hours} 小时</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[220px]">
                      <p className="line-clamp-2">{lv.reason}</p>
                      {lv.destination && <p className="text-xs text-slate-400 mt-1">去向：{lv.destination}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {lv.files && lv.files.length > 0 ? (
                        <span className="text-xs text-indigo-600">{lv.files.length} 个附件</span>
                      ) : (
                        <span className="text-xs text-slate-300">无</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setActionId(actionId === lv.id ? null : lv.id);
                          setComment("");
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        审批
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {actionId && (
            <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="审批意见（可选，驳回时建议填写原因）"
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
    </div>
  );
}

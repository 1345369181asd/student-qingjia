"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  Card,
  PageHeader,
  LoadingSpinner,
  EmptyState,
  getToken,
} from "@/components/shared";

interface CheckinRecord {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  in_fence: boolean;
  method: string;
  campus_name: string | null;
  status: string;
  created_at: string;
}

interface LeaveRow {
  id: string;
  request_no: string;
  student_name_snapshot: string | null;
  student_no_snapshot: string | null;
  class_name_snapshot: string | null;
  end_time: string;
  checkin_status: string;
  checkin_lat: number | null;
  checkin_lng: number | null;
  checkin_in_fence: boolean | null;
  checkin_records?: CheckinRecord[];
}

type Tab = "pending" | "done";

export default function TeacherCheckins() {
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/leaves?checkinStatus=pending&pageSize=100", {
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

  const pending = useMemo(
    () => leaves.filter((lv) => lv.checkin_status === "pending"),
    [leaves]
  );
  const done = useMemo(
    () => leaves.filter((lv) => ["done", "confirmed", "rejected", "manual"].includes(lv.checkin_status)),
    [leaves]
  );
  const list = tab === "pending" ? pending : done;

  const review = async (ids: string[], action: "approved" | "rejected") => {
    setBusy(true);
    let fail = 0;
    for (const id of ids) {
      const res = await fetch(`/api/leaves/${id}/checkin-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ action, comment: comment.trim() || undefined }),
      });
      if (!res.ok) fail += 1;
    }
    setBusy(false);
    setSelected(new Set());
    setComment("");
    if (fail > 0) alert(`${fail} 条处理失败`);
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="销假确认" description="确认学生返校定位打卡" />

      <div className="flex gap-2">
        {([
          ["pending", `待确认 (${pending.length})`],
          ["done", "已处理"],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pending" && selected.size > 0 && (
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">已选 {selected.size} 条</span>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="确认意见（可选）"
            className="flex-1 min-w-[200px] px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
          <button
            disabled={busy}
            onClick={() => void review(Array.from(selected), "approved")}
            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            批量确认
          </button>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState text={tab === "pending" ? "暂无待确认销假" : "暂无已处理记录"} />
      ) : (
        <div className="space-y-4">
          {list.map((lv) => {
            const last = lv.checkin_records?.[lv.checkin_records.length - 1];
            return (
              <Card key={lv.id} className="p-5">
                <div className="flex flex-wrap items-start gap-3">
                  {tab === "pending" && (
                    <input
                      type="checkbox"
                      checked={selected.has(lv.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(lv.id)) next.delete(lv.id);
                        else next.add(lv.id);
                        setSelected(next);
                      }}
                      className="mt-1"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">
                      {lv.student_name_snapshot}
                      <span className="ml-2 text-sm text-slate-400">
                        {lv.student_no_snapshot} · {lv.class_name_snapshot}
                      </span>
                    </p>
                    <p className="font-mono text-xs text-slate-400 mt-0.5">{lv.request_no}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                      <span>
                        应返校：{new Date(lv.end_time).toLocaleString("zh-CN", { hour12: false })}
                      </span>
                      {last && (
                        <span className="flex items-center gap-1">
                          打卡精度：{Math.round(last.accuracy ?? 0)} 米
                          {last.in_fence ? (
                            <span className="text-emerald-600 flex items-center gap-0.5">
                              <CheckCircle2 className="w-4 h-4" /> 围栏内（{last.campus_name ?? ""}）
                            </span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-0.5">
                              <XCircle className="w-4 h-4" /> 围栏外
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {last && (
                      <p className="mt-1 text-xs text-slate-400">
                        坐标：{last.lat.toFixed(5)}, {last.lng.toFixed(5)}
                      </p>
                    )}
                  </div>
                  {tab === "pending" && (
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        onClick={() => void review([lv.id], "rejected")}
                        className="px-3 py-1.5 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-50"
                      >
                        驳回
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void review([lv.id], "approved")}
                        className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                      >
                        确认销假
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

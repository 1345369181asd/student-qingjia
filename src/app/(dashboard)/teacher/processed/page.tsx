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

interface ApprovalRecord {
  node_order: number;
  node_name: string;
  approver_name: string | null;
  action: string;
  comment: string | null;
  created_at: string;
}

interface LeaveRow {
  id: string;
  request_no: string;
  leave_type: string;
  start_time: string;
  end_time: string;
  status: string;
  reason: string;
  created_at: string;
  student_name_snapshot: string | null;
  student_no_snapshot: string | null;
  class_name_snapshot: string | null;
  approvals?: ApprovalRecord[];
}

export default function TeacherProcessed() {
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    const fetchLeaves = async () => {
      const res = await fetch("/api/leaves?pageSize=100", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = (await res.json()) as { data: LeaveRow[] };
      setLeaves(data.data ?? []);
      setLoading(false);
    };
    void fetchLeaves();
  }, []);

  // 仅展示本人已处理过（在 approval_records 中留有记录）且非待我处理的
  const processed = useMemo(
    () =>
      leaves.filter((lv) => {
        if (!lv.approvals || lv.approvals.length === 0) return false;
        const mine = lv.approvals.some((a) => a.action === "approved" || a.action === "rejected");
        if (!mine) return false;
        if (keyword && !`${lv.student_name_snapshot ?? ""}${lv.request_no}${lv.reason}`.includes(keyword)) {
          return false;
        }
        return true;
      }),
    [leaves, keyword]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="已处理记录" description="您经手审批过的请假申请" />

      <Card className="p-4">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索学号 / 姓名 / 编号 / 事由"
          className="w-full md:w-80 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : processed.length === 0 ? (
        <EmptyState text="暂无已处理记录" />
      ) : (
        <div className="space-y-4">
          {processed.map((lv) => (
            <Card key={lv.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">{lv.request_no}</span>
                    <LeaveTypeBadge type={lv.leave_type} />
                    <LeaveStatusBadge status={lv.status} />
                  </div>
                  <p className="mt-1 font-medium text-slate-900">
                    {lv.student_name_snapshot}
                    <span className="ml-2 text-sm text-slate-400">
                      {lv.student_no_snapshot} · {lv.class_name_snapshot}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-3 grid md:grid-cols-2 gap-2 text-sm text-slate-600">
                <p>
                  <span className="text-slate-400">起止时间：</span>
                  {new Date(lv.start_time).toLocaleString("zh-CN", { hour12: false })} 至{" "}
                  {new Date(lv.end_time).toLocaleString("zh-CN", { hour12: false })}
                </p>
                <p>
                  <span className="text-slate-400">事由：</span>
                  {lv.reason}
                </p>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
                {(lv.approvals ?? []).map((a, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs whitespace-nowrap">
                      {a.node_name}
                    </span>
                    <span className={a.action === "approved" ? "text-emerald-600" : "text-rose-600"}>
                      {a.action === "approved" ? "通过" : "驳回"}
                    </span>
                    <span className="text-slate-500">{a.approver_name}</span>
                    {a.comment && <span className="text-slate-500">意见：{a.comment}</span>}
                    <span className="ml-auto text-xs text-slate-400">
                      {new Date(a.created_at).toLocaleString("zh-CN", { hour12: false })}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

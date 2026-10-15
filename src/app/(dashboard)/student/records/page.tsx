"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  PageHeader,
  LeaveStatusBadge,
  LeaveTypeBadge,
  CheckinBadge,
} from "@/components/shared";
import { Loader2, MapPin, XCircle, FileText, ChevronDown, ChevronUp } from "lucide-react";

interface ApprovalRecord {
  node_order: number;
  node_name: string;
  approver_name: string | null;
  status: string;
  comment: string | null;
  handled_at: string | null;
  created_at: string;
}
interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
}
interface LeaveRow {
  id: string;
  request_no: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  reason: string;
  contact_phone: string | null;
  status: string;
  checkin_status: string;
  checkin_remark: string | null;
  created_at: string;
  final_comment: string | null;
  approver_final_name: string | null;
  approval_records?: ApprovalRecord[];
  attachments?: Attachment[];
}

export default function StudentRecords() {
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const load = async () => {
    const res = await fetch("/api/leaves?include=detail", { credentials: "include" });
    const data = await res.json();
    setLeaves(data.data ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const revoke = async (id: string) => {
    if (!confirm("确定撤销该请假申请吗？")) return;
    setActionId(id);
    const res = await fetch(`/api/leaves/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json();
    setTip({ id, ok: res.ok, msg: data.error ?? "已撤销" });
    setActionId(null);
    if (res.ok) load();
  };

  const checkin = async (id: string) => {
    setActionId(id);
    setTip(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const res = await fetch(`/api/leaves/${id}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }),
      });
      const data = await res.json();
      setTip({ id, ok: res.ok, msg: data.error ?? data.message ?? "销假待确认" });
      if (res.ok) load();
    } catch {
      setTip({ id, ok: false, msg: "定位失败，请检查位置权限，或使用模拟打卡" });
    } finally {
      setActionId(null);
    }
  };

  const mockCheckin = async (id: string) => {
    setActionId(id);
    const res = await fetch(`/api/leaves/${id}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ lat: 0, lng: 0, accuracy: 10, mock: true }),
    });
    const data = await res.json();
    setTip({ id, ok: res.ok, msg: data.error ?? "模拟销假待确认" });
    setActionId(null);
    if (res.ok) load();
  };

  const downloadFile = async (attId: string, name: string) => {
    const res = await fetch(`/api/files/${attId}/url`, { credentials: "include" });
    const data = await res.json();
    if (res.ok && data.url) window.open(data.url, "_blank");
    else alert(data.error ?? "获取下载链接失败");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="请假记录" description="查看申请进度、审批轨迹、附件与销假状态" />
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
        </div>
      ) : leaves.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400">
          暂无记录，
          <Link href="/student/apply" className="text-indigo-600 hover:underline">
            去发起请假
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => (
            <Card key={leave.id} className="p-5">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <LeaveTypeBadge type={leave.leave_type} />
                  <LeaveStatusBadge status={leave.status} />
                  <CheckinBadge status={leave.checkin_status} />
                  <span className="text-xs text-slate-400 ml-auto">{leave.request_no}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <p className="text-slate-500">
                    时间：<span className="text-slate-800">{leave.start_date} ~ {leave.end_date}</span>
                  </p>
                  <p className="text-slate-500">
                    天数：<span className="text-slate-800">{leave.duration_days} 天</span>
                  </p>
                  <p className="text-slate-500">
                    提交：<span className="text-slate-800">{leave.created_at.slice(0, 16).replace("T", " ")}</span>
                  </p>
                </div>
                <p className="text-sm text-slate-700">事由：{leave.reason}</p>
                {leave.checkin_remark && (
                  <p className="text-xs text-amber-600">销假备注：{leave.checkin_remark}</p>
                )}
                {tip?.id === leave.id && (
                  <p className={`text-sm ${tip.ok ? "text-emerald-600" : "text-rose-600"}`}>{tip.msg}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {["pending", "in_progress"].includes(leave.status) && (
                    <button
                      onClick={() => revoke(leave.id)}
                      disabled={actionId === leave.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 text-rose-600 px-3 py-1.5 text-xs font-medium hover:bg-rose-50 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      撤销申请
                    </button>
                  )}
                  {leave.status === "approved" && ["none", "rejected"].includes(leave.checkin_status) && (
                    <>
                      <button
                        onClick={() => checkin(leave.id)}
                        disabled={actionId === leave.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-700 disabled:opacity-50"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        定位销假
                      </button>
                      <button
                        onClick={() => mockCheckin(leave.id)}
                        disabled={actionId === leave.id}
                        className="rounded-lg border border-slate-300 text-slate-500 px-3 py-1.5 text-xs hover:bg-slate-50"
                      >
                        模拟打卡（演示）
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setExpanded(expanded === leave.id ? null : leave.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 text-slate-600 px-3 py-1.5 text-xs hover:bg-slate-50 ml-auto"
                  >
                    {expanded === leave.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    审批轨迹
                  </button>
                </div>
                {expanded === leave.id && (
                  <div className="mt-2 border-t border-slate-100 pt-4 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2">审批流程</p>
                      <ol className="relative border-l-2 border-slate-100 ml-2 space-y-4">
                        {(leave.approval_records ?? []).map((r) => (
                          <li key={r.node_order} className="ml-4">
                            <span className={`absolute -left-[7px] h-3 w-3 rounded-full ${
                              r.status === "approved" ? "bg-emerald-500" :
                              r.status === "rejected" ? "bg-rose-500" :
                              r.status === "cancelled" ? "bg-slate-300" : "bg-amber-400"
                            }`} />
                            <p className="text-sm font-medium text-slate-800">
                              {r.node_order}. {r.node_name}
                              <span className="ml-2 text-xs text-slate-400">
                                {r.approver_name ?? "待分配"}
                              </span>
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {r.status === "pending"
                                ? `等待处理（${r.created_at.slice(0, 16).replace("T", " ")}）`
                                : `${r.status === "approved" ? "通过" : r.status === "rejected" ? "驳回" : "终止"} · ${r.handled_at?.slice(0, 16).replace("T", " ")}`}
                            </p>
                            {r.comment && <p className="text-xs text-slate-600 mt-1">意见：{r.comment}</p>}
                          </li>
                        ))}
                      </ol>
                      {leave.status === "rejected" && leave.final_comment && (
                        <p className="mt-3 text-sm text-rose-600">最终驳回意见：{leave.final_comment}</p>
                      )}
                    </div>
                    {leave.attachments && leave.attachments.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2">证明材料</p>
                        <div className="flex flex-wrap gap-2">
                          {leave.attachments.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => downloadFile(a.id, a.file_name)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {a.file_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

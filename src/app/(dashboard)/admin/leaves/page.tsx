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
  getToken,
  openAttachment,
  formatDateTime,
  formatDuration,
} from "@/components/shared";
import { Download, Paperclip, Eye, Undo2, ShieldCheck } from "lucide-react";

interface FileRow {
  id: string;
  file_name: string;
}
interface ApprovalRow {
  id: string;
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
  duration_hours: number;
  leave_school: boolean;
  sleep_outside: boolean;
  status: string;
  reason: string;
  destination: string | null;
  contact_phone: string | null;
  checkin_status: string;
  is_overdue: boolean;
  created_at: string;
  student_name_snapshot: string | null;
  student_no_snapshot: string | null;
  class_name_snapshot: string | null;
  department_snapshot?: string | null;
  major_name_snapshot?: string | null;
  grade_snapshot?: string | null;
  files?: FileRow[];
  approvals?: ApprovalRow[];
}
interface ClassRow {
  id: string;
  name: string;
}

const STATUS_OPTS = [
  { v: "", l: "全部状态" },
  { v: "pending", l: "待审批" },
  { v: "approving", l: "审批中" },
  { v: "approved", l: "已通过" },
  { v: "rejected", l: "已驳回" },
  { v: "revoked", l: "已撤销" },
];
const CHECKIN_OPTS = [
  { v: "", l: "全部销假" },
  { v: "none", l: "未销假" },
  { v: "pending", l: "待确认" },
  { v: "done", l: "已确认" },
];

export default function AdminLeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [types, setTypes] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;

  const [filters, setFilters] = useState({
    status: "",
    type: "",
    checkinStatus: "",
    classId: "",
    keyword: "",
    startFrom: "",
    startTo: "",
    overdue: "",
  });
  // 已应用的筛选（点击查询才生效）
  const [applied, setApplied] = useState(filters);
  const [detail, setDetail] = useState<LeaveRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/classes", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json())
      .then((d) => setClasses(d.data ?? []));
    fetch("/api/leave-types", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json())
      .then((d) => setTypes(d.data ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (applied.status) qs.set("status", applied.status);
    if (applied.type) qs.set("type", applied.type);
    if (applied.checkinStatus) qs.set("checkinStatus", applied.checkinStatus);
    if (applied.classId) qs.set("classId", applied.classId);
    if (applied.keyword) qs.set("studentName", applied.keyword);
    if (applied.startFrom) qs.set("startFrom", applied.startFrom);
    if (applied.startTo) qs.set("startTo", applied.startTo);
    if (applied.overdue === "1") qs.set("overdue", "1");
    const res = await fetch(`/api/leaves?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const d = (await res.json()) as { data: LeaveRow[]; total?: number };
    setLeaves(d.data ?? []);
    setTotal(d.total ?? 0);
    setLoading(false);
  }, [applied, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    const qs = new URLSearchParams();
    if (applied.status) qs.set("status", applied.status);
    if (applied.type) qs.set("type", applied.type);
    if (applied.checkinStatus) qs.set("checkinStatus", applied.checkinStatus);
    if (applied.classId) qs.set("classId", applied.classId);
    if (applied.keyword) qs.set("studentName", applied.keyword);
    if (applied.startFrom) qs.set("startFrom", applied.startFrom);
    if (applied.startTo) qs.set("startTo", applied.startTo);
    window.open(`/api/leaves/export?${qs.toString()}`, "_blank");
  };

  const revoke = async (lv: LeaveRow) => {
    const reason = window.prompt(`撤销 ${lv.request_no}？请填写撤销原因（会通知学生）`, "");
    if (reason === null) return;
    setBusy(true);
    const res = await fetch(`/api/leaves/${lv.id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ reason }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setDetail(null);
      void load();
    } else {
      alert(d.error ?? "撤销失败");
    }
  };

  const manualVerify = async (lv: LeaveRow) => {
    const remark = window.prompt(`人工核验 ${lv.request_no} 的返校销假，请填写核验说明`, "已核实学生返校");
    if (remark === null) return;
    setBusy(true);
    const res = await fetch(`/api/leaves/${lv.id}/manual-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ remark }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setDetail(null);
      void load();
    } else {
      alert(d.error ?? "核验失败");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const inputCls =
    "rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="space-y-6">
      <PageHeader
        title="全部请假记录"
        description="查看全校学生请假，可筛选、导出、撤销与人工核验"
        actions={
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            导出 CSV
          </button>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className={inputCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            {STATUS_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
          <select className={inputCls} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">全部类型</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>
          <select className={inputCls} value={filters.checkinStatus} onChange={(e) => setFilters({ ...filters, checkinStatus: e.target.value })}>
            {CHECKIN_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
          <select className={inputCls} value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}>
            <option value="">全部班级</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            className={inputCls}
            placeholder="学生姓名"
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
          />
          <input type="date" className={inputCls} value={filters.startFrom} onChange={(e) => setFilters({ ...filters, startFrom: e.target.value })} title="开始日期起" />
          <input type="date" className={inputCls} value={filters.startTo} onChange={(e) => setFilters({ ...filters, startTo: e.target.value })} title="开始日期止" />
          <select className={inputCls} value={filters.overdue} onChange={(e) => setFilters({ ...filters, overdue: e.target.value })}>
            <option value="">是否逾期</option>
            <option value="1">仅看逾期</option>
            <option value="0">全部</option>
          </select>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              setPage(1);
              setApplied(filters);
            }}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            查询
          </button>
          <button
            onClick={() => {
              const empty = { status: "", type: "", checkinStatus: "", classId: "", keyword: "", startFrom: "", startTo: "", overdue: "" };
              setFilters(empty);
              setApplied(empty);
              setPage(1);
            }}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            重置
          </button>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : leaves.length === 0 ? (
        <EmptyState text="暂无符合条件的请假记录" />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">编号 / 学生</th>
                  <th className="px-4 py-3 text-left font-medium">类型</th>
                  <th className="px-4 py-3 text-left font-medium">起止时间</th>
                  <th className="px-4 py-3 text-left font-medium">状态</th>
                  <th className="px-4 py-3 text-left font-medium">销假</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.map((lv) => (
                  <tr key={lv.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3">
                      <p className="font-mono text-[11px] text-slate-400">{lv.request_no}</p>
                      <p className="font-medium text-slate-800">
                        {lv.student_name_snapshot}
                        {lv.is_overdue && <span className="ml-1 text-xs text-rose-500">逾期</span>}
                      </p>
                      <p className="text-xs text-slate-400">{lv.student_no_snapshot} · {lv.class_name_snapshot}</p>
                      {(lv.department_snapshot || lv.major_name_snapshot) && (
                        <p className="text-xs text-slate-400">
                          {[lv.department_snapshot, lv.major_name_snapshot, lv.grade_snapshot].filter(Boolean).join(" / ")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <LeaveTypeBadge type={lv.leave_type} />
                      {lv.leave_school && <span className="ml-1 text-xs text-amber-600">离校</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {formatDateTime(lv.start_time)}
                      <br />~ {formatDateTime(lv.end_time)}
                      <span className="text-slate-400">（{formatDuration(lv)}）</span>
                    </td>
                    <td className="px-4 py-3"><LeaveStatusBadge status={lv.status} /></td>
                    <td className="px-4 py-3"><CheckinBadge status={lv.checkin_status} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setDetail(lv)} className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
                        <Eye className="h-3.5 w-3.5" />详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>共 {total} 条</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50">上一页</button>
              <span>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50">下一页</button>
            </div>
          </div>
        </Card>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" onClick={() => !busy && setDetail(null)}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-slate-800">申请详情 <span className="font-mono text-xs text-slate-400 ml-1">{detail.request_no}</span></h3>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              <Row label="学生" value={`${detail.student_name_snapshot}（${detail.student_no_snapshot}）· ${detail.class_name_snapshot ?? ""}`} />
              <div className="flex items-center gap-2"><span className="text-slate-500 w-20 shrink-0">类型</span><LeaveTypeBadge type={detail.leave_type} /></div>
              <Row label="起止时间" value={`${formatDateTime(detail.start_time)} 至 ${formatDateTime(detail.end_time)}（${formatDuration(detail)}）`} />
              {detail.destination && <Row label="目的地" value={`${detail.destination}${detail.sleep_outside ? " · 外宿" : ""}`} />}
              {detail.contact_phone && <Row label="紧急联系" value={detail.contact_phone} />}
              <div>
                <p className="text-slate-500 mb-1">事由</p>
                <p className="bg-slate-50 rounded-lg p-3 text-slate-700 whitespace-pre-wrap">{detail.reason}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-500 w-20 shrink-0">审批状态</span>
                <LeaveStatusBadge status={detail.status} />
                <CheckinBadge status={detail.checkin_status} />
              </div>
              {detail.approvals && detail.approvals.length > 0 && (
                <div>
                  <p className="text-slate-500 mb-1.5">审批轨迹</p>
                  <div className="space-y-2">
                    {detail.approvals.map((a) => (
                      <div key={a.id} className="border border-slate-200 rounded-lg p-2.5 text-xs">
                        <div className="flex justify-between">
                          <span className="font-medium text-slate-700">{a.node_name} · {a.approver_name}</span>
                          <span className={a.action === "approved" ? "text-emerald-600" : "text-rose-600"}>
                            {a.action === "approved" ? "通过" : "驳回"}
                          </span>
                        </div>
                        {a.comment && <p className="text-slate-500 mt-1">{a.comment}</p>}
                        <p className="text-slate-300 mt-0.5">{formatDateTime(a.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-slate-500 mb-1.5">凭证附件</p>
                {detail.files && detail.files.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {detail.files.map((f) => (
                      <button key={f.id} type="button" onClick={() => void openAttachment(f.id).catch((e: unknown) => alert(e instanceof Error ? e.message : "打开失败"))} className="inline-flex items-center gap-2 text-left text-indigo-600 hover:underline">
                        <Paperclip className="h-4 w-4 shrink-0" /><span className="truncate">{f.file_name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400">无附件</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2 sticky bottom-0 bg-white">
              {detail.checkin_status === "pending" && (
                <button disabled={busy} onClick={() => void manualVerify(detail)} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                  <ShieldCheck className="h-4 w-4" />人工核验销假
                </button>
              )}
              {["pending", "approving", "approved"].includes(detail.status) && (
                <button disabled={busy} onClick={() => void revoke(detail)} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">
                  <Undo2 className="h-4 w-4" />撤销申请
                </button>
              )}
              <button onClick={() => setDetail(null)} className="px-3.5 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-slate-500 w-20 shrink-0">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, authHeaders, getToken } from "@/components/shared";
import {
  Users,
  FileText,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Download,
  School,
  MapPinned,
  GitBranch,
  History,
} from "lucide-react";

interface Stats {
  summary: {
    total: number;
    approved: number;
    rejected: number;
    revoked: number;
    pending: number;
    checkedIn: number;
    checkinRate: number;
    overdue: number;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState("");

  useEffect(() => {
    fetch("/api/stats", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setStats(d.data));
  }, []);

  const scan = async () => {
    setScanning(true);
    setScanResult("");
    try {
      const res = await fetch("/api/admin/scan-alerts", {
        method: "POST",
        headers: authHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "扫描失败");
      setScanResult(
        `扫描完成：新增逾期未销假预警 ${d.data.overdue ?? 0} 条，审批超时预警 ${
          d.data.timeout ?? 0
        } 条`
      );
    } catch (err) {
      setScanResult(err instanceof Error ? err.message : "扫描失败");
    } finally {
      setScanning(false);
    }
  };

  const exportCsv = () => {
    const token = getToken();
    // 带鉴权头下载：先取 blob 再触发保存
    fetch("/api/leaves/export", { headers: authHeaders() })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "请假记录.csv";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {
        // 兜底：直接打开（带 token query 不支持时忽略）
        void token;
      });
  };

  const cards = [
    { label: "请假总数", value: stats?.summary.total ?? "-", icon: FileText, color: "text-indigo-600 bg-indigo-50" },
    { label: "待处理", value: stats?.summary.pending ?? "-", icon: RefreshCw, color: "text-amber-600 bg-amber-50" },
    { label: "已通过", value: stats?.summary.approved ?? "-", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
    { label: "逾期未销假", value: stats?.summary.overdue ?? "-", icon: AlertTriangle, color: "text-rose-600 bg-rose-50" },
  ];

  const shortcuts = [
    { href: "/admin/students", label: "学生管理 / CSV 导入", icon: Users },
    { href: "/admin/teachers", label: "中队长账号管理", icon: Users },
    { href: "/admin/classes", label: "班级管理", icon: School },
    { href: "/admin/leaves", label: "全部请假记录", icon: FileText },
    { href: "/admin/stats", label: "统计报表", icon: CheckCircle2 },
    { href: "/admin/campuses", label: "校区与电子围栏", icon: MapPinned },
    { href: "/admin/leave-types", label: "请假类型配置", icon: FileText },
    { href: "/admin/flows", label: "审批流程配置", icon: GitBranch },
    { href: "/admin/logs", label: "操作日志", icon: History },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">管理工作台</h1>
          <p className="mt-1 text-sm text-slate-500">基础数据维护、审批流程配置与风险预警</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-2 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
            扫描超时/逾期
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            <Download className="h-4 w-4" />
            导出请假 CSV
          </button>
        </div>
      </div>
      {scanResult && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {scanResult}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm text-slate-500">{c.label}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <h2 className="font-semibold text-slate-900 mb-4">快捷入口</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shortcuts.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
            >
              <s.icon className="h-5 w-5 text-indigo-500 shrink-0" />
              <span className="text-sm font-medium text-slate-700">{s.label}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

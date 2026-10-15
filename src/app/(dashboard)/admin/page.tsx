"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/shared";
import { Users, FileText, AlertTriangle, CheckCircle2, RefreshCw, Download } from "lucide-react";

interface Stats {
  summary: {
    total: number;
    approved: number;
    rejected: number;
    cancelled: number;
    pending: number;
    checkedIn: number;
    overdue: number;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState("");

  useEffect(() => {
    fetch("/api/stats", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setStats(d.data));
  }, []);

  const scan = async () => {
    setScanning(true);
    setScanResult("");
    const res = await fetch("/api/admin/scan-alerts", {
      method: "POST",
      credentials: "include",
    });
    const d = await res.json();
    setScanning(false);
    if (res.ok) {
      setScanResult(`扫描完成：逾期未销假 ${d.data.overdue} 条，审批超时 ${d.data.timeout} 条`);
    }
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
    { href: "/admin/leaves", label: "全部请假记录与导出", icon: FileText },
    { href: "/admin/stats", label: "统计报表", icon: CheckCircle2 },
    { href: "/admin/settings", label: "校区围栏 / 类型 / 流程配置", icon: RefreshCw },
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
          <Link
            href="/api/leaves/export"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            <Download className="h-4 w-4" />
            导出请假 CSV
          </Link>
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

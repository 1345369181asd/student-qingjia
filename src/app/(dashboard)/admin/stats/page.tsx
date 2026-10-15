"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Download,
  TrendingUp,
  Users,
  FileCheck,
  Clock,
  MapPin,
} from "lucide-react";
import { LoadingSpinner, EmptyState, getToken } from "@/components/shared";

interface StatsData {
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
  byType: Record<string, number>;
  byClass: Record<string, number>;
  byReason: Record<string, number>;
  byDuration: Record<string, number>;
  approverStats: Array<{ name: string; approved: number; rejected: number }>;
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateRange.start) params.set("from", dateRange.start);
      if (dateRange.end) params.set("to", dateRange.end);
      const res = await fetch(`/api/stats?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { data: StatsData };
        setStats(data.data);
      }
      setLoading(false);
    };
    void fetchStats();
  }, [dateRange]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (dateRange.start) params.set("from", dateRange.start);
    if (dateRange.end) params.set("to", dateRange.end);
    window.open(`/api/leaves/export?${params.toString()}`, "_blank");
  };

  if (loading || !stats) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  const s = stats.summary;
  const cards = [
    { label: "总申请数", value: s.total, icon: BarChart3, color: "bg-indigo-100 text-indigo-600" },
    { label: "已通过", value: s.approved, icon: FileCheck, color: "bg-emerald-100 text-emerald-600" },
    { label: "处理中", value: s.pending, icon: Clock, color: "bg-amber-100 text-amber-600" },
    { label: "已驳回", value: s.rejected, icon: Users, color: "bg-rose-100 text-rose-600" },
    { label: "已销假", value: `${s.checkedIn}（${s.checkinRate}%）`, icon: MapPin, color: "bg-sky-100 text-sky-600" },
    { label: "逾期未销假", value: s.overdue, icon: TrendingUp, color: "bg-red-100 text-red-600" },
  ];

  const maxType = Math.max(1, ...Object.values(stats.byType));
  const maxClass = Math.max(1, ...Object.values(stats.byClass));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">统计报表</h1>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          导出 CSV
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 flex items-center gap-4 flex-wrap shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600">开始日期</label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600">结束日期</label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        {(dateRange.start || dateRange.end) && (
          <button
            onClick={() => setDateRange({ start: "", end: "" })}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            清除筛选
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <p className="text-xl font-bold text-slate-900">{card.value}</p>
            <p className="text-sm text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            按请假类型统计
          </h2>
          {Object.keys(stats.byType).length === 0 ? (
            <EmptyState text="暂无数据" />
          ) : (
            <div className="space-y-4">
              {Object.entries(stats.byType).map(([type, count]) => (
                <div key={type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{type}</span>
                    <span className="font-medium">{count} 次</span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxType) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">按班级统计</h2>
          {Object.keys(stats.byClass).length === 0 ? (
            <EmptyState text="暂无数据" />
          ) : (
            <div className="space-y-4">
              {Object.entries(stats.byClass)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <div key={name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600 truncate mr-2">{name}</span>
                      <span className="font-medium shrink-0">{count} 次</span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${(count / maxClass) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">按时长分布</h2>
          <div className="space-y-3">
            {Object.entries(stats.byDuration).map(([label, count]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{label}</span>
                <span className="font-medium text-slate-900">{count} 次</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">审批人处理量</h2>
          {stats.approverStats.length === 0 ? (
            <EmptyState text="暂无审批记录" />
          ) : (
            <div className="space-y-3">
              {stats.approverStats
                .slice()
                .sort((a, b) => b.approved + b.rejected - (a.approved + a.rejected))
                .map((a) => (
                  <div key={a.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 font-medium">{a.name}</span>
                    <span className="text-slate-500">
                      通过 <span className="text-emerald-600 font-semibold">{a.approved}</span> · 驳回{" "}
                      <span className="text-rose-600 font-semibold">{a.rejected}</span>
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">高频请假事由</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byReason).length === 0 ? (
            <EmptyState text="暂无数据" />
          ) : (
            Object.entries(stats.byReason)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([reason, count]) => (
                <span
                  key={reason}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-sm"
                >
                  {reason}
                  <span className="text-slate-400 text-xs">×{count}</span>
                </span>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

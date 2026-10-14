'use client';

import { useState, useEffect, useCallback } from 'react';

interface StatsData {
  total: number;
  byStatus: { pending: number; approved: number; rejected: number };
  byType: Record<string, number>;
  byClass: Record<string, number>;
  byDate: Record<string, number>;
}

const typeMap: Record<string, string> = { personal: '事假', sick: '病假', other: '其他' };

export default function AdminStatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start_date: '', end_date: '' });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateRange.start_date) params.set('start_date', dateRange.start_date);
    if (dateRange.end_date) params.set('end_date', dateRange.end_date);
    const res = await fetch(`/api/stats?${params}`);
    const data = await res.json();
    setStats(data.data);
    setLoading(false);
  }, [dateRange.start_date, dateRange.end_date]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading || !stats) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">统计报表</h1>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">加载中...</div>
      </div>
    );
  }

  const maxByClass = Math.max(...Object.values(stats.byClass), 1);
  const maxByDate = Math.max(...Object.values(stats.byDate), 1);
  const sortedDates = Object.entries(stats.byDate).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">统计报表</h1>
          <p className="text-slate-500 mt-1">请假数据多维度分析</p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={dateRange.start_date}
            onChange={e => setDateRange(p => ({ ...p, start_date: e.target.value }))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-500"
          />
          <span className="text-slate-400 text-sm">至</span>
          <input
            type="date"
            value={dateRange.end_date}
            onChange={e => setDateRange(p => ({ ...p, end_date: e.target.value }))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">总申请数</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">待审批</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">{stats.byStatus.pending}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">已通过</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.byStatus.approved}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">已驳回</p>
          <p className="text-3xl font-bold text-rose-600 mt-1">{stats.byStatus.rejected}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By type */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">按请假类型</h3>
          <div className="space-y-3">
            {Object.entries(stats.byType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-16">{typeMap[type] || type}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${Math.max((count / stats.total) * 100, 8)}%` }}
                  >
                    <span className="text-xs text-white font-medium">{count}</span>
                  </div>
                </div>
                <span className="text-sm text-slate-400 w-12 text-right">
                  {stats.total > 0 ? Math.round((count / stats.total) * 100) : 0}%
                </span>
              </div>
            ))}
            {Object.keys(stats.byType).length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>
            )}
          </div>
        </div>

        {/* By class */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">按班级</h3>
          <div className="space-y-3">
            {Object.entries(stats.byClass).map(([cls, count]) => (
              <div key={cls} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-28 truncate">{cls}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${Math.max((count / maxByClass) * 100, 8)}%` }}
                  >
                    <span className="text-xs text-white font-medium">{count}</span>
                  </div>
                </div>
              </div>
            ))}
            {Object.keys(stats.byClass).length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>
            )}
          </div>
        </div>

        {/* By date - timeline */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 lg:col-span-2">
          <h3 className="font-semibold text-slate-900 mb-4">按日期趋势</h3>
          {sortedDates.length > 0 ? (
            <div className="flex items-end gap-1 h-40">
              {sortedDates.map(([date, count]) => (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-slate-500">{count}</span>
                  <div
                    className="w-full bg-indigo-400 rounded-t transition-all hover:bg-indigo-500 min-h-[4px]"
                    style={{ height: `${Math.max((count / maxByDate) * 100, 5)}%` }}
                  />
                  <span className="text-[10px] text-slate-400 rotate-[-45deg] origin-left whitespace-nowrap w-0">
                    {date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">暂无数据</p>
          )}
        </div>
      </div>
    </div>
  );
}

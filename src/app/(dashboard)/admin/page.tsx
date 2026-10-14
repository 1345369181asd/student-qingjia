'use client';

import { useState, useEffect, useCallback } from 'react';

interface LeaveRecord {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  student: { username: string; name: string } | null;
  teacher: { name: string } | null;
  class: { name: string } | null;
  created_at: string;
}

const statusMap: Record<string, { label: string; className: string }> = {
  pending: { label: '待审批', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: '已通过', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: '已驳回', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const typeMap: Record<string, string> = { personal: '事假', sick: '病假', other: '其他' };

export default function AdminOverviewPage() {
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = filter !== 'all' ? `?status=${filter}` : '';
    const res = await fetch(`/api/leaves${params}`);
    const data = await res.json();
    setRecords(data.data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">请假总览</h1>
          <p className="text-slate-500 mt-1">查看所有请假记录</p>
        </div>
        <div className="flex gap-2">
          {[
            { value: 'all', label: '全部' },
            { value: 'pending', label: '待审批' },
            { value: 'approved', label: '已通过' },
            { value: 'rejected', label: '已驳回' },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">加载中...</div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">暂无记录</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 font-medium text-slate-600">学生</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">班级</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">类型</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">时间</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">事由</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">状态</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">审批人</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(r => {
                  const status = statusMap[r.status] || statusMap.pending;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{r.student?.name}</p>
                        <p className="text-xs text-slate-400">{r.student?.username}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{(r.student as unknown as Record<string, Record<string, string>> | null)?.classes?.name || '-'}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                          {typeMap[r.leave_type] || r.leave_type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{r.start_date} ~ {r.end_date}</td>
                      <td className="px-5 py-3 text-slate-600 max-w-[200px] truncate">{r.reason}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{r.teacher?.name || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';

interface LeaveRecord {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  approval_comment: string | null;
  student: { username: string; name: string } | null;
  class: { name: string } | null;
  approved_at: string;
}

const statusMap: Record<string, { label: string; className: string }> = {
  approved: { label: '已通过', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: '已驳回', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const typeMap: Record<string, string> = {
  personal: '事假',
  sick: '病假',
  other: '其他',
};

export default function TeacherProcessedPage() {
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/leaves?type=processed');
    const data = await res.json();
    setRecords(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">已处理记录</h1>
        <p className="text-slate-500 mt-1">共 {records.length} 条已处理的请假申请</p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          加载中...
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          暂无已处理记录
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 font-medium text-slate-600">学生</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">类型</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">时间</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">事由</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">状态</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">意见</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(r => {
                  const status = statusMap[r.status] || statusMap.approved;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-slate-900">{r.student?.name}</p>
                          <p className="text-xs text-slate-400">{r.student?.username}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                          {typeMap[r.leave_type] || r.leave_type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                        {r.start_date} ~ {r.end_date}
                      </td>
                      <td className="px-5 py-3 text-slate-600 max-w-[200px] truncate">{r.reason}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500 max-w-[150px] truncate">
                        {r.approval_comment || '-'}
                      </td>
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

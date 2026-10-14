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
  teacher: { name: string } | null;
  created_at: string;
}

const statusMap: Record<string, { label: string; className: string }> = {
  pending: { label: '待审批', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: '已通过', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: '已驳回', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const typeMap: Record<string, string> = {
  personal: '事假',
  sick: '病假',
  other: '其他',
};

export default function StudentRecordsPage() {
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

  const handleWithdraw = async (id: string) => {
    if (!confirm('确定要撤回这条请假申请吗？')) return;
    const res = await fetch(`/api/leaves/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchRecords();
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">请假记录</h1>
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
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          加载中...
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          暂无请假记录
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(record => {
            const status = statusMap[record.status] || statusMap.pending;
            return (
              <div key={record.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                        {typeMap[record.leave_type] || record.leave_type}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-900 font-medium">{record.reason}</p>
                    <p className="text-xs text-slate-400 mt-1.5">
                      {record.start_date} 至 {record.end_date}
                    </p>
                    {record.teacher && (
                      <p className="text-xs text-slate-400 mt-1">审批人：{record.teacher.name}</p>
                    )}
                    {record.approval_comment && (
                      <p className="text-xs text-slate-500 mt-1 bg-slate-50 inline-block px-2 py-1 rounded">
                        审批意见：{record.approval_comment}
                      </p>
                    )}
                  </div>
                  {record.status === 'pending' && (
                    <button
                      onClick={() => handleWithdraw(record.id)}
                      className="px-3 py-1.5 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors shrink-0"
                    >
                      撤回
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

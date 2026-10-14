'use client';

import { useState, useEffect, useCallback } from 'react';

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  student: { id: string; username: string; name: string; class_id: string } | null;
  class: { name: string } | null;
  created_at: string;
}

const typeMap: Record<string, string> = {
  personal: '事假',
  sick: '病假',
  other: '其他',
};

export default function TeacherPendingPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/leaves?type=pending');
    const data = await res.json();
    setRequests(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (id: string, action: 'approved' | 'rejected') => {
    setProcessing(id);
    const res = await fetch(`/api/leaves/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, comment: activeId === id ? comment : '' }),
    });
    if (res.ok) {
      fetchRequests();
      setActiveId(null);
      setComment('');
    }
    setProcessing(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">待审批申请</h1>
        <p className="text-slate-500 mt-1">
          共 {requests.length} 条待审批的请假申请
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          加载中...
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-slate-400 mb-2">
            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-500">暂无待审批的请假申请</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(req => (
            <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                      {typeMap[req.leave_type] || req.leave_type}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      待审批
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-medium">
                      {req.student?.name?.charAt(0)}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">{req.student?.name}</span>
                      <span className="text-xs text-slate-400 ml-2">{req.student?.username}</span>
                      {(req.student as unknown as Record<string, Record<string, string>> | undefined)?.classes && <span className="text-xs text-slate-400 ml-2">{(req.student as unknown as Record<string, Record<string, string>>).classes.name}</span>}
                    </div>
                  </div>

                  <p className="text-sm text-slate-700 mb-1.5">{req.reason}</p>
                  <p className="text-xs text-slate-400">
                    {req.start_date} 至 {req.end_date}
                  </p>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {activeId === req.id ? (
                    <>
                      <input
                        type="text"
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="审批意见（可选）"
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-indigo-500 outline-none w-48"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(req.id, 'approved')}
                          disabled={processing === req.id}
                          className="flex-1 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          通过
                        </button>
                        <button
                          onClick={() => handleApprove(req.id, 'rejected')}
                          disabled={processing === req.id}
                          className="flex-1 px-3 py-1.5 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
                        >
                          驳回
                        </button>
                        <button
                          onClick={() => { setActiveId(null); setComment(''); }}
                          className="px-3 py-1.5 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => setActiveId(req.id)}
                      className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      审批
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

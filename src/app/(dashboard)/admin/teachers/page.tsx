'use client';

import { useState, useEffect, useCallback } from 'react';

interface UserRecord {
  id: string;
  username: string;
  name: string;
  role: string;
  is_active: string;
  created_at: string;
}

export default function AdminTeachersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', name: '' });
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/users?role=teacher');
    const data = await res.json();
    setUsers(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (editingId) {
      const res = await fetch(`/api/users/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, password: form.password || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '更新失败');
        return;
      }
    } else {
      if (!form.password) { setError('请输入密码'); return; }
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'teacher' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '创建失败'); return; }
    }

    setShowForm(false);
    setEditingId(null);
    setForm({ username: '', password: '', name: '' });
    fetchData();
  };

  const handleEdit = (u: UserRecord) => {
    setEditingId(u.id);
    setForm({ username: u.username, password: '', name: u.name });
    setShowForm(true);
    setError('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该教师吗？')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    fetchData();
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">教师管理</h1>
          <p className="text-slate-500 mt-1">共 {users.length} 名教师</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ username: '', password: '', name: '' }); setError(''); }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          添加教师
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h3 className="font-semibold text-slate-900 mb-4">{editingId ? '编辑教师' : '添加教师'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-rose-50 text-rose-600 text-sm px-4 py-2 rounded-lg border border-rose-100">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">工号</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-sm"
                  disabled={!!editingId}
                  required={!editingId}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{editingId ? '新密码（留空不修改）' : '密码'}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-sm"
                  required={!editingId}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                {editingId ? '保存' : '创建'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 border border-slate-200 text-sm rounded-lg hover:bg-slate-50">
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">加载中...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 font-medium text-slate-600">工号</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">姓名</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">状态</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-900 font-mono text-xs">{u.username}</td>
                    <td className="px-5 py-3 text-slate-900">{u.name}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.is_active === 'true' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {u.is_active === 'true' ? '正常' : '停用'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEdit(u)} className="text-xs text-slate-500 hover:text-indigo-600">编辑</button>
                        <button onClick={() => handleDelete(u.id)} className="text-xs text-slate-500 hover:text-rose-600">删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

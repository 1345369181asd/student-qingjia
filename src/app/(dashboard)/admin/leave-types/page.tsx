"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { LoadingSpinner, EmptyState, getToken } from "@/components/shared";

interface LeaveType {
  id: string;
  code: string;
  name: string;
  need_proof: boolean;
  proof_desc: string | null;
  max_days_limit: number | null;
  sort_order: number;
  is_active: boolean;
}

export default function LeaveTypesPage() {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    need_proof: false,
    proof_desc: "",
    max_days_limit: "",
    sort_order: 0,
    is_active: true,
  });

  const fetchTypes = async () => {
    const res = await fetch("/api/leave-types", {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { data: LeaveType[] };
      setTypes(data.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchTypes();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", need_proof: false, proof_desc: "", max_days_limit: "", sort_order: 0, is_active: true });
    setShowForm(true);
  };

  const openEdit = (t: LeaveType) => {
    setEditing(t);
    setForm({
      code: t.code,
      name: t.name,
      need_proof: t.need_proof,
      proof_desc: t.proof_desc ?? "",
      max_days_limit: t.max_days_limit != null ? String(t.max_days_limit) : "",
      sort_order: t.sort_order,
      is_active: t.is_active,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) return alert("类型编码和名称必填");
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      need_proof: form.need_proof,
      proof_desc: form.proof_desc || null,
      max_days_limit: form.max_days_limit ? Number(form.max_days_limit) : null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    const res = await fetch(editing ? `/api/leave-types/${editing.id}` : "/api/leave-types", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setShowForm(false);
      void fetchTypes();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "保存失败");
    }
  };

  const handleDelete = async (t: LeaveType) => {
    if (!confirm(`确定停用请假类型「${t.name}」吗？历史记录保留。`)) return;
    const res = await fetch(`/api/leave-types/${t.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) void fetchTypes();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">请假类型管理</h1>
          <p className="text-slate-500 text-sm mt-1">定义请假类型、证明材料要求与天数上限</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新增类型
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {types.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3">
            <EmptyState text="暂无请假类型" />
          </div>
        ) : (
          types.map((t) => (
            <div key={t.id} className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{t.name}</h3>
                    <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{t.code}</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {t.need_proof ? `需材料：${t.proof_desc ?? "相关证明"}` : "无需证明材料"}
                  </p>
                  {t.max_days_limit != null && (
                    <p className="text-xs text-amber-600 mt-1">单次最多 {t.max_days_limit} 天</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {t.is_active ? "启用" : "停用"}
                </span>
              </div>
              <div className="flex justify-end gap-1 mt-4">
                <button onClick={() => openEdit(t)} className="p-1.5 text-slate-400 hover:text-indigo-600">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(t)} className="p-1.5 text-slate-400 hover:text-rose-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? "编辑请假类型" : "新增请假类型"}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">类型编码 *</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="sick / personal / other"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">名称 *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="病假"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">天数上限（留空不限）</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={form.max_days_limit}
                    onChange={(e) => setForm({ ...form, max_days_limit: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">排序</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.need_proof}
                  onChange={(e) => setForm({ ...form, need_proof: e.target.checked })}
                  className="rounded"
                />
                需要上传证明材料
              </label>
              {form.need_proof && (
                <input
                  value={form.proof_desc}
                  onChange={(e) => setForm({ ...form, proof_desc: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="证明材料说明，如：医院诊断证明"
                />
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {form.is_active ? (
                  <ToggleRight className="w-5 h-5 text-indigo-600" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-slate-400" />
                )}
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded"
                />
                启用
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">
                取消
              </button>
              <button onClick={handleSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

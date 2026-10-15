"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import { LoadingSpinner, EmptyState, getToken } from "@/components/shared";

interface Campus {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  radius: number;
  is_active: boolean;
}

export default function CampusesPage() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    lat: "39.9042",
    lng: "116.4074",
    radius: "500",
    is_active: true,
  });

  const fetchCampuses = async () => {
    const res = await fetch("/api/campuses", {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { data: Campus[] };
      setCampuses(data.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchCampuses();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", address: "", lat: "39.9042", lng: "116.4074", radius: "500", is_active: true });
    setShowForm(true);
  };

  const openEdit = (c: Campus) => {
    setEditing(c);
    setForm({
      name: c.name,
      address: c.address ?? "",
      lat: String(c.lat),
      lng: String(c.lng),
      radius: String(c.radius),
      is_active: c.is_active,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return alert("请输入校区名称");
    const payload = {
      name: form.name.trim(),
      address: form.address || null,
      lat: Number(form.lat),
      lng: Number(form.lng),
      radius: Number(form.radius),
      is_active: form.is_active,
    };
    const res = await fetch(editing ? `/api/campuses/${editing.id}` : "/api/campuses", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setShowForm(false);
      void fetchCampuses();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "保存失败");
    }
  };

  const handleDelete = async (c: Campus) => {
    if (!confirm(`确定停用校区「${c.name}」吗？历史记录将保留。`)) return;
    const res = await fetch(`/api/campuses/${c.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) void fetchCampuses();
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
          <h1 className="text-2xl font-bold text-slate-900">校区与电子围栏</h1>
          <p className="text-slate-500 text-sm mt-1">配置销假打卡允许的地理位置范围</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新增校区
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {campuses.length === 0 ? (
          <EmptyState text="暂无校区，点击右上角新增" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">校区名称</th>
                  <th className="px-6 py-3 text-left font-medium">地址</th>
                  <th className="px-6 py-3 text-left font-medium">中心坐标</th>
                  <th className="px-6 py-3 text-left font-medium">半径(米)</th>
                  <th className="px-6 py-3 text-left font-medium">状态</th>
                  <th className="px-6 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campuses.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-indigo-500" />
                        {c.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{c.address ?? "-"}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {Number(c.lat).toFixed(4)}, {Number(c.lng).toFixed(4)}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{c.radius}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-1.5 ${c.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                      />
                      <span className="text-slate-600">{c.is_active ? "启用" : "停用"}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 ml-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? "编辑校区" : "新增校区"}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">校区名称 *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="如：主校区"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">地址</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">纬度</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">经度</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">围栏半径（米）</label>
                <input
                  type="number"
                  min="50"
                  value={form.radius}
                  onChange={(e) => setForm({ ...form, radius: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded"
                />
                启用该校区围栏
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

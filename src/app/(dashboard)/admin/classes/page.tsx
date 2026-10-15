"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/shared";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

interface ClassItem {
  id: string;
  name: string;
  grade: string | null;
  description: string | null;
  leader_id: string | null;
  leader?: { name: string } | null;
}
interface Teacher {
  id: string;
  username: string;
  name: string;
}

export default function AdminClasses() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [form, setForm] = useState({ name: "", grade: "", description: "", leader_id: "" });
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const [c, t] = await Promise.all([
      fetch("/api/classes?withLeader=true", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/users?role=teacher", { credentials: "include" }).then((r) => r.json()),
    ]);
    setClasses(c.data ?? []);
    setTeachers(t.data ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setError("");
    if (!form.name.trim()) return setError("班级名称必填");
    const payload = {
      name: form.name,
      grade: form.grade || null,
      description: form.description || null,
      leader_id: form.leader_id || null,
    };
    const res = await fetch(editing ? `/api/classes/${editing.id}` : "/api/classes", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) return setError(d.error || "保存失败");
    setShowForm(false);
    load();
  };

  const remove = async (c: ClassItem) => {
    if (confirm(`确定删除班级「${c.name}」吗？`)) {
      const res = await fetch(`/api/classes/${c.id}`, { method: "DELETE", credentials: "include" });
      const d = await res.json();
      if (!res.ok) alert(d.error || "删除失败");
      load();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="班级管理"
        description="维护班级并绑定中队长（一个中队长可管理多个班级）"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setForm({ name: "", grade: "", description: "", leader_id: "" });
              setError("");
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            新增班级
          </button>
        }
      />
      <Card className="p-5">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">班级名称</th>
                  <th className="px-3 py-2 font-medium">年级</th>
                  <th className="px-3 py-2 font-medium">中队长</th>
                  <th className="px-3 py-2 font-medium">备注</th>
                  <th className="px-3 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-800">{c.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{c.grade ?? "-"}</td>
                    <td className="px-3 py-2.5">
                      {c.leader?.name ? (
                        <span className="rounded bg-indigo-50 text-indigo-700 px-2 py-0.5 text-xs">
                          {c.leader.name}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600">未指派</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 max-w-xs truncate">{c.description ?? "-"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditing(c);
                            setForm({
                              name: c.name,
                              grade: c.grade ?? "",
                              description: c.description ?? "",
                              leader_id: c.leader_id ?? "",
                            });
                            setError("");
                            setShowForm(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(c)}
                          className="p-1.5 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {classes.length === 0 && <p className="py-10 text-center text-sm text-slate-400">暂无班级</p>}
          </div>
        )}
      </Card>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold">{editing ? "编辑班级" : "新增班级"}</h3>
            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-500">班级名称 *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">年级</label>
                <input
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">负责中队长</label>
                <select
                  value={form.leader_id}
                  onChange={(e) => setForm({ ...form, leader_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">未指派</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}（{t.username}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">备注</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                取消
              </button>
              <button
                onClick={save}
                className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
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

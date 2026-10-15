"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/shared";
import { Loader2, Plus, Pencil, Trash2, KeyRound } from "lucide-react";

interface ClassItem {
  id: string;
  name: string;
  leader_id: string | null;
}
interface Teacher {
  id: string;
  username: string;
  name: string;
  is_active: boolean;
  must_change_password: boolean;
}

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState({ username: "", name: "", password: "" });
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoading(true);
    const [t, c] = await Promise.all([
      fetch("/api/users?role=teacher", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/classes", { credentials: "include" }).then((r) => r.json()),
    ]);
    setTeachers(t.data ?? []);
    setClasses(c.data ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const teacherClassNames = (id: string) =>
    classes.filter((c) => c.leader_id === id).map((c) => c.name);

  const save = async () => {
    setFormError("");
    if (editing) {
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: form.name }),
      });
      const d = await res.json();
      if (!res.ok) return setFormError(d.error);
    } else {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, role: "teacher" }),
      });
      const d = await res.json();
      if (!res.ok) return setFormError(d.error);
    }
    setShowForm(false);
    load();
  };

  const remove = async (t: Teacher) => {
    if (confirm(`确定停用中队长「${t.name}」吗？其名下班级将变为无负责人。`)) {
      await fetch(`/api/users/${t.id}`, { method: "DELETE", credentials: "include" });
      load();
    }
  };

  const resetPwd = async (t: Teacher) => {
    const pwd = prompt(`为「${t.name}」设置新密码（至少8位含字母数字）`);
    if (!pwd) return;
    const res = await fetch(`/api/users/${t.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password: pwd }),
    });
    const d = await res.json();
    alert(res.ok ? "密码已重置" : d.error || "重置失败");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="中队长管理"
        description="中队长负责本班请假审批与归队销假确认；在班级管理中绑定其管理范围"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setForm({ username: "", name: "", password: "" });
              setFormError("");
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            新增中队长
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
                  <th className="px-3 py-2 font-medium">工号</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">管理班级</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-xs">{t.username}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{t.name}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {teacherClassNames(t.id).length > 0 ? (
                          teacherClassNames(t.id).map((n) => (
                            <span key={n} className="rounded bg-indigo-50 text-indigo-700 px-2 py-0.5 text-xs">
                              {n}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">未绑定班级</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {t.is_active ? (
                        <span className="text-xs text-emerald-600">正常</span>
                      ) : (
                        <span className="text-xs text-slate-400">已停用</span>
                      )}
                      {t.must_change_password && <span className="ml-1 text-xs text-amber-600">待改密</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditing(t);
                            setForm({ username: t.username, name: t.name, password: "" });
                            setShowForm(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => resetPwd(t)}
                          className="p-1.5 text-slate-400 hover:text-amber-600"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(t)}
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
            {teachers.length === 0 && <p className="py-10 text-center text-sm text-slate-400">暂无中队长</p>}
          </div>
        )}
      </Card>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold">{editing ? "编辑中队长" : "新增中队长"}</h3>
            {formError && <p className="mt-2 text-sm text-rose-600">{formError}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-500">工号</label>
                <input
                  value={form.username}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">姓名</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {!editing && (
                <div>
                  <label className="text-xs text-slate-500">初始密码（至少8位含字母数字）</label>
                  <input
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
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

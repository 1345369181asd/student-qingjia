"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, PageHeader, authHeaders } from "@/components/shared";
import { Loader2, Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import { ALL_ROLE_LABELS, type UserRole } from "@/contexts/auth-context";

interface Account {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  roles?: UserRole[];
  is_active: boolean;
  must_change_password: boolean;
  class_id?: string | null;
}

// 教职工可分配角色（学生由学生管理/导入维护）
const STAFF_ROLES: UserRole[] = ["teacher", "head_teacher", "affair", "college_leader", "admin"];

const roleBadgeClass: Record<UserRole, string> = {
  student: "bg-slate-100 text-slate-600",
  teacher: "bg-indigo-50 text-indigo-700",
  head_teacher: "bg-sky-50 text-sky-700",
  affair: "bg-amber-50 text-amber-700",
  college_leader: "bg-violet-50 text-violet-700",
  admin: "bg-rose-50 text-rose-700",
};

export default function AdminAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({
    username: "",
    name: "",
    password: "",
    roles: ["teacher"] as UserRole[],
  });
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/users?staff=1", { headers: authHeaders() }).then((x) => x.json());
    setAccounts(r.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRole = (role: UserRole) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((x) => x !== role) : [...f.roles, role],
    }));
  };

  const save = async () => {
    setFormError("");
    if (form.roles.length === 0) return setFormError("至少分配一个角色");
    if (editing) {
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: form.name, roles: form.roles }),
      });
      const d = await res.json();
      if (!res.ok) return setFormError(d.error);
    } else {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          username: form.username,
          name: form.name,
          password: form.password,
          roles: form.roles,
        }),
      });
      const d = await res.json();
      if (!res.ok) return setFormError(d.error);
    }
    setShowForm(false);
    load();
  };

  const remove = async (a: Account) => {
    if (confirm(`确定停用账号「${a.name}」吗？`)) {
      await fetch(`/api/users/${a.id}`, { method: "DELETE", headers: authHeaders() });
      load();
    }
  };

  const resetPwd = async (a: Account) => {
    const pwd = prompt(`为「${a.name}」设置新密码（至少6位）`);
    if (!pwd) return;
    const res = await fetch(`/api/users/${a.id}/reset-password`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ password: pwd }),
    });
    const d = await res.json();
    alert(res.ok ? "密码已重置" : d.error || "重置失败");
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ username: "", name: "", password: "", roles: ["teacher"] });
    setFormError("");
    setShowForm(true);
  };
  const openEdit = (a: Account) => {
    setEditing(a);
    setForm({
      username: a.username,
      name: a.name,
      password: "",
      roles: a.roles && a.roles.length > 0 ? a.roles : [a.role],
    });
    setFormError("");
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="账号与角色"
        description="统一维护教职工账号与多角色（一人可兼多角色）；管理范围在“管理关系”中授权"
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            新增账号
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
                  <th className="px-3 py-2 font-medium">账号</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">角色</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => {
                  const roles = a.roles && a.roles.length > 0 ? a.roles : [a.role];
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-mono text-xs">{a.username}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{a.name}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {roles.map((r) => (
                            <span
                              key={r}
                              className={
                                "rounded px-2 py-0.5 text-xs " + (roleBadgeClass[r] ?? "bg-slate-100 text-slate-600")
                              }
                            >
                              {ALL_ROLE_LABELS[r]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {a.is_active ? (
                          <span className="text-xs text-emerald-600">正常</span>
                        ) : (
                          <span className="text-xs text-slate-400">已停用</span>
                        )}
                        {a.must_change_password && (
                          <span className="ml-1 text-xs text-amber-600">待改密</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(a)} className="p-1.5 text-slate-400 hover:text-indigo-600" title="编辑">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => resetPwd(a)} className="p-1.5 text-slate-400 hover:text-amber-600" title="重置密码">
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button onClick={() => remove(a)} className="p-1.5 text-slate-400 hover:text-rose-600" title="停用">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-slate-400">
                      暂无账号
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold">{editing ? "编辑账号角色" : "新增教职工账号"}</h3>
            {formError && <p className="mt-2 text-sm text-rose-600">{formError}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-500">账号</label>
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
                  <label className="text-xs text-slate-500">初始密码（至少 6 位）</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500">角色（可多选）</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {STAFF_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRole(r)}
                      className={
                        "rounded-lg border px-3 py-1.5 text-xs transition-colors " +
                        (form.roles.includes(r)
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50")
                      }
                    >
                      {ALL_ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
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

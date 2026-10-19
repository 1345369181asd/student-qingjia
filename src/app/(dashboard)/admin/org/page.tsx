"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, PageHeader, authHeaders } from "@/components/shared";
import { Loader2, Plus, Pencil, Building2, GitFork, Users as UsersIcon } from "lucide-react";

interface Department {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  majorCount?: number;
  classCount?: number;
  studentCount?: number;
}
interface Major {
  id: string;
  code: string;
  name: string;
  department_id: string;
  is_active: boolean;
  department?: { id: string; name: string } | null;
  classCount?: number;
  studentCount?: number;
}
interface ClassRow {
  id: string;
  name: string;
  grade: string | null;
  major_id: string | null;
  department_id: string | null;
}

type Tab = "department" | "major";

export default function AdminOrg() {
  const [tab, setTab] = useState<Tab>("department");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [majors, setMajors] = useState<Major[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Department | Major | null>(null);
  const [form, setForm] = useState({ code: "", name: "", departmentId: "" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [d, m, c] = await Promise.all([
      fetch("/api/departments", { headers: authHeaders() }).then((r) => r.json()),
      fetch("/api/majors", { headers: authHeaders() }).then((r) => r.json()),
      fetch("/api/classes", { headers: authHeaders() }).then((r) => r.json()),
    ]);
    setDepartments(d.data ?? []);
    setMajors(m.data ?? []);
    setClasses(c.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", departmentId: departments[0]?.id ?? "" });
    setError("");
    setShowForm(true);
  };
  const openEdit = (item: Department | Major) => {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.name,
      departmentId: "department_id" in item ? (item.department_id ?? "") : "",
    });
    setError("");
    setShowForm(true);
  };

  const save = async () => {
    setError("");
    if (!form.code.trim() || !form.name.trim()) return setError("编码和名称必填");
    const base = tab === "department" ? "/api/departments" : "/api/majors";
    const payload =
      tab === "department"
        ? { code: form.code.trim(), name: form.name.trim() }
        : {
            code: form.code.trim(),
            name: form.name.trim(),
            departmentId: form.departmentId,
          };
    if (tab === "major" && !form.departmentId) return setError("专业必须归属一个系部");
    const res = await fetch(editing ? `${base}/${editing.id}` : base, {
      method: editing ? "PUT" : "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409 && data?.needConfirm) {
        if (confirm(`${data.error}\n\n仍要停用该系部吗？`)) {
          const r2 = await fetch(`${base}/${editing?.id}`, {
            method: "PUT",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ ...payload, isActive: false, confirm: true }),
          });
          const d2 = await r2.json();
          if (!r2.ok) return setError(d2.error || "保存失败");
        } else {
          return;
        }
      } else {
        return setError(data.error || "保存失败");
      }
    }
    setShowForm(false);
    load();
  };

  const toggleActive = async (item: Department | Major) => {
    const base = tab === "department" ? "/api/departments" : "/api/majors";
    const next = !item.is_active;
    const res = await fetch(`${base}/${item.id}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        code: item.code,
        name: item.name,
        departmentId: "department_id" in item ? item.department_id : undefined,
        isActive: next,
      }),
    });
    const d = await res.json();
    if (!res.ok) alert(d.error || "操作失败");
    load();
  };

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? "-";
  const classCountOfMajor = (mid: string) => classes.filter((c) => c.major_id === mid).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="组织架构"
        description="学校 → 系部 → 专业 → 年级班级 的组织树维护"
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            新建{tab === "department" ? "系部" : "专业"}
          </button>
        }
      />

      <div className="flex gap-2">
        {([
          { k: "department", label: "系部", icon: Building2 },
          { k: "major", label: "专业", icon: GitFork },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
              (tab === t.k
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50")
            }
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {showForm && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            {editing ? "编辑" : "新建"}
            {tab === "department" ? "系部" : "专业"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">编码</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="如 D_CS / M_CS"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">名称</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            {tab === "major" && (
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">所属系部</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                >
                  <option value="">请选择系部</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              保存
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">编码</th>
                <th className="px-5 py-3 font-medium">名称</th>
                {tab === "major" && <th className="px-5 py-3 font-medium">所属系部</th>}
                <th className="px-5 py-3 font-medium">专业数</th>
                <th className="px-5 py-3 font-medium">班级数</th>
                <th className="px-5 py-3 font-medium">学生数</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {(tab === "department" ? departments : majors).map((item) => {
                const isDept = tab === "department";
                const d = item as Department & Major;
                return (
                  <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{item.code}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{item.name}</td>
                    {tab === "major" && (
                      <td className="px-5 py-3 text-slate-600">{deptName(d.department_id)}</td>
                    )}
                    <td className="px-5 py-3 text-slate-600">
                      {isDept ? (d.majorCount ?? 0) : "-"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {isDept ? (d.classCount ?? 0) : classCountOfMajor(item.id)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="h-3.5 w-3.5 text-slate-400" />
              {isDept ? (d.studentCount ?? 0) : (d.studentCount ?? 0)}
            </span>
                    </td>
                    <td className="px-5 py-3">
              <span
                className={
                  "rounded-full px-2 py-0.5 text-xs " +
                  (item.is_active
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-slate-100 text-slate-400")
                }
              >
                {item.is_active ? "启用" : "停用"}
              </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                          title="编辑"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(item)}
                          className="text-xs px-2 py-1 rounded-md text-slate-500 hover:bg-slate-100"
                        >
                          {item.is_active ? "停用" : "启用"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(tab === "department" ? departments : majors).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

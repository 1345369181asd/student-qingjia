"use client";

import { useEffect, useRef, useState } from "react";
import { Card, PageHeader, authHeaders } from "@/components/shared";
import { Loader2, Plus, Upload, Download, Pencil, Trash2, KeyRound, X } from "lucide-react";

interface ClassItem {
  id: string;
  name: string;
}
interface Student {
  id: string;
  username: string;
  name: string;
  class_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  classes?: { name: string } | null;
}
interface PreviewRow {
  rowNo: number;
  studentNo: string;
  name: string;
  className: string;
  action: "create" | "update" | "skip";
  errors: string[];
}

export default function AdminStudents() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState({ username: "", name: "", class_id: "", password: "" });
  const [formError, setFormError] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [csvText, setCsvText] = useState("");
  const [importSummary, setImportSummary] = useState<{ create: number; update: number; fail: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadClasses = async () => {
    const d = await (await fetch("/api/classes", { headers: authHeaders() })).json();
    setClasses(d.data ?? []);
  };
  const loadStudents = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (classFilter) params.set("class_id", classFilter);
    const d = await (await fetch(`/api/users?role=student&${params}`, { headers: authHeaders() })).json();
    setStudents(d.data ?? []);
    setLoading(false);
  };
  useEffect(() => {
    loadClasses();
  }, []);
  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, classFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ username: "", name: "", class_id: classes[0]?.id ?? "", password: "" });
    setFormError("");
    setShowForm(true);
  };
  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({ username: s.username, name: s.name, class_id: s.class_id ?? "", password: "" });
    setFormError("");
    setShowForm(true);
  };

  const save = async () => {
    setFormError("");
    if (editing) {
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: form.name, class_id: form.class_id }),
      });
      const d = await res.json();
      if (!res.ok) return setFormError(d.error);
    } else {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...form, role: "student" }),
      });
      const d = await res.json();
      if (!res.ok) return setFormError(d.error);
    }
    setShowForm(false);
    loadStudents();
  };

  const remove = async (s: Student) => {
    if (!confirm(`确定停用学生「${s.name}」吗？停用后无法登录。`)) return;
    await fetch(`/api/users/${s.id}`, { method: "DELETE", headers: authHeaders() });
    loadStudents();
  };

  const resetPwd = async (s: Student) => {
    const pwd = prompt(`为「${s.name}」设置新初始密码（至少8位，含字母和数字）`);
    if (!pwd) return;
    const res = await fetch(`/api/users/${s.id}/reset-password`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ password: pwd }),
    });
    const d = await res.json();
    alert(res.ok ? "密码已重置，学生下次登录需修改密码" : d.error || "重置失败");
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    const res = await fetch("/api/students/import", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ csv: text, mode: "preview" }),
    });
    const d = await res.json();
    if (!res.ok) {
      alert(d.error);
      return;
    }
    setPreview(d.data.rows);
    setImportSummary(null);
  };

  const commitImport = async () => {
    const res = await fetch("/api/students/import", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ csv: csvText, mode: "commit" }),
    });
    const d = await res.json();
    if (res.ok) {
      setImportSummary({ create: d.data.createCount, update: d.data.updateCount, fail: d.data.failedCount });
      setPreview(null);
      loadStudents();
    } else {
      alert(d.error);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="学生管理"
        description="账号由管理员统一创建，支持 CSV 批量导入（新增/自动更新）"
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/students/template"
              className="inline-flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              下载模板
            </a>
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              CSV 导入
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              新增学生
            </button>
          </div>
        }
      />

      {importSummary && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
          <span>
            导入完成：新增 {importSummary.create} 人，更新 {importSummary.update} 人，失败 {importSummary.fail} 行
          </span>
          <button onClick={() => setImportSummary(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {preview && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">
              导入预览（{preview.filter((r) => r.action === "create").length} 新增 /{" "}
              {preview.filter((r) => r.action === "update").length} 更新 /{" "}
              {preview.filter((r) => r.action === "skip").length} 错误）
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setPreview(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                取消
              </button>
              <button
                onClick={commitImport}
                className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700"
              >
                确认导入（错误行自动跳过）
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2">行</th>
                  <th className="px-3 py-2">学号</th>
                  <th className="px-3 py-2">姓名</th>
                  <th className="px-3 py-2">班级</th>
                  <th className="px-3 py-2">操作</th>
                  <th className="px-3 py-2">错误</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map((r) => (
                  <tr key={r.rowNo} className={r.action === "skip" ? "bg-rose-50/50" : ""}>
                    <td className="px-3 py-2 text-slate-400">{r.rowNo}</td>
                    <td className="px-3 py-2">{r.studentNo}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.className}</td>
                    <td className="px-3 py-2">
                      {r.action === "create" && <span className="text-emerald-600">新增</span>}
                      {r.action === "update" && <span className="text-blue-600">更新</span>}
                      {r.action === "skip" && <span className="text-rose-600">跳过</span>}
                    </td>
                    <td className="px-3 py-2 text-rose-600">{r.errors.join("；")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索学号/姓名"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">全部班级</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">学号</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">班级</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-xs">{s.username}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{s.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{s.classes?.name ?? "-"}</td>
                    <td className="px-3 py-2.5">
                      {s.is_active ? (
                        <span className="text-xs text-emerald-600">正常</span>
                      ) : (
                        <span className="text-xs text-slate-400">已停用</span>
                      )}
                      {s.must_change_password && (
                        <span className="ml-1 text-xs text-amber-600">待改密</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600"
                          title="编辑"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => resetPwd(s)}
                          className="p-1.5 text-slate-400 hover:text-amber-600"
                          title="重置密码"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(s)}
                          className="p-1.5 text-slate-400 hover:text-rose-600"
                          title="停用"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {students.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-400">暂无学生数据</p>
            )}
          </div>
        )}
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold">{editing ? "编辑学生" : "新增学生"}</h3>
            {formError && <p className="mt-2 text-sm text-rose-600">{formError}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-500">学号</label>
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
              <div>
                <label className="text-xs text-slate-500">班级</label>
                <select
                  value={form.class_id}
                  onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">未分班</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {!editing && (
                <div>
                  <label className="text-xs text-slate-500">初始密码（至少8位含字母数字，首次登录需修改）</label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
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

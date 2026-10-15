"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, GitBranch, ArrowRight, Pencil } from "lucide-react";
import { LoadingSpinner, getToken } from "@/components/shared";

interface Teacher {
  id: string;
  name: string;
  username: string;
}
interface LeaveType {
  id: string;
  code: string;
  name: string;
}
interface FlowNode {
  order: number;
  name: string;
  role: "teacher" | "admin";
  assigneeId?: string | null;
}
interface Flow {
  id: string;
  name: string;
  leave_type_code: string | null;
  min_hours: number;
  max_hours: number | null;
  require_leave_school: boolean | null;
  priority: number;
  is_active: boolean;
  version: number;
  nodes: FlowNode[];
}

const emptyForm = {
  name: "",
  leave_type_code: "",
  min_hours: "0",
  max_hours: "",
  require_leave_school: "",
  priority: "0",
  is_active: true,
  nodes: [] as Array<{ name: string; role: "teacher" | "admin"; assigneeId: string }>,
};

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchAll = async () => {
    const headers = { Authorization: `Bearer ${getToken()}` };
    const [fRes, tRes, tyRes] = await Promise.all([
      fetch("/api/flows", { headers }),
      fetch("/api/users?role=teacher", { headers }),
      fetch("/api/leave-types", { headers }),
    ]);
    if (fRes.ok) setFlows(((await fRes.json()) as { data: Flow[] }).data ?? []);
    if (tRes.ok) setTeachers(((await tRes.json()) as { data: Teacher[] }).data ?? []);
    if (tyRes.ok) setTypes(((await tyRes.json()) as { data: LeaveType[] }).data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const typeName = (code: string | null) =>
    code ? types.find((t) => t.code === code)?.name ?? code : "全部类型";

  const addNode = () => {
    setForm((f) => ({
      ...f,
      nodes: [...f.nodes, { name: "", role: "teacher" as const, assigneeId: "" }],
    }));
  };

  const updateNode = (idx: number, patch: Partial<{ name: string; role: "teacher" | "admin"; assigneeId: string }>) => {
    setForm((f) => ({
      ...f,
      nodes: f.nodes.map((n, i) => (i === idx ? { ...n, ...patch } : n)),
    }));
  };

  const removeNode = (idx: number) => {
    setForm((f) => ({ ...f, nodes: f.nodes.filter((_, i) => i !== idx) }));
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (flow: Flow) => {
    setEditingId(flow.id);
    setForm({
      name: flow.name,
      leave_type_code: flow.leave_type_code ?? "",
      min_hours: String(flow.min_hours),
      max_hours: flow.max_hours != null ? String(flow.max_hours) : "",
      require_leave_school:
        flow.require_leave_school === true ? "true" : flow.require_leave_school === false ? "false" : "",
      priority: String(flow.priority ?? 0),
      is_active: flow.is_active,
      nodes: flow.nodes.map((n) => ({
        name: n.name,
        role: n.role,
        assigneeId: n.assigneeId ?? "",
      })),
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return alert("请填写流程名称");
    if (form.nodes.length === 0) return alert("请至少配置一个审批节点");
    if (form.nodes.some((n) => !n.name.trim())) return alert("请填写所有节点名称");
    if (form.nodes.some((n) => n.role === "teacher" && !n.assigneeId)) {
      return alert("请为教师节点选择审批人");
    }
    const payload = {
      name: form.name.trim(),
      leaveTypeCode: form.leave_type_code || null,
      minHours: Number(form.min_hours) || 0,
      maxHours: form.max_hours ? Number(form.max_hours) : null,
      requireLeaveSchool:
        form.require_leave_school === "true" ? true : form.require_leave_school === "false" ? false : null,
      priority: Number(form.priority) || 0,
      isActive: form.is_active,
      nodes: form.nodes.map((n) => ({
        name: n.name.trim(),
        role: n.role,
        assigneeId: n.role === "teacher" ? n.assigneeId : null,
      })),
    };
    const res = await fetch(editingId ? `/api/flows/${editingId}` : "/api/flows", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setShowForm(false);
      void fetchAll();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "保存失败");
    }
  };

  const toggleFlow = async (flow: Flow) => {
    const res = await fetch(`/api/flows/${flow.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ isActive: !flow.is_active }),
    });
    if (res.ok) void fetchAll();
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">审批流程配置</h1>
          <p className="text-slate-500 text-sm mt-1">
            按「请假类型 + 时长区间 + 是否离校」匹配多级审批节点，节点驳回则流程终止
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新增流程
        </button>
      </div>

      <div className="space-y-4">
        {flows.length === 0 ? (
          <div className="bg-white rounded-xl p-10 text-center text-slate-400 shadow-sm">
            暂无流程配置，点击右上角新增
          </div>
        ) : (
          flows.map((flow) => (
            <div key={flow.id} className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                    <GitBranch className="w-4 h-4 text-indigo-500" />
                    {flow.name}
                  </span>
                  <span className="text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {typeName(flow.leave_type_code)} · {flow.min_hours}h 以上
                    {flow.max_hours != null ? ` ~ ${flow.max_hours}h` : "（无上限）"}
                    {flow.require_leave_school != null && (flow.require_leave_school ? " · 仅离校" : " · 仅不离校")}
                  </span>
                  <span className="text-xs text-slate-400">v{flow.version}</span>
                  <button
                    onClick={() => toggleFlow(flow)}
                    className={`text-xs px-2 py-0.5 rounded-full ${flow.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {flow.is_active ? "已启用（点击停用）" : "已停用（点击启用）"}
                  </button>
                </div>
                <button onClick={() => openEdit(flow)} className="p-1.5 text-slate-400 hover:text-indigo-600">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {flow.nodes.map((n, i, arr) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                      <p className="font-medium text-slate-800">
                        {i + 1}. {n.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {n.role === "admin"
                          ? "管理员"
                          : teachers.find((t) => t.id === n.assigneeId)?.name ?? "未指定教师"}
                      </p>
                    </div>
                    {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 my-8">
            <h3 className="text-lg font-semibold mb-4">{editingId ? "编辑审批流程" : "新增审批流程"}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">流程名称 *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="如：事假常规审批（3天以内）"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">请假类型</label>
                  <select
                    value={form.leave_type_code}
                    onChange={(e) => setForm({ ...form, leave_type_code: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="">全部类型</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.code}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">时长下限(h)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={form.min_hours}
                    onChange={(e) => setForm({ ...form, min_hours: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">时长上限(h)</label>
                  <input
                    type="number"
                    step="1"
                    value={form.max_hours}
                    onChange={(e) => setForm({ ...form, max_hours: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="不限"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">是否离校</label>
                  <select
                    value={form.require_leave_school}
                    onChange={(e) => setForm({ ...form, require_leave_school: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="">不限</option>
                    <option value="true">仅离校</option>
                    <option value="false">仅不离校</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">优先级</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">审批节点（按顺序）</label>
                  <button
                    onClick={addNode}
                    className="text-sm text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加节点
                  </button>
                </div>
                <div className="space-y-2">
                  {form.nodes.map((n, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                      <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{idx + 1}</span>
                      <input
                        value={n.name}
                        onChange={(e) => updateNode(idx, { name: e.target.value })}
                        placeholder="节点名称，如：中队长审批"
                        className="flex-1 min-w-0 border border-slate-300 rounded px-2 py-1.5 text-sm"
                      />
                      <select
                        value={n.role}
                        onChange={(e) =>
                          updateNode(idx, {
                            role: e.target.value as "teacher" | "admin",
                            assigneeId: e.target.value === "admin" ? "" : n.assigneeId,
                          })
                        }
                        className="border border-slate-300 rounded px-2 py-1.5 text-sm"
                      >
                        <option value="teacher">指定教师</option>
                        <option value="admin">管理员</option>
                      </select>
                      {n.role === "teacher" && (
                        <select
                          value={n.assigneeId}
                          onChange={(e) => updateNode(idx, { assigneeId: e.target.value })}
                          className="border border-slate-300 rounded px-2 py-1.5 text-sm max-w-[120px]"
                        >
                          <option value="">选择</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button onClick={() => removeNode(idx)} className="p-1 text-rose-400 hover:text-rose-600 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {form.nodes.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-3">尚未添加审批节点</p>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded"
                />
                立即启用（在途申请不受影响）
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">
                取消
              </button>
              <button onClick={handleSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
                保存流程
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

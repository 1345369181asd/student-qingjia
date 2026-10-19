"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, PageHeader, authHeaders } from "@/components/shared";
import { Loader2, Plus, Trash2, UserCog } from "lucide-react";

interface Named {
  id: string;
  name: string;
  username?: string;
}
interface Relation {
  id: string;
  managerId: string;
  targetId: string;
  manager: Named | null;
  target: Named | null;
}
type RelType = "teacher_classes" | "head_teachers" | "leader_departments";

const TABS: Array<{
  k: RelType;
  label: string;
  managerLabel: string;
  targetLabel: string;
  managerRole: string;
}> = [
  { k: "teacher_classes", label: "中队长 - 班级", managerLabel: "中队长", targetLabel: "负责班级", managerRole: "teacher" },
  { k: "head_teachers", label: "大队长 - 中队长", managerLabel: "大队长", targetLabel: "管辖中队长", managerRole: "head_teacher" },
  { k: "leader_departments", label: "院领导 - 系部", managerLabel: "分管院领导", targetLabel: "分管系部", managerRole: "college_leader" },
];

export default function AdminRelations() {
  const [tab, setTab] = useState<RelType>("teacher_classes");
  const [relations, setRelations] = useState<Relation[]>([]);
  const [managers, setManagers] = useState<Named[]>([]);
  const [targets, setTargets] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [managerId, setManagerId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (t: RelType) => {
    setLoading(true);
    setError("");
    const def = TABS.find((x) => x.k === t)!;
    const targetUrl =
      t === "teacher_classes"
        ? "/api/classes"
        : t === "head_teachers"
          ? "/api/users?role=teacher"
          : "/api/departments";
    const [rel, mgr, tgt] = await Promise.all([
      fetch(`/api/management-relations?type=${t}`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`/api/users?role=${def.managerRole}`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(targetUrl, { headers: authHeaders() }).then((r) => r.json()),
    ]);
    setRelations(rel.data ?? []);
    setManagers(mgr.data ?? []);
    setTargets(tgt.data ?? []);
    setManagerId("");
    setTargetId("");
    setLoading(false);
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const add = async () => {
    setError("");
    if (!managerId || !targetId) return setError("请选择人员与管理对象");
    const res = await fetch("/api/management-relations", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ type: tab, managerId, targetId }),
    });
    const d = await res.json();
    if (!res.ok) return setError(d.error || "添加失败");
    load(tab);
  };

  const remove = async (r: Relation) => {
    if (!confirm("解除该管理关系？在途待办将自动交接。")) return;
    const res = await fetch("/api/management-relations", {
      method: "DELETE",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ type: tab, managerId: r.managerId, targetId: r.targetId }),
    });
    const d = await res.json();
    if (!res.ok) alert(d.error || "解除失败");
    load(tab);
  };

  const def = TABS.find((x) => x.k === tab)!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="管理关系"
        description="独立授权的动态管理关系；变更后在途审批/销假待办自动交接并留痕"
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
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
            <UserCog className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{def.managerLabel}</label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value="">请选择</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.username}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{def.targetLabel}</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value="">请选择</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={add}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            添加
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="px-5 py-3 font-medium">{def.managerLabel}</th>
                  <th className="px-5 py-3 font-medium">{def.targetLabel}</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {relations.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-slate-800">
                      {r.manager?.name ?? "-"}
                      {r.manager?.username && (
                        <span className="ml-1 text-xs text-slate-400">（{r.manager.username}）</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.target?.name ?? "-"}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => remove(r)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        解除
                      </button>
                    </td>
                  </tr>
                ))}
                {relations.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-12 text-center text-slate-400">
                      暂无管理关系
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

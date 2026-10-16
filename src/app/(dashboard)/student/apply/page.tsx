"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PageHeader, authHeaders } from "@/components/shared";
import { Loader2 } from "lucide-react";

interface LeaveType {
  id: string;
  code: string;
  name: string;
  need_proof: boolean;
  proof_desc: string | null;
  max_days_limit: number | null;
}

export default function ApplyPage() {
  const router = useRouter();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    leaveType: "",
    startTime: "",
    endTime: "",
    reason: "",
    leaveSchool: false,
    sleepOutside: false,
    destination: "",
    contactPhone: "",
  });

  useEffect(() => {
    fetch("/api/leave-types", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const active: LeaveType[] = (d.data ?? []).filter((t: LeaveType) => t);
        setTypes(active);
        if (active[0]) setForm((f) => ({ ...f, leaveType: active[0].code }));
      });
  }, []);

  const selectedType = useMemo(
    () => types.find((t) => t.code === form.leaveType),
    [types, form.leaveType]
  );

  const durationHours = useMemo(() => {
    if (!form.startTime || !form.endTime) return 0;
    const ms = new Date(form.endTime).getTime() - new Date(form.startTime).getTime();
    return ms > 0 ? Math.round((ms / 3_600_000) * 10) / 10 : 0;
  }, [form.startTime, form.endTime]);

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.leaveType) return setError("请选择请假类型");
    if (!form.startTime || !form.endTime) return setError("请选择起止时间");
    if (durationHours <= 0) return setError("结束时间必须晚于开始时间");
    if (!form.reason.trim()) return setError("请填写请假事由");
    if (form.leaveSchool && !form.destination.trim())
      return setError("离校请假请填写目的地");
    if (
      selectedType?.max_days_limit &&
      durationHours > selectedType.max_days_limit * 24
    ) {
      return setError(`该类型单次请假不得超过 ${selectedType.max_days_limit} 天`);
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交失败");
      router.push("/student/records");
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="space-y-6">
      <PageHeader title="发起请假" description="请如实填写请假信息，提交后进入审批流程" />
      <Card className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">请假类型</label>
            <select
              className={inputCls}
              value={form.leaveType}
              onChange={(e) => set("leaveType", e.target.value)}
            >
              {types.map((t) => (
                <option key={t.id} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedType?.need_proof && (
              <p className="mt-1.5 text-xs text-amber-600">
                {selectedType.name}需上传凭证（{selectedType.proof_desc || "如医院诊断证明"}
                ），可在提交后于请假记录中补充。
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">开始时间</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">结束时间</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </div>
          </div>
          {durationHours > 0 && (
            <p className="text-sm text-slate-500 -mt-2">请假时长：{durationHours} 小时</p>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">请假事由</label>
            <textarea
              rows={4}
              className={inputCls}
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="请详细说明请假原因"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={form.leaveSchool}
                onChange={(e) => set("leaveSchool", e.target.checked)}
              />
              请假期间离校
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={form.sleepOutside}
                onChange={(e) => set("sleepOutside", e.target.checked)}
              />
              在外住宿
            </label>
            {form.leaveSchool && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">目的地</label>
                  <input
                    className={inputCls}
                    value={form.destination}
                    onChange={(e) => set("destination", e.target.value)}
                    placeholder="离校去向"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">紧急联系电话</label>
                  <input
                    className={inputCls}
                    value={form.contactPhone}
                    onChange={(e) => set("contactPhone", e.target.value)}
                    placeholder="便于紧急联系"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              提交申请
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

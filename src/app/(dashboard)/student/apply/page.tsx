"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Card, PageHeader } from "@/components/shared";
import { Loader2, Upload, FileText, X } from "lucide-react";

interface LeaveType {
  id: string;
  code: string;
  name: string;
  need_attachment: boolean;
  max_days_limit: number | null;
}

export default function ApplyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    leave_type: "personal",
    start_date: "",
    end_date: "",
    reason: "",
    contact_phone: "",
  });

  useEffect(() => {
    fetch("/api/leave-types", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTypes(d.data ?? []));
  }, []);

  const selectedType = types.find((t) => t.code === form.leave_type);

  const calcDays = () => {
    if (!form.start_date || !form.end_date) return 0;
    const s = new Date(form.start_date);
    const e = new Date(form.end_date);
    if (e < s) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  };
  const days = calcDays();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (days <= 0) {
      setError("结束日期不能早于开始日期");
      return;
    }
    if (selectedType?.max_days_limit && days > selectedType.max_days_limit) {
      setError(`${selectedType.name}单次最长可请 ${selectedType.max_days_limit} 天`);
      return;
    }
    if (selectedType?.need_attachment && files.length === 0) {
      setError(`${selectedType.name}必须上传证明材料`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, duration_days: days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交失败");
      const leaveId = data.data.id as string;

      // 上传附件
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const upRes = await fetch(`/api/leaves/${leaveId}/upload`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!upRes.ok) {
          const upData = await upRes.json();
          throw new Error(upData.error || "附件上传失败");
        }
      }
      router.push("/student/records");
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="发起请假申请" description="请如实填写请假信息，带 * 为必填项" />
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">请假类型 *</label>
            <select
              value={form.leave_type}
              onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              disabled={loading}
            >
              {types.map((t) => (
                <option key={t.id} value={t.code}>
                  {t.name}
                  {t.need_attachment ? "（需证明材料）" : ""}
                  {t.max_days_limit ? `（限${t.max_days_limit}天）` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">开始日期 *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">结束日期 *</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                required
              />
            </div>
          </div>
          {days > 0 && (
            <p className="text-sm text-indigo-600 font-medium">
              本次请假共 {days} 天（按自然日计，含起止日）
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">请假事由 *</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              rows={4}
              placeholder="请详细说明请假原因"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">离校期间联系电话</label>
            <input
              type="tel"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="便于紧急联系"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              证明材料 {selectedType?.need_attachment ? "*" : ""}
              <span className="ml-2 text-xs font-normal text-slate-400">
                图片/PDF，单个不超过 10MB
              </span>
            </label>
            <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
              <Upload className="h-6 w-6 text-slate-400" />
              <span className="text-sm text-slate-500">点击选择文件（可多选）</span>
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  const valid = list.filter((f) => f.size <= 10 * 1024 * 1024);
                  setFiles((prev) => [...prev, ...valid]);
                }}
              />
            </label>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="flex-1 truncate text-slate-700">{f.name}</span>
                    <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              提交申请
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="border border-slate-300 text-slate-700 rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

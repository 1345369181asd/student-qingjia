"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, KeyRound, ShieldCheck, GraduationCap } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { authHeaders } from "@/components/shared";

const roleLabel: Record<string, string> = {
  student: "学生",
  teacher: "中队长",
  admin: "管理员",
};

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!user) return null;

  const infoRows: Array<{ label: string; value?: string | null }> = [
    { label: "姓名", value: user.name },
    { label: "账号", value: user.username },
    { label: "角色", value: roleLabel[user.role] ?? user.role },
  ];
  if (user.role === "student") {
    infoRows.push(
      { label: "学号", value: user.studentNo },
      { label: "年级", value: user.grade },
      { label: "专业", value: user.major },
      { label: "院系", value: user.department }
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword.length < 6) {
      setError("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "修改失败");
      } else {
        setSuccess("密码修改成功");
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
        await refresh();
        if (user.mustChangePassword) {
          router.push(`/${user.role}`);
        }
      }
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">个人中心</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 资料卡 */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
            <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center">
              {user.role === "student" ? (
                <GraduationCap className="h-8 w-8 text-indigo-600" />
              ) : (
                <User className="h-8 w-8 text-indigo-600" />
              )}
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">{user.name}</div>
              <div className="text-sm text-slate-500">{roleLabel[user.role] ?? user.role}</div>
            </div>
          </div>
          <dl className="pt-4 space-y-3">
            {infoRows
              .filter((row) => row.value)
              .map((row) => (
                <div key={row.label} className="flex justify-between text-sm">
                  <dt className="text-slate-500">{row.label}</dt>
                  <dd className="text-slate-900 font-medium">{row.value}</dd>
                </div>
              ))}
          </dl>
          {user.mustChangePassword && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <span>当前为初始密码，请先修改密码后再使用系统。</span>
            </div>
          )}
        </div>

        {/* 修改密码 */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-indigo-600" />
            修改密码
          </h2>
          <form onSubmit={handleSubmit} className="max-w-md space-y-4">
            {!user.mustChangePassword && (
              <div>
                <label className="block text-sm text-slate-600 mb-1.5">原密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="请输入原密码"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="至少 6 位"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1.5">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="再次输入新密码"
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            {success && <p className="text-sm text-emerald-600">{success}</p>}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? "提交中..." : "确认修改"}
              </button>
              <button
                type="button"
                onClick={logout}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                退出登录
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

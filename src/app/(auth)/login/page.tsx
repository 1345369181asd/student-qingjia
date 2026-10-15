"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { GraduationCap, Loader2 } from "lucide-react";

const roleHome: Record<string, string> = {
  student: "/student",
  teacher: "/teacher",
  admin: "/admin",
};

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.must_change_password) {
        router.push("/password-change");
      } else {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data = await res.json();
        router.push(roleHome[data.user.role] ?? "/login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white mb-4 shadow-lg shadow-indigo-200">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">学生请假管理系统</h1>
          <p className="mt-2 text-sm text-slate-500">账号由管理员统一分配，首次登录需修改密码</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">账号</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="学号 / 工号 / 管理员账号"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="请输入密码"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              登录
            </button>
          </form>
        </div>

        <div className="mt-6 bg-white/70 rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 mb-2">演示账号（点击填充）</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => fillDemo("admin", "Admin@123")}
              className="rounded-lg border border-slate-200 px-2 py-2 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-colors"
            >
              <p className="font-medium text-slate-700">管理员</p>
              <p className="text-slate-400">admin</p>
            </button>
            <button
              type="button"
              onClick={() => fillDemo("T001", "Teacher@123")}
              className="rounded-lg border border-slate-200 px-2 py-2 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-colors"
            >
              <p className="font-medium text-slate-700">中队长</p>
              <p className="text-slate-400">T001</p>
            </button>
            <button
              type="button"
              onClick={() => fillDemo("S001", "Student@123")}
              className="rounded-lg border border-slate-200 px-2 py-2 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-colors"
            >
              <p className="font-medium text-slate-700">学生</p>
              <p className="text-slate-400">S001</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getToken } from "@/components/shared";
import { cn } from "@/lib/utils";
import {
  GraduationCap,
  LayoutDashboard,
  FileText,
  CheckSquare,
  ClipboardCheck,
  Users,
  School,
  BarChart3,
  LogOut,
  Menu,
  X,
  Bell,
  Settings,
  History,
  MapPin,
  KeyRound,
  Network,
  GitBranch,
} from "lucide-react";

interface MessageItem {
  id: string;
  type: string;
  title: string;
  content: string | null;
  is_read: boolean;
  created_at: string;
}

const navItems: Record<string, Array<{ href: string; label: string; icon: React.ElementType }>> = {
  student: [
    { href: "/student", label: "我的申请", icon: LayoutDashboard },
    { href: "/student/apply", label: "发起请假", icon: FileText },
    { href: "/student/records", label: "请假记录", icon: History },
  ],
  teacher: [
    { href: "/teacher", label: "待办审批", icon: CheckSquare },
    { href: "/teacher/processed", label: "已处理记录", icon: ClipboardCheck },
    { href: "/teacher/checkins", label: "销假确认", icon: MapPin },
  ],
  admin: [
    { href: "/admin", label: "工作台", icon: LayoutDashboard },
    { href: "/admin/students", label: "学生管理", icon: Users },
    { href: "/admin/teachers", label: "账号与角色", icon: Users },
    { href: "/admin/org", label: "组织架构", icon: Network },
    { href: "/admin/relations", label: "管理关系", icon: GitBranch },
    { href: "/admin/classes", label: "班级管理", icon: School },
    { href: "/admin/leaves", label: "全部请假", icon: FileText },
    { href: "/admin/stats", label: "统计报表", icon: BarChart3 },
    { href: "/admin/campuses", label: "校区围栏", icon: MapPin },
    { href: "/admin/leave-types", label: "请假类型", icon: Settings },
    { href: "/admin/flows", label: "审批流配置", icon: ClipboardCheck },
    { href: "/admin/logs", label: "操作日志", icon: History },
  ],
};

const roleLabel: Record<string, string> = {
  student: "学生",
  teacher: "中队长",
  head_teacher: "大队长",
  affair: "学工处",
  college_leader: "分管院领导",
  admin: "管理员",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (user?.mustChangePassword) router.push("/password-change");
  }, [loading, user, router]);

  const fetchMessages = async () => {
    try {
      const token = getToken();
      const res = await fetch("/api/messages", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        const list: MessageItem[] = data.data ?? [];
        setMessages(list.slice(0, 10));
        setUnread(list.filter((m) => !m.is_read).length);
      } else if (res.status === 401) {
        router.push("/login");
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (user) {
      fetchMessages();
      const timer = setInterval(fetchMessages, 60000);
      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const markAllRead = async () => {
    const token = getToken();
    await fetch("/api/messages/read-all", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    setUnread(0);
    setMessages((m) => m.map((x) => ({ ...x, is_read: true })));
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  // 多角色：非学生角色统一进入教师工作台（ROLE_HOME），管理员额外看管理菜单，菜单按 roles 合并去重
  const roles: string[] = user.roles && user.roles.length > 0 ? user.roles : [user.role];
  const navRoleKeys = roles.some((r) => r === "admin")
    ? ["admin"]
    : roles.filter((r) => r !== "student").length > 0
      ? ["teacher"]
      : ["student"];
  const items = Array.from(
    new Map(
      navRoleKeys.flatMap((k) => navItems[k] ?? []).map((it) => [it.href, it])
    ).values()
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-slate-800">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-white text-sm">学生请假管理系统</span>
          <button
            className="ml-auto lg:hidden text-slate-400"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const homeHrefs = ["/student", "/teacher", "/admin"];
            const active = homeHrefs.includes(item.href)
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-indigo-600 text-white font-medium"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-800 space-y-1">
          <Link
            href="/profile"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              pathname === "/profile"
                ? "bg-indigo-600 text-white font-medium"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Settings className="h-4.5 w-4.5 shrink-0" />
            个人中心
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="h-4.5 w-4.5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 flex items-center px-4 sm:px-6 gap-3">
          <button
            className="lg:hidden text-slate-500"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开菜单"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <Link
            href="/password-change"
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <KeyRound className="h-4 w-4" />
            修改密码
          </Link>
          <div className="relative">
            <button
              onClick={() => setBellOpen((v) => !v)}
              className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="消息"
            >
              <Bell className="h-5 w-5 text-slate-600" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-medium flex items-center justify-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl border border-slate-200 shadow-lg z-50 max-h-96 overflow-y-auto">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span className="text-sm font-medium text-slate-900">站内消息</span>
                    {unread > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        全部已读
                      </button>
                    )}
                  </div>
                  {messages.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-400">暂无消息</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "px-4 py-3 border-b border-slate-50 last:border-0",
                          !m.is_read && "bg-indigo-50/50"
                        )}
                      >
                        <p className="text-sm font-medium text-slate-800">{m.title}</p>
                        {m.content && <p className="text-xs text-slate-500 mt-0.5">{m.content}</p>}
                        <p className="text-[11px] text-slate-400 mt-1">
                          {new Date(m.created_at).toLocaleString("zh-CN", { hour12: false })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
            <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-medium">
              {user.name.slice(0, 1)}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-slate-800 leading-tight">{user.name}</p>
              <p className="text-xs text-slate-400 leading-tight">
                {roles.map((r) => roleLabel[r] ?? r).join(" / ")}
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

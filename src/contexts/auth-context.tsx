"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TOKEN_KEY, getToken, setToken, clearToken } from "@/components/shared";

export type UserRole =
  | "student"
  | "teacher"
  | "head_teacher"
  | "affair"
  | "college_leader"
  | "admin";

export const ALL_ROLE_LABELS: Record<UserRole, string> = {
  student: "学生",
  teacher: "中队长",
  head_teacher: "大队长",
  affair: "学工处",
  college_leader: "分管院领导",
  admin: "管理员",
};

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  roles?: UserRole[];
  classId: string | null;
  campusId?: string | null;
  studentNo?: string | null;
  grade?: string | null;
  major?: string | null;
  department?: string | null;
  majorId?: string | null;
  departmentId?: string | null;
  studentStatus?: string;
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  unreadCount: number;
  todoCount: number;
  setUser: (u: AuthUser | null) => void;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshCounts: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [todoCount, setTodoCount] = useState(0);
  const router = useRouter();

  const refreshCounts = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/messages?unreadOnly=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list: { is_todo?: boolean }[] = data.data ?? [];
        setUnreadCount(list.length);
        setTodoCount(list.filter((m) => m.is_todo).length);
      }
    } catch {
      // 忽略角标刷新失败
    }
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user as AuthUser);
        if (typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
        if (typeof data.todoCount === "number") setTodoCount(data.todoCount);
      } else {
        clearToken();
        setUser(null);
      }
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (username: string, password: string): Promise<AuthUser> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "登录失败");
    }
    const loggedUser = data.user as AuthUser;
    if (data.token) setToken(data.token as string);
    setUser(loggedUser);
    void refreshCounts();
    return loggedUser;
  };

  const logout = async () => {
    const token = getToken();
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // 忽略登出接口异常
    }
    clearToken();
    setUser(null);
    setUnreadCount(0);
    setTodoCount(0);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        unreadCount,
        todoCount,
        setUser,
        login,
        logout,
        refresh,
        refreshCounts,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { TOKEN_KEY };

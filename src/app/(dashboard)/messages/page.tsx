"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { LoadingSpinner, EmptyState, getToken, messageTypeLabel, messageTypeClass } from "@/components/shared";

interface Message {
  id: string;
  type: string;
  title: string;
  content: string;
  leave_id: string | null;
  is_read: boolean;
  created_at: string;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"unread" | "all">("unread");

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/messages?type=${tab}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { data: Message[] };
      setMessages(data.data);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    void fetchMessages();
  }, [fetchMessages]);

  const markRead = async (id: string) => {
    const res = await fetch(`/api/messages/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) void fetchMessages();
  };

  const markAllRead = async () => {
    const res = await fetch("/api/messages/read-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) void fetchMessages();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Bell className="w-6 h-6 text-indigo-600" />
          消息中心
        </h1>
        <button
          onClick={markAllRead}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600"
        >
          <CheckCheck className="w-4 h-4" />
          全部标为已读
        </button>
      </div>

      <div className="flex gap-2">
        {(["unread", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              tab === t ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t === "unread" ? "未读" : "全部"}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm divide-y divide-slate-100">
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState icon={<Inbox className="w-12 h-12 text-slate-300" />} text="暂无消息" />
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`p-4 flex gap-3 ${m.is_read ? "" : "bg-indigo-50/40"}`}
            >
              <span className={`mt-0.5 shrink-0 px-2 py-0.5 rounded-full text-xs h-fit ${messageTypeClass(m.type)}`}>
                {messageTypeLabel(m.type)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm ${m.is_read ? "text-slate-700" : "font-semibold text-slate-900"}`}>
                    {m.title}
                  </p>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(m.created_at).toLocaleString("zh-CN", { hour12: false })}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5 break-words">{m.content}</p>
                {!m.is_read && (
                  <button
                    onClick={() => markRead(m.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 mt-1.5"
                  >
                    标为已读
                  </button>
                )}
              </div>
              {!m.is_read && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

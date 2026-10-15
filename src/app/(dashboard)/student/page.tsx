"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import {
  Card,
  LeaveStatusBadge,
  LeaveTypeBadge,
  CheckinBadge,
} from "@/components/shared";
import { FilePlus, MapPin, Loader2 } from "lucide-react";

interface LeaveRow {
  id: string;
  request_no: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  status: string;
  checkin_status: string;
  checkin_in_fence: boolean | null;
  checkin_remark: string | null;
  reason: string;
  created_at: string;
}

export default function StudentHome() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinId, setCheckinId] = useState<string | null>(null);
  const [checkinMsg, setCheckinMsg] = useState("");
  const [checkinError, setCheckinError] = useState("");
  const [mockMode, setMockMode] = useState(false);

  const load = async () => {
    const res = await fetch("/api/leaves", { credentials: "include" });
    const data = await res.json();
    setLeaves(data.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const doCheckin = async (id: string, useMock: boolean) => {
    setCheckinId(id);
    setCheckinMsg("");
    setCheckinError("");
    try {
      let payload: { lat: number; lng: number; accuracy?: number; mock?: boolean };
      if (useMock) {
        // 开发环境模拟：主校区坐标（天安门附近模拟，实际用 seed 中的坐标由前端无法获取，使用后端 mock 标记）
        payload = { lat: 0, lng: 0, accuracy: 10, mock: true };
      } else {
        if (!navigator.geolocation) {
          throw new Error("当前浏览器不支持定位，请联系管理员人工核验");
        }
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        });
        payload = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
      }
      const res = await fetch(`/api/leaves/${id}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "销假失败");
      setCheckinMsg(data.message ?? "销假申请已提交，等待中队长确认");
      load();
    } catch (err) {
      const msg = err instanceof GeolocationPositionError
        ? "定位失败：" + (err.message || "请允许位置权限")
        : err instanceof Error
          ? err.message
          : "销假失败";
      setCheckinError(msg);
    } finally {
      setCheckinId(null);
    }
  };

  const pending = leaves.filter((l) => ["pending", "in_progress"].includes(l.status));
  const needCheckin = leaves.find(
    (l) => l.status === "approved" && ["none", "rejected"].includes(l.checkin_status)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">你好，{user?.name}</h1>
          <p className="mt-1 text-sm text-slate-500">在线提交请假、查看进度、返校定位销假</p>
        </div>
        <Link
          href="/student/apply"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors self-start"
        >
          <FilePlus className="h-4 w-4" />
          发起请假
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <p className="text-sm text-slate-500">我的申请</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{leaves.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">审批中</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{pending.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">已通过</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">
            {leaves.filter((l) => l.status === "approved").length}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">待销假</p>
          <p className="mt-2 text-2xl font-bold text-rose-600">
            {leaves.filter(
              (l) => l.status === "approved" && l.checkin_status !== "done"
            ).length}
          </p>
        </Card>
      </div>

      {needCheckin && (
        <Card className="p-6 border-rose-200 bg-rose-50/40">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-slate-900">您有已批准的请假需要返校销假</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                编号 {needCheckin.request_no}，应返校日期 {needCheckin.end_date}。请在校区围栏内打卡，经中队长确认后完成销假。
              </p>
              {checkinMsg && <p className="text-sm text-emerald-600 mt-2">{checkinMsg}</p>}
              {checkinError && <p className="text-sm text-rose-600 mt-2">{checkinError}</p>}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => doCheckin(needCheckin.id, false)}
                disabled={checkinId === needCheckin.id}
                className="inline-flex items-center justify-center gap-2 bg-rose-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
              >
                {checkinId === needCheckin.id && !mockMode && <Loader2 className="h-4 w-4 animate-spin" />}
                定位销假
              </button>
              <button
                onClick={() => {
                  setMockMode(true);
                  doCheckin(needCheckin.id, true);
                }}
                disabled={checkinId === needCheckin.id}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                演示环境：模拟定位打卡
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-semibold text-slate-900 mb-4">最近申请</h2>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : leaves.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <p className="text-sm">暂无请假记录</p>
            <Link href="/student/apply" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
              立即发起请假
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {leaves.slice(0, 5).map((leave) => (
              <div
                key={leave.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-slate-200 p-4 hover:border-indigo-300 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <LeaveTypeBadge type={leave.leave_type} />
                    <LeaveStatusBadge status={leave.status} />
                    <CheckinBadge status={leave.checkin_status} />
                    <span className="text-xs text-slate-400">{leave.request_no}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700 line-clamp-1">
                    {leave.start_date} 至 {leave.end_date}（{leave.duration_days}天） · {leave.reason}
                  </p>
                </div>
                <Link
                  href="/student/records"
                  className="text-sm text-indigo-600 hover:underline shrink-0"
                >
                  查看详情
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

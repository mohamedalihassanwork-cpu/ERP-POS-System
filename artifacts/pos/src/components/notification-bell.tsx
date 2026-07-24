import { useEffect, useRef, useState } from "react";
import { Bell, Loader2, RefreshCw, CheckCheck } from "lucide-react";
import {
  useGetUnreadNotificationCount,
  useListNotifications,
  useRefreshNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  getGetUnreadNotificationCountQueryKey,
  getListNotificationsQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
};

function timeAgo(s: string): string {
  const diff = Date.now() - new Date(s).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} ي`;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const countQuery = useGetUnreadNotificationCount({
    query: {
      refetchInterval: 60000,
      queryKey: getGetUnreadNotificationCountQueryKey(),
    },
  });
  const unread = countQuery.data?.unread ?? 0;

  const listQuery = useListNotifications(
    { page: 1, pageSize: 20 },
    {
      query: {
        enabled: open,
        queryKey: getListNotificationsQueryKey({ page: 1, pageSize: 20 }),
      },
    },
  );
  const notifications = listQuery.data?.items ?? [];

  const refreshMutation = useRefreshNotifications();
  const markAllMutation = useMarkAllNotificationsRead();
  const markOneMutation = useMarkNotificationRead();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: getListNotificationsQueryKey({ page: 1, pageSize: 20 }),
    });
    void queryClient.invalidateQueries({
      queryKey: getGetUnreadNotificationCountQueryKey(),
    });
  }

  async function handleRefresh() {
    try {
      await refreshMutation.mutateAsync();
      invalidate();
    } catch {
      /* ignore */
    }
  }

  async function handleMarkAll() {
    try {
      await markAllMutation.mutateAsync();
      invalidate();
    } catch {
      /* ignore */
    }
  }

  async function handleMarkOne(n: Notification) {
    if (n.isRead) return;
    try {
      await markOneMutation.mutateAsync({ id: n.id });
      invalidate();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2.5 rounded-xl hover:bg-slate-100 text-slate-600 transition"
        data-testid="button-notifications"
        aria-label="الإشعارات"
      >
        <Bell size={22} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
            data-testid="badge-unread-count"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">الإشعارات</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => void handleRefresh()}
                disabled={refreshMutation.isPending}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600 disabled:opacity-50"
                title="تحديث"
                data-testid="button-refresh-notifications"
              >
                {refreshMutation.isPending ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <RefreshCw size={16} />
                )}
              </button>
              <button
                onClick={() => void handleMarkAll()}
                disabled={markAllMutation.isPending || unread === 0}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-emerald-600 disabled:opacity-40"
                title="تعليم الكل كمقروء"
                data-testid="button-mark-all-read"
              >
                <CheckCheck size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="p-8 text-center text-slate-400">
                <Loader2 className="animate-spin inline" size={20} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                لا توجد إشعارات
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => void handleMarkOne(n)}
                      className={`w-full text-right p-4 flex gap-3 transition hover:bg-slate-50 ${
                        n.isRead ? "opacity-60" : ""
                      }`}
                      data-testid={`notification-${n.id}`}
                    >
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                          SEVERITY_DOT[n.severity] ?? "bg-slate-400"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-700 text-sm truncate">
                            {n.title}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                        {n.body && (
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {n.body}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

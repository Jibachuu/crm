"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, CheckSquare, MessageSquare, X, CheckCheck } from "lucide-react";

interface Notification {
  id: string;
  type: "task" | "message";
  title: string;
  subtitle?: string;
  link?: string;
  date: string;
}

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load read IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("read_notifications");
      if (stored) setReadIds(new Set(JSON.parse(stored)));
    } catch { /* ignore */ }
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        const unread = (data.notifications ?? []).filter((n: Notification) => !readIds.has(n.id)).length;
        setCount(unread);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { fetchNotifications(); }, []);
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Update count when readIds change
  useEffect(() => {
    const unread = notifications.filter((n) => !readIds.has(n.id)).length;
    setCount(unread);
  }, [readIds, notifications]);

  function toggle() {
    if (!open) fetchNotifications();
    setOpen(!open);
  }

  function markAsRead(id: string) {
    const updated = new Set(readIds);
    updated.add(id);
    setReadIds(updated);
    localStorage.setItem("read_notifications", JSON.stringify([...updated]));
  }

  function markAllAsRead() {
    const updated = new Set(readIds);
    notifications.forEach((n) => updated.add(n.id));
    setReadIds(updated);
    localStorage.setItem("read_notifications", JSON.stringify([...updated]));
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "только что";
    if (mins < 60) return `${mins} мин назад`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ч назад`;
    const days = Math.floor(hrs / 24);
    return `${days} дн назад`;
  }

  const unreadNotifications = notifications.filter((n) => !readIds.has(n.id));
  const readNotifications = notifications.filter((n) => readIds.has(n.id));

  return (
    <header
      className="h-12 bg-white flex items-center justify-between px-6 sticky top-0 z-10"
      style={{ borderBottom: "1px solid #e4e4e4" }}
    >
      <h1 className="text-sm font-semibold" style={{ color: "#333" }}>{title}</h1>

      <div className="relative" ref={ref}>
        <button
          onClick={toggle}
          className="relative p-1.5 rounded transition-all hover:bg-gray-100 active:scale-95"
          style={{ color: open ? "#0067a5" : "#888" }}
        >
          <Bell size={16} />
          {count > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: "#e74c3c", fontSize: 9, padding: "0 4px" }}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl overflow-hidden"
            style={{ width: 380, border: "1px solid #e4e4e4", maxHeight: "70vh", zIndex: 50 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #f0f0f0" }}>
              <span className="text-sm font-semibold" style={{ color: "#333" }}>Уведомления</span>
              <div className="flex items-center gap-2">
                {count > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    style={{ color: "#0067a5" }}
                    title="Отметить все прочитанными"
                  >
                    <CheckCheck size={12} /> Прочитать все
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100 transition-colors">
                  <X size={14} style={{ color: "#aaa" }} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 50px)" }}>
              {loading && notifications.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: "#aaa" }}>Загрузка...</p>
              )}

              {!loading && notifications.length === 0 && (
                <div className="text-center py-10">
                  <Bell size={28} className="mx-auto mb-2" style={{ color: "#ddd" }} />
                  <p className="text-xs" style={{ color: "#aaa" }}>Нет уведомлений</p>
                </div>
              )}

              {/* Unread */}
              {unreadNotifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  isRead={false}
                  onRead={() => markAsRead(n.id)}
                  onClose={() => setOpen(false)}
                  timeAgo={timeAgo}
                />
              ))}

              {/* Read */}
              {readNotifications.length > 0 && unreadNotifications.length > 0 && (
                <div className="px-4 py-2" style={{ background: "#fafafa", borderTop: "1px solid #f0f0f0" }}>
                  <span className="text-xs font-medium" style={{ color: "#aaa" }}>Прочитанные</span>
                </div>
              )}
              {readNotifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  isRead={true}
                  onRead={() => {}}
                  onClose={() => setOpen(false)}
                  timeAgo={timeAgo}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function NotificationItem({ notification: n, isRead, onRead, onClose, timeAgo }: {
  notification: Notification;
  isRead: boolean;
  onRead: () => void;
  onClose: () => void;
  timeAgo: (d: string) => string;
}) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
      style={{
        borderBottom: "1px solid #f5f5f5",
        opacity: isRead ? 0.55 : 1,
        background: isRead ? "#fafafa" : "transparent",
      }}
    >
      <div className="mt-0.5 flex-shrink-0">
        {n.type === "task" ? (
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#e8f4fd" }}>
            <CheckSquare size={12} style={{ color: "#0067a5" }} />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#e8f5e9" }}>
            <MessageSquare size={12} style={{ color: "#2e7d32" }} />
          </div>
        )}
      </div>
      <Link
        href={n.link ?? "#"}
        onClick={() => { onRead(); onClose(); }}
        className="flex-1 min-w-0"
      >
        <p className="text-xs font-medium" style={{ color: isRead ? "#888" : "#333" }}>{n.title}</p>
        {n.subtitle && <p className="text-xs" style={{ color: "#999" }}>{n.subtitle}</p>}
      </Link>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-xs" style={{ color: "#ccc" }}>{timeAgo(n.date)}</span>
        {!isRead && (
          <button
            onClick={onRead}
            className="text-xs px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
            style={{ color: "#0067a5" }}
            title="Прочитано"
          >
            <CheckCheck size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

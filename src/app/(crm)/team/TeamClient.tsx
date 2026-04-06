"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Paperclip, Phone } from "lucide-react";
import { getInitials } from "@/lib/utils";

interface User {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  is_active: boolean;
}

interface Message {
  id: string;
  from_user: string;
  to_user: string;
  body: string | null;
  file_url: string | null;
  file_name: string | null;
  is_read: boolean;
  created_at: string;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + time;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  supervisor: "Руководитель",
  manager: "Менеджер",
};

export default function TeamClient({ currentUserId, users }: { currentUserId: string; users: User[] }) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch unread counts
  const fetchUnread = useCallback(async () => {
    const res = await fetch("/api/team/messages");
    if (res.ok) {
      const data = await res.json();
      setUnreadMap(data.unreadMap ?? {});
    }
  }, []);

  useEffect(() => { fetchUnread(); }, [fetchUnread]);
  useEffect(() => {
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Fetch messages for selected user
  const fetchMessages = useCallback(async () => {
    if (!selectedUser) return;
    const res = await fetch(`/api/team/messages?peer=${selectedUser.id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      // Clear unread for this user
      setUnreadMap((prev) => { const n = { ...prev }; delete n[selectedUser.id]; return n; });
    }
  }, [selectedUser]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => {
    if (!selectedUser) return;
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [selectedUser, fetchMessages]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!text.trim() || !selectedUser || sending) return;
    setSending(true);
    const res = await fetch("/api/team/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_user: selectedUser.id, body: text.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setText("");
    }
    setSending(false);
  }

  async function sendFile(file: File) {
    if (!selectedUser) return;
    // For now, send file name as message body (real file upload would need Supabase Storage)
    setSending(true);
    const res = await fetch("/api/team/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_user: selectedUser.id,
        body: `📎 Файл: ${file.name} (${(file.size / 1024).toFixed(1)} КБ)`,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
    }
    setSending(false);
  }

  async function startCall(userId?: string) {
    const roomId = "crm-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const callUrl = `https://meet.jit.si/${roomId}`;

    // If calling a specific user — send them the link in chat
    const targetId = userId || selectedUser?.id;
    if (targetId) {
      const res = await fetch("/api/team/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_user: targetId,
          body: `📞 Приглашение в видеозвонок!\nПрисоединяйтесь: ${callUrl}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (targetId === selectedUser?.id) {
          setMessages((prev) => [...prev, data.message]);
        }
      }
    }

    window.open(callUrl, "_blank");
  }

  const filteredUsers = users.filter((u) =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = Object.values(unreadMap).reduce((s, n) => s + n, 0);

  return (
    <div className="flex w-full" style={{ height: "calc(100vh - 48px)" }}>
      {/* Left panel — user list */}
      <div className="flex flex-col" style={{ width: 300, borderRight: "1px solid #e4e4e4", background: "#fff" }}>
        {/* Header */}
        <div className="px-3 py-3" style={{ borderBottom: "1px solid #f0f0f0" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск сотрудника..."
            className="w-full px-3 py-1.5 text-xs focus:outline-none"
            style={{ border: "1px solid #e0e0e0", borderRadius: 4 }}
          />
        </div>

        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: "#888" }}>КОМАНДА · {users.length}</span>
          {totalUnread > 0 && (
            <span className="text-xs text-white rounded-full px-1.5 py-0.5" style={{ background: "#e74c3c", minWidth: 18, textAlign: "center" }}>
              {totalUnread}
            </span>
          )}
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto">
          {filteredUsers.map((u) => {
            const isSel = selectedUser?.id === u.id;
            const unread = unreadMap[u.id] ?? 0;
            return (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors"
                style={{
                  background: isSel ? "#e8f4fd" : "transparent",
                  borderLeft: isSel ? "3px solid #0067a5" : "3px solid transparent",
                }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: u.is_active ? "#0067a5" : "#aaa" }}>
                  {getInitials(u.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate" style={{ color: "#222" }}>{u.full_name ?? u.email}</span>
                    {unread > 0 && (
                      <span className="text-xs text-white rounded-full px-1.5 py-0.5 flex-shrink-0"
                        style={{ background: "#0067a5", minWidth: 18, textAlign: "center" }}>
                        {unread}
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: "#aaa" }}>{ROLE_LABELS[u.role] ?? u.role}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Telemost button */}
        <div className="p-3" style={{ borderTop: "1px solid #f0f0f0" }}>
          <button
            onClick={() => startCall()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded transition-colors"
            style={{ background: "#5b57d1", color: "#fff", borderRadius: 6 }}
          >
            <Phone size={14} /> Создать звонок
          </button>
        </div>
      </div>

      {/* Right panel — chat */}
      <div className="flex flex-col flex-1 min-w-0" style={{ background: "#f5f5f5" }}>
        {!selectedUser ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Send size={48} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите сотрудника для начала переписки</p>
            <button
              onClick={() => startCall()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors mt-4"
              style={{ background: "#5b57d1", color: "#fff", borderRadius: 6 }}
            >
              <Phone size={14} /> Или начните видеозвонок
            </button>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid #e4e4e4", background: "#fff" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: "#0067a5" }}>
                  {getInitials(selectedUser.full_name)}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#222" }}>{selectedUser.full_name}</p>
                  <p className="text-xs" style={{ color: "#aaa" }}>{selectedUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => startCall()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors"
                style={{ background: "#5b57d1", color: "#fff", borderRadius: 4 }}
              >
                <Phone size={12} /> Позвонить
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {messages.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: "#aaa" }}>Начните переписку</p>
              )}
              {messages.map((msg) => {
                const isMe = msg.from_user === currentUserId;
                return (
                  <div key={msg.id} className="flex" style={{ justifyContent: isMe ? "flex-end" : "flex-start" }}>
                    <div
                      style={{
                        maxWidth: "70%",
                        padding: "8px 12px",
                        borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                        background: isMe ? "#0067a5" : "#fff",
                        color: isMe ? "#fff" : "#333",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                      }}
                    >
                      {msg.body && <p className="text-sm whitespace-pre-wrap">{msg.body}</p>}
                      <p className="text-xs mt-1" style={{ color: isMe ? "rgba(255,255,255,0.6)" : "#aaa", textAlign: "right" }}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid #e4e4e4", background: "#fff" }}>
              <button
                onClick={() => fileRef.current?.click()}
                className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
                title="Прикрепить файл"
              >
                <Paperclip size={18} style={{ color: "#888" }} />
              </button>
              <input ref={fileRef} type="file" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }}
              />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Введите сообщение..."
                className="flex-1 text-sm px-3 py-2 focus:outline-none rounded-full"
                style={{ border: "1px solid #e0e0e0", background: "#f5f5f5" }}
              />
              <button
                onClick={sendMessage}
                disabled={!text.trim() || sending}
                className="p-2 rounded-full transition-colors disabled:opacity-40"
                style={{ background: "#0067a5" }}
              >
                <Send size={16} style={{ color: "#fff" }} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

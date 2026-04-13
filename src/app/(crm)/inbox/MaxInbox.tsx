"use client";

import { useState, useEffect } from "react";
import { CircleDot, RefreshCw, Link2 } from "lucide-react";
import MaxChat from "@/components/ui/MaxChat";
import LinkedEntitiesPanel from "@/components/ui/LinkedEntitiesPanel";

interface MaxChatItem {
  id?: string;
  chatId?: number;
  title?: string;
  owner?: number;
  avatar?: string;
  phone?: string;
  lastMessage?: { sender?: number; text?: string; time?: number };
  unread?: boolean;
}

export default function MaxInbox() {
  const [chats, setChats] = useState<MaxChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [linkedOpen, setLinkedOpen] = useState(false);

  async function loadChats() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/max?action=chats");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Ошибка"); setLoading(false); return; }
      // Extract chats array from response
      const chatList = data.chats ?? data ?? [];
      setChats(Array.isArray(chatList) ? chatList : []);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await loadChats();
    setRefreshing(false);
  }

  useEffect(() => { loadChats(); }, []);

  function formatTime(ts: number | undefined) {
    if (!ts) return "";
    const d = new Date(ts > 9999999999 ? ts : ts * 1000);
    const now = new Date();
    const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return time;
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + time;
  }

  return (
    <div className="flex h-full">
      {/* Chat list */}
      <div className="flex flex-col" style={{ width: 380, borderRight: "1px solid #e4e4e4", background: "#fff" }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
          <span className="text-xs font-semibold" style={{ color: "#888" }}>МАКС · {chats.length}</span>
          <button onClick={refresh} disabled={refreshing} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw size={13} style={{ color: "#888" }} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-xs text-center py-12" style={{ color: "#aaa" }}>Загрузка чатов...</p>}
          {error && (
            <div className="p-4 text-center">
              <p className="text-xs" style={{ color: "#d32f2f" }}>{error}</p>
              <button onClick={loadChats} className="text-xs underline mt-2" style={{ color: "#0067a5" }}>Повторить</button>
            </div>
          )}
          {!loading && !error && chats.length === 0 && (
            <div className="text-center py-12">
              <CircleDot size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} />
              <p className="text-xs" style={{ color: "#aaa" }}>Нет чатов</p>
            </div>
          )}
          {chats.map((chat, i) => {
            const chatId = String(chat.chatId ?? chat.id ?? i);
            const isSelected = selectedChat === chatId;
            return (
              <button key={chatId} onClick={() => setSelectedChat(chatId)}
                className="w-full text-left px-4 py-3 transition-colors hover:bg-gray-50"
                style={{ borderBottom: "1px solid #f5f5f5", background: isSelected ? "#e8f4fd" : "transparent" }}>
                <div className="flex items-start gap-3">
                  {chat.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={chat.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                      style={{ background: "#0067a5" }}>
                      {(chat.title ?? "?")[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium truncate" style={{ color: "#333" }}>
                        {chat.title ?? `Чат ${chatId}`}
                      </span>
                      <span className="text-xs flex-shrink-0 ml-2" style={{ color: "#aaa" }}>
                        {formatTime(chat.lastMessage?.time)}
                      </span>
                    </div>
                    {chat.lastMessage?.text && (
                      <p className="text-xs truncate" style={{ color: "#999" }}>{chat.lastMessage.text}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat view */}
      <div className="flex-1 flex min-w-0" style={{ background: "#f5f5f5" }}>
        <div className="flex-1 flex flex-col min-w-0">
        {!selectedChat ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <CircleDot size={48} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите чат МАКС</p>
          </div>
        ) : (
          <>
            {/* Chat header with buttons */}
            {(() => {
              const chat = chats.find((c) => String(c.chatId ?? c.id) === selectedChat);
              return (
                <div className="flex items-center gap-2 px-4 py-2" style={{ background: "#fff", borderBottom: "1px solid #e4e4e4" }}>
                  <div className="w-3 h-3 rounded-full" style={{ background: "#0067a5" }} />
                  <span className="text-sm font-medium" style={{ color: "#333" }}>{chat?.title ?? selectedChat}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#0067a520", color: "#0067a5" }}>МАКС</span>
                  <div className="flex-1" />
                  <button
                    onClick={() => setLinkedOpen(!linkedOpen)}
                    className="text-xs px-2 py-1 rounded hover:bg-blue-50 flex items-center gap-1"
                    style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}
                  >
                    <Link2 size={11} /> Связи
                  </button>
                  <button
                    onClick={async () => {
                      await fetch("/api/max", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_unread", chat_id: selectedChat }) });
                      refresh();
                    }}
                    className="text-xs px-2 py-1 rounded hover:bg-blue-50"
                    style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}
                  >
                    Не прочитано
                  </button>
                </div>
              );
            })()}
            <div className="flex-1 min-h-0">
              <MaxChat chatId={selectedChat} compact />
            </div>
          </>
        )}
        </div>
        {linkedOpen && selectedChat && (() => {
          const chat = chats.find((c) => String(c.chatId ?? c.id) === selectedChat);
          return (
            <div style={{ width: 320, borderLeft: "1px solid #e4e4e4" }}>
              <LinkedEntitiesPanel
                maksId={selectedChat}
                phone={chat?.phone ? String(chat.phone) : undefined}
                displayName={chat?.title || undefined}
                channel="maks"
                onClose={() => setLinkedOpen(false)}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}

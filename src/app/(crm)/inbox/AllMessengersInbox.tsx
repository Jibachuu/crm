"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Search, MessageSquare, UserPlus } from "lucide-react";
import TelegramChat from "@/components/ui/TelegramChat";
import MaxChat from "@/components/ui/MaxChat";

interface UnifiedDialog {
  id: string;
  name: string;
  channel: "telegram" | "maks";
  lastMessage: string;
  lastTime: number;
  unreadCount?: number;
  peer?: string; // telegram peer
  chatId?: string; // max chatId
}

const CHANNEL_COLORS: Record<string, { bg: string; badge: string; label: string }> = {
  telegram: { bg: "#0088cc", badge: "#0088cc", label: "TG" },
  maks: { bg: "#0067a5", badge: "#0067a5", label: "M" },
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function formatTime(ts: number) {
  if (!ts) return "";
  const d = new Date(ts > 9999999999 ? ts : ts * 1000);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + time;
}

export default function AllMessengersInbox() {
  const [dialogs, setDialogs] = useState<UnifiedDialog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UnifiedDialog | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [addingContact, setAddingContact] = useState<string | false>(false);
  const [addError, setAddError] = useState("");

  async function addContact(channel: "telegram" | "maks") {
    if (!newPhone.trim()) return;
    setAddingContact(channel);
    setAddError("");
    try {
      if (channel === "telegram") {
        const res = await fetch("/api/telegram/add-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: newPhone.trim() }),
        });
        const data = await res.json();
        if (data.ok && data.user) {
          setShowNewChat(false);
          setNewPhone("");
          // Open the new chat
          setSelected({
            id: `tg_${data.user.id}`,
            name: `${data.user.firstName || ""} ${data.user.lastName || ""}`.trim() || newPhone,
            channel: "telegram",
            lastMessage: "",
            lastTime: Date.now() / 1000,
            peer: data.user.username || data.user.phone || data.user.id,
          });
          refresh();
        } else {
          setAddError(data.error || "Контакт не найден");
        }
      } else {
        // MAX: search by phone not supported yet, show message
        setAddError("Поиск по телефону в МАКС пока не поддерживается. Найдите контакт в приложении МАКС.");
      }
    } catch (e) {
      setAddError(String(e));
    }
    setAddingContact(false);
  }

  async function loadAll() {
    setLoading(true);
    const all: UnifiedDialog[] = [];

    // Load Telegram dialogs
    try {
      const res = await fetch("/api/telegram/dialogs");
      if (res.ok) {
        const data = await res.json();
        for (const d of data.dialogs ?? []) {
          all.push({
            id: `tg_${d.id}`,
            name: d.name || d.username || String(d.id),
            channel: "telegram",
            lastMessage: d.lastMessage || "",
            lastTime: d.lastDate || 0,
            unreadCount: d.unreadCount || 0,
            peer: d.username || d.phone || String(d.id),
          });
        }
      }
    } catch { /* skip */ }

    // Load MAX chats
    try {
      const res = await fetch("/api/max?action=chats");
      if (res.ok) {
        const data = await res.json();
        for (const c of data.chats ?? []) {
          const chatId = String(c.chatId ?? c.id ?? "");
          if (!chatId || Number(chatId) < 0) continue; // skip groups
          all.push({
            id: `max_${chatId}`,
            name: c.title || chatId,
            channel: "maks",
            lastMessage: c.lastMessage?.text || "",
            lastTime: c.lastMessage?.time || 0,
            chatId,
          });
        }
      }
    } catch { /* skip */ }

    // Sort by last message time, newest first
    all.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
    setDialogs(all);
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  useEffect(() => { loadAll(); }, []);

  const filtered = dialogs.filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.lastMessage.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full">
      {/* Dialog list */}
      <div className="flex flex-col" style={{ width: 350, borderRight: "1px solid #e4e4e4", background: "#fff" }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded focus:outline-none"
              style={{ border: "1px solid #e0e0e0" }} />
          </div>
          <button onClick={() => setShowNewChat(true)} className="p-1.5 rounded hover:bg-blue-50" title="Новый чат по номеру">
            <UserPlus size={13} style={{ color: "#0067a5" }} />
          </button>
          <button onClick={refresh} disabled={refreshing} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw size={13} style={{ color: "#888" }} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        {/* New chat by phone */}
        {showNewChat && (
          <div className="px-3 py-3" style={{ borderBottom: "1px solid #f0f0f0", background: "#f8f9fa" }}>
            <p className="text-xs font-medium mb-2" style={{ color: "#555" }}>Начать чат по номеру телефона</p>
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+7 999 123 45 67"
              className="w-full text-sm px-3 py-1.5 rounded mb-2 focus:outline-none"
              style={{ border: "1px solid #d0d0d0" }} />
            <div className="flex gap-2">
              <button onClick={() => addContact("telegram")} disabled={!!addingContact || !newPhone.trim()}
                className="flex-1 text-xs py-1.5 rounded font-medium disabled:opacity-40"
                style={{ background: "#0088cc", color: "#fff" }}>
                {addingContact === "telegram" ? "..." : "Telegram"}
              </button>
              <button onClick={() => addContact("maks")} disabled={!!addingContact || !newPhone.trim()}
                className="flex-1 text-xs py-1.5 rounded font-medium disabled:opacity-40"
                style={{ background: "#0067a5", color: "#fff" }}>
                {addingContact === "maks" ? "..." : "МАКС"}
              </button>
              <button onClick={() => { setShowNewChat(false); setNewPhone(""); }} className="text-xs px-2" style={{ color: "#888" }}>
                Отмена
              </button>
            </div>
            {addError && <p className="text-xs mt-1" style={{ color: "#e74c3c" }}>{addError}</p>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-xs text-center py-12" style={{ color: "#aaa" }}>Загрузка чатов...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-xs text-center py-12" style={{ color: "#aaa" }}>Нет диалогов</p>
          )}
          {filtered.map((d) => {
            const isSelected = selected?.id === d.id;
            const cfg = CHANNEL_COLORS[d.channel];
            return (
              <button key={d.id} onClick={() => setSelected(d)}
                className="w-full text-left px-3 py-2.5 transition-colors hover:bg-gray-50"
                style={{ borderBottom: "1px solid #f5f5f5", background: isSelected ? "#e8f4fd" : "transparent" }}>
                <div className="flex items-center gap-3">
                  {/* Avatar with channel badge */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: cfg.bg + "cc" }}>
                      {getInitials(d.name)}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white border-2 border-white"
                      style={{ background: cfg.badge, fontSize: 7, fontWeight: 700 }}>
                      {cfg.label}
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium truncate" style={{ color: "#333" }}>{d.name}</span>
                      <span className="text-xs flex-shrink-0 ml-2" style={{ color: "#aaa" }}>{formatTime(d.lastTime)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs truncate" style={{ color: "#888" }}>{d.lastMessage || "..."}</p>
                      {(d.unreadCount ?? 0) > 0 && (
                        <span className="text-xs text-white rounded-full px-1.5 py-0.5 flex-shrink-0 ml-1"
                          style={{ background: cfg.badge, minWidth: 18, textAlign: "center", fontSize: 10 }}>
                          {d.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "#f5f5f5" }}>
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <MessageSquare size={40} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите диалог</p>
          </div>
        ) : selected.channel === "telegram" && selected.peer ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-2" style={{ background: "#fff", borderBottom: "1px solid #e4e4e4" }}>
              <div className="w-3 h-3 rounded-full" style={{ background: "#0088cc" }} />
              <span className="text-sm font-medium" style={{ color: "#333" }}>{selected.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#0088cc20", color: "#0088cc" }}>Telegram</span>
            </div>
            <div className="flex-1 min-h-0">
              <TelegramChat peer={selected.peer} compact />
            </div>
          </div>
        ) : selected.channel === "maks" && selected.chatId ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-2" style={{ background: "#fff", borderBottom: "1px solid #e4e4e4" }}>
              <div className="w-3 h-3 rounded-full" style={{ background: "#0067a5" }} />
              <span className="text-sm font-medium" style={{ color: "#333" }}>{selected.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#0067a520", color: "#0067a5" }}>МАКС</span>
            </div>
            <div className="flex-1 min-h-0">
              <MaxChat chatId={selected.chatId} compact />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

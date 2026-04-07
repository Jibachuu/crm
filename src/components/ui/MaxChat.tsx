"use client";

import { useState, useEffect, useRef } from "react";
import { Send, RefreshCw } from "lucide-react";

interface MaxMessage {
  body?: { mid?: string; seq?: number; text?: string };
  timestamp?: number;
  sender?: { name?: string; user_id?: number };
  message?: { mid?: string; text?: string; sender?: { name?: string } };
  // Flexible for different API response shapes
  mid?: string;
  text?: string;
}

export default function MaxChat({ chatId, compact = false }: { chatId: string; compact?: boolean }) {
  const [messages, setMessages] = useState<{ id: string; text: string; sender: string; date: string; isBot: boolean }[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/max?action=messages&chat_id=${chatId}&count=50`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Ошибка"); setLoading(false); return; }

      const msgs = (data.messages ?? []).map((m: MaxMessage) => ({
        id: m.body?.mid ?? m.mid ?? String(Math.random()),
        text: m.body?.text ?? m.text ?? m.message?.text ?? "",
        sender: m.sender?.name ?? m.message?.sender?.name ?? "?",
        date: m.timestamp ? new Date(m.timestamp * 1000).toISOString() : new Date().toISOString(),
        isBot: false,
      }));
      setMessages(msgs);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }

  useEffect(() => { if (chatId) loadMessages(); }, [chatId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Poll every 10s
  useEffect(() => {
    if (!chatId) return;
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, [chatId]);

  async function sendMessage() {
    if (!text.trim() || sending) return;
    setSending(true);
    const res = await fetch("/api/max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", chat_id: chatId, text: text.trim() }),
    });
    if (res.ok) {
      setText("");
      setTimeout(loadMessages, 500);
    } else {
      const data = await res.json();
      alert("Ошибка: " + (data.error ?? ""));
    }
    setSending(false);
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return time;
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + time;
  }

  if (error) return <div className="text-xs p-3 rounded" style={{ background: "#fdecea", color: "#c62828" }}>{error}</div>;

  return (
    <div className="flex flex-col" style={{ height: compact ? 400 : 500 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
        <span className="text-xs font-semibold" style={{ color: "#888" }}>МАКС · чат {chatId}</span>
        <button onClick={loadMessages} className="p-1 rounded hover:bg-gray-100"><RefreshCw size={12} style={{ color: "#888" }} /></button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ background: "#f8f9fa" }}>
        {loading && messages.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Загрузка...</p>}
        {!loading && messages.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Нет сообщений</p>}
        {messages.map((msg) => (
          <div key={msg.id} className="flex" style={{ justifyContent: msg.isBot ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "75%", padding: "6px 10px", borderRadius: 8,
              background: msg.isBot ? "#0067a5" : "#fff", color: msg.isBot ? "#fff" : "#333",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)", fontSize: 13,
            }}>
              {!msg.isBot && <p className="text-xs font-medium mb-0.5" style={{ color: "#0067a5" }}>{msg.sender}</p>}
              <p className="whitespace-pre-wrap">{msg.text}</p>
              <p className="text-xs mt-0.5" style={{ color: msg.isBot ? "rgba(255,255,255,0.6)" : "#aaa", textAlign: "right", fontSize: 10 }}>{formatTime(msg.date)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid #e4e4e4" }}>
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
          placeholder="Сообщение в МАКС..."
          className="flex-1 text-sm px-3 py-1.5 rounded-full focus:outline-none"
          style={{ border: "1px solid #e0e0e0", background: "#f5f5f5" }} />
        <button onClick={sendMessage} disabled={!text.trim() || sending}
          className="p-1.5 rounded-full disabled:opacity-40" style={{ background: "#0067a5" }}>
          <Send size={14} style={{ color: "#fff" }} />
        </button>
      </div>
    </div>
  );
}

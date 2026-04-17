"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, RefreshCw } from "lucide-react";

interface Msg {
  id: string;
  external_id?: string | null;
  direction: "inbound" | "outbound";
  text: string | null;
  sender_name?: string | null;
  sent_at: string;
  attachments?: unknown;
}

interface Props {
  channel: "vk" | "avito" | "whatsapp";
  chatId: string;
  chatLabel?: string;
  entityType?: string;
  entityId?: string;
  pollInterval?: number;
}

const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;

function linkify(text: string) {
  const parts = text.split(URL_REGEX);
  if (parts.length === 1) return text;
  return parts.map((p, i) => URL_REGEX.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", wordBreak: "break-all" }}>{p}</a>
    : p
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + time;
}

export default function ChannelChat({ channel, chatId, entityType, entityId, pollInterval = 10000 }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${channel}/messages?chat_id=${encodeURIComponent(chatId)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Ошибка"); return; }
      setMessages(data.messages ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [channel, chatId]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, pollInterval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load, pollInterval]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      const res = await fetch(`/api/${channel}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peer_id: chatId, text: body, entity_type: entityType, entity_id: entityId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert("Не отправлено: " + (data.error ?? "неизвестная ошибка"));
        setText(body);
      } else {
        await load();
      }
    } catch (e) {
      alert("Ошибка сети: " + String(e));
      setText(body);
    } finally {
      setSending(false);
    }
  }

  if (error) return <div className="text-xs p-3 rounded" style={{ background: "#fdecea", color: "#c62828" }}>{error}</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ background: "#f8f9fa" }}>
        {loading && messages.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Загрузка...</p>}
        {!loading && messages.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Нет сообщений</p>}
        {messages.map((m) => {
          const isMe = m.direction === "outbound";
          return (
            <div key={m.id} className="flex" style={{ justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "75%",
                padding: "8px 12px",
                borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                background: isMe ? "#0067a5" : "#fff",
                color: isMe ? "#fff" : "#333",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                fontSize: 13,
              }}>
                {!isMe && m.sender_name && <p className="text-xs font-medium mb-0.5" style={{ color: "#0067a5" }}>{m.sender_name}</p>}
                {m.text && <p className="whitespace-pre-wrap">{linkify(m.text)}</p>}
                <p className="text-xs mt-0.5 text-right" style={{ color: isMe ? "rgba(255,255,255,0.7)" : "#aaa", fontSize: 10 }}>
                  {formatTime(m.sent_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid #e4e4e4" }}>
        <button onClick={load} className="p-1.5 rounded hover:bg-slate-100" title="Обновить">
          <RefreshCw size={14} style={{ color: "#888" }} />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Сообщение..."
          rows={1}
          className="flex-1 text-sm px-3 py-1.5 rounded-2xl focus:outline-none resize-none"
          style={{ border: "1px solid #e0e0e0", background: "#f5f5f5", maxHeight: 120 }}
        />
        <button onClick={send} disabled={sending || !text.trim()} className="p-1.5 rounded-full disabled:opacity-40" style={{ background: "#0067a5" }}>
          <Send size={14} style={{ color: "#fff" }} />
        </button>
      </div>
    </div>
  );
}

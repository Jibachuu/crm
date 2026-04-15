"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Paperclip, Mic, MicOff, Download, FileText, Image, Music, Video, X } from "lucide-react";
import FileTemplatesPanel from "./FileTemplatesPanel";
import ImageLightbox from "./ImageLightbox";

interface TgMessage {
  id: number;
  text: string;
  date: number; // unix timestamp
  out: boolean;
  fromName: string | null;
  media: {
    type: "photo" | "document" | "voice" | "audio" | "video" | "sticker" | "webpage" | "unsupported";
    fileName: string | null;
    mimeType: string | null;
    duration: number | null;
    url?: string | null;
    title?: string | null;
    description?: string | null;
  } | null;
  reactions?: { emoji: string; count: number }[] | null;
  forwardedFrom?: { senderName: string | null; senderId?: string | null; date?: number } | null;
  replyTo?: { id: string } | null;
  read?: boolean | null;
}

interface Props {
  peer: string; // username or phone
  compact?: boolean; // inline in deal/contact vs fullscreen inbox
  pollInterval?: number; // ms, default 8000
  readOnly?: boolean; // hide input for channels
}

function formatMsgTime(unix: number) {
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDateSep(unix: number) {
  const d = new Date(unix * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function isSameDay(a: number, b: number) {
  const da = new Date(a * 1000);
  const db = new Date(b * 1000);
  return da.toDateString() === db.toDateString();
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;

function linkifyText(text: string) {
  const parts = text.split(URL_REGEX);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#0067a5", textDecoration: "underline", wordBreak: "break-all" }}>{part}</a>
    ) : part
  );
}

function MediaBubble({ media, peer, msgId, onLightbox }: { media: NonNullable<TgMessage["media"]>; peer: string; msgId: number; onLightbox?: (src: string) => void }) {
  const mediaUrl = `/api/telegram/media?peer=${encodeURIComponent(peer)}&msgId=${msgId}`;

  if (media.type === "photo") {
    return (
      <div className="mt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt="Фото"
          className="rounded-lg cursor-zoom-in hover:opacity-95"
          style={{ maxWidth: 360, maxHeight: 360, width: "auto", height: "auto", objectFit: "contain", display: "block" }}
          onClick={() => onLightbox?.(mediaUrl)}
        />
      </div>
    );
  }

  if (media.type === "voice") {
    return (
      <div className="mt-1 flex items-center gap-2">
        <Music size={14} style={{ flexShrink: 0, color: "#0067a5" }} />
        <audio controls src={mediaUrl} className="h-8 max-w-[200px]" style={{ outline: "none" }} />
        {media.duration && <span className="text-xs" style={{ color: "#888" }}>{formatDuration(media.duration)}</span>}
      </div>
    );
  }

  if (media.type === "audio") {
    return (
      <div className="mt-1 flex items-center gap-2">
        <Music size={14} style={{ color: "#0067a5" }} />
        <audio controls src={mediaUrl} className="h-8 max-w-[220px]" />
      </div>
    );
  }

  if (media.type === "video") {
    return (
      <div className="mt-1">
        <video controls src={mediaUrl} className="rounded-lg" style={{ maxWidth: 360, maxHeight: 360 }} />
      </div>
    );
  }

  if (media.type === "document") {
    return (
      <a href={mediaUrl} download={media.fileName ?? "file"} className="mt-1 flex items-center gap-2 hover:opacity-70">
        <FileText size={16} style={{ color: "#0067a5", flexShrink: 0 }} />
        <span className="text-sm" style={{ color: "#0067a5", textDecoration: "underline" }}>{media.fileName ?? "Файл"}</span>
        <Download size={13} style={{ color: "#aaa" }} />
      </a>
    );
  }

  if (media.type === "sticker") {
    return <span className="text-2xl mt-1 block">🎭 Стикер</span>;
  }

  if (media.type === "webpage" && media.url) {
    return (
      <a href={media.url} target="_blank" rel="noopener noreferrer"
        className="mt-1 block p-2 rounded" style={{ border: "1px solid #ddd", background: "#f9f9f9", maxWidth: 240 }}>
        {media.title && <p className="text-xs font-semibold" style={{ color: "#333" }}>{media.title}</p>}
        {media.description && <p className="text-xs" style={{ color: "#777" }}>{media.description}</p>}
        <p className="text-xs truncate mt-0.5" style={{ color: "#0067a5" }}>{media.url}</p>
      </a>
    );
  }

  return null;
}

export default function TelegramChat({ peer, compact = false, pollInterval = 8000, readOnly = false, entityType, entityId, phone }: Props & { entityType?: string; entityId?: string; phone?: string }) {
  const [messages, setMessages] = useState<TgMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Auto-resolve entity for sync when not provided (inbox context)
  const resolvedEntityRef = useRef<{ type: string; id: string } | null>(null);
  const resolvedRef = useRef(false);
  useEffect(() => {
    if (entityType && entityId) { resolvedEntityRef.current = { type: entityType, id: entityId }; resolvedRef.current = true; return; }
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    // Try to find contact by telegram_id, username, or phone
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      const orFilters = [`telegram_id.eq.${peer}`, `telegram_username.eq.${peer}`];
      if (phone) {
        const cleanPhone = phone.replace(/\D/g, "");
        if (cleanPhone.length >= 7) {
          const suffix = cleanPhone.slice(-10);
          orFilters.push(`phone.ilike.%${suffix}`, `phone_mobile.ilike.%${suffix}`);
        }
      }
      supabase.from("contacts").select("id").or(orFilters.join(",")).limit(1).then(({ data }) => {
        if (data?.[0]) resolvedEntityRef.current = { type: "contact", id: data[0].id };
      });
    }).catch(() => {});
  }, [peer, phone, entityType, entityId]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resolveAttemptedRef = useRef(false);

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/telegram/messages?peer=${encodeURIComponent(peer)}&limit=50`);
      const data = await res.json();
      if (data.error) {
        // If entity not found, try to resolve via add-contact with phone
        if (data.error.includes("Could not find") && !resolveAttemptedRef.current) {
          resolveAttemptedRef.current = true;
          if (phone) {
            try {
              await fetch("/api/telegram/add-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone }),
              });
              // Retry with phone as peer
              const retry = await fetch(`/api/telegram/messages?peer=${encodeURIComponent(phone)}&limit=50`);
              const retryData = await retry.json();
              if (!retryData.error) {
                const msgs = (retryData.messages as TgMessage[]).reverse();
                setMessages(msgs);
                setError(null);
                setLoading(false);
                return;
              }
            } catch { /* fall through */ }
          }
          setError("Не удалось найти пользователя в Telegram по ID. Telegram требует username или номер телефона для первого подключения. Добавьте @username или телефон в карточку контакта → Редактировать.");
          setLoading(false);
          return;
        }
        setError(data.error);
        return;
      }
      // Messages come newest-first from iterMessages, reverse to show oldest at top
      const msgs = (data.messages as TgMessage[]).reverse();
      setMessages(msgs);
      setError(null);
      // Sync to communications timeline (from entity card or auto-resolved from inbox)
      const syncEntity = resolvedEntityRef.current;
      if (syncEntity && msgs.length > 0) {
        fetch("/api/sync-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: msgs.map((m) => ({ id: m.id, text: m.text, isMe: m.out, sender: m.fromName, time: m.date })), channel: "telegram", entity_type: syncEntity.type, entity_id: syncEntity.id }),
        }).catch(() => {});
      }
    } catch {
      setError("Не удалось загрузить сообщения");
    } finally {
      setLoading(false);
    }
  }, [peer]);

  useEffect(() => {
    fetchMessages();
    pollTimerRef.current = setInterval(() => fetchMessages(true), pollInterval);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchMessages, pollInterval]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Track whether user is at bottom before new messages arrive
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 80;
      wasAtBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function sendMessage() {
    if (!text.trim() || sending) return;
    setSending(true);
    const body = text.trim();
    setText("");
    try {
      await fetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: peer, message: body }),
      });
      await fetchMessages(true);
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("peer", peer);
    await fetch("/api/telegram/upload", { method: "POST", body: fd });
    await fetchMessages(true);
    setUploading(false);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingTime(0);
      recordTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      alert("Нет доступа к микрофону");
    }
  }

  async function stopRecording() {
    if (!mediaRecorderRef.current) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setRecording(false);

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());

    mediaRecorderRef.current.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      setUploading(true);
      const fd = new FormData();
      fd.append("voice", blob, "voice.webm");
      fd.append("peer", peer);
      await fetch("/api/telegram/voice", { method: "POST", body: fd });
      await fetchMessages(true);
      setUploading(false);
    };
  }

  const height = compact ? 500 : "100%";

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: compact ? 200 : 300 }}>
        <div className="text-sm" style={{ color: "#aaa" }}>Загрузка сообщений...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2" style={{ height: compact ? 200 : 300 }}>
        <p className="text-sm" style={{ color: "#d32f2f" }}>{error}</p>
        <button onClick={() => fetchMessages()} className="text-xs underline" style={{ color: "#0067a5" }}>Повторить</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height, border: compact ? "1px solid #e4e4e4" : "none", borderRadius: compact ? 6 : 0, overflow: "hidden", background: "#fff" }}>
      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3" style={{ background: "#f5f5f5" }}>
        {messages.length === 0 && (
          <div className="text-center text-sm py-8" style={{ color: "#aaa" }}>Нет сообщений</div>
        )}
        {messages.map((msg, idx) => {
          const prev = messages[idx - 1];
          const showDateSep = !prev || !isSameDay(prev.date, msg.date);

          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="flex justify-center my-3">
                  <span className="text-xs px-3 py-1 rounded-full" style={{ background: "#e0e0e0", color: "#666" }}>
                    {formatDateSep(msg.date)}
                  </span>
                </div>
              )}
              <div className={`flex mb-1 ${msg.out ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[70%] px-3 py-2 rounded-2xl"
                  style={{
                    background: msg.out ? "#dcf8c6" : "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                    borderRadius: msg.out ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  }}
                >
                  {!msg.out && msg.fromName && (
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#0067a5" }}>{msg.fromName}</p>
                  )}
                  {msg.forwardedFrom && (
                    <div className="mb-1 pl-2 text-xs" style={{ borderLeft: "2px solid #0067a5", opacity: 0.85 }}>
                      <p className="text-xs italic" style={{ color: "#0067a5" }}>
                        ↪ Переслано{msg.forwardedFrom.senderName ? ` от ${msg.forwardedFrom.senderName}` : ""}
                      </p>
                    </div>
                  )}
                  {msg.media && <MediaBubble media={msg.media} peer={peer} msgId={msg.id} onLightbox={setLightbox} />}
                  {msg.text && (
                    <p className="text-sm whitespace-pre-wrap leading-snug" style={{ color: "#222" }}>{linkifyText(msg.text)}</p>
                  )}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {msg.reactions.map((r, ri) => (
                        <span key={ri} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs"
                          style={{ background: "#f0f0f0", color: "#555" }}>
                          <span style={{ fontSize: 12 }}>{r.emoji}</span>
                          {r.count > 1 && <span style={{ fontSize: 10 }}>{r.count}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={`flex items-center gap-1 mt-0.5 ${msg.out ? "justify-end" : "justify-start"}`}>
                    <span className="text-xs" style={{ color: "#aaa" }}>{formatMsgTime(msg.date)}</span>
                    {msg.out && (
                      <span className="text-xs" style={{ color: msg.read ? "#0067a5" : "#aaa" }} title={msg.read ? "Прочитано" : "Доставлено"}>
                        {msg.read ? "✓✓" : "✓"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      {(uploading || recording) && (
        <div className="px-4 py-1.5 text-xs flex items-center gap-2" style={{ background: "#e8f4fd", color: "#0067a5" }}>
          {recording ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Запись {formatDuration(recordingTime)} — нажмите ещё раз чтобы отправить
            </>
          ) : (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Отправка файла...
            </>
          )}
        </div>
      )}

      {/* Input bar */}
      {readOnly ? (
        <div className="flex items-center justify-center px-3 py-3" style={{ borderTop: "1px solid #e4e4e4", background: "#fafafa" }}>
          <span className="text-xs" style={{ color: "#aaa" }}>Это канал — отправка сообщений недоступна</span>
        </div>
      ) : (
      <div className="flex items-center gap-2 px-3 py-2 relative" style={{ borderTop: "1px solid #e4e4e4", background: "#fff" }}>
        {/* File templates */}
        <FileTemplatesPanel onInsert={(files) => {
          for (const f of files) {
            fetch(f.url).then((r) => r.blob()).then((blob) => {
              const file = new File([blob], f.name, { type: f.type || "application/octet-stream" });
              sendFile(file);
            }).catch(() => {});
          }
        }} />
        {/* File picker */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || recording}
          className="p-1.5 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-40"
          title="Прикрепить файл"
        >
          <Paperclip size={18} style={{ color: "#888" }} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={async (e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) await sendFile(files[i]); } e.target.value = ""; }}
        />

        {/* Text input */}
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.startsWith("image/")) {
                const file = items[i].getAsFile();
                if (file) { e.preventDefault(); sendFile(file); return; }
              }
            }
          }}
          placeholder="Введите сообщение..."
          disabled={recording || uploading}
          rows={1}
          className="flex-1 text-sm px-3 py-2 focus:outline-none rounded-2xl resize-none"
          style={{ border: "1px solid #e0e0e0", background: "#f5f5f5", maxHeight: 120 }}
        />

        {/* Send or mic */}
        {text.trim() ? (
          <button
            onClick={sendMessage}
            disabled={sending || uploading}
            className="p-2 rounded-full transition-colors disabled:opacity-40"
            style={{ background: "#0067a5" }}
            title="Отправить"
          >
            <Send size={16} style={{ color: "#fff" }} />
          </button>
        ) : (
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
            className="p-2 rounded-full transition-colors disabled:opacity-40"
            style={{ background: recording ? "#d32f2f" : "#0067a5" }}
            title={recording ? "Остановить запись" : "Записать голосовое"}
          >
            {recording ? <MicOff size={16} style={{ color: "#fff" }} /> : <Mic size={16} style={{ color: "#fff" }} />}
          </button>
        )}
      </div>
      )}

      {/* Hidden media icons used by MediaBubble - keeps lucide from tree-shaking */}
      <span className="hidden"><Image size={1} /><Video size={1} /><X size={1} /></span>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

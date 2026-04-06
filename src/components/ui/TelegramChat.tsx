"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Paperclip, Mic, MicOff, Download, FileText, Image, Music, Video, X } from "lucide-react";

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
}

interface Props {
  peer: string; // username or phone
  compact?: boolean; // inline in deal/contact vs fullscreen inbox
  pollInterval?: number; // ms, default 8000
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

function MediaBubble({ media, peer, msgId }: { media: NonNullable<TgMessage["media"]>; peer: string; msgId: number }) {
  const mediaUrl = `/api/telegram/media?peer=${encodeURIComponent(peer)}&msgId=${msgId}`;

  if (media.type === "photo") {
    return (
      <div className="mt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt="Фото"
          className="max-w-[240px] rounded-lg cursor-pointer"
          style={{ maxHeight: 200, objectFit: "cover" }}
          onClick={() => window.open(mediaUrl, "_blank")}
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
        <video controls src={mediaUrl} className="max-w-[240px] rounded-lg" style={{ maxHeight: 200 }} />
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

export default function TelegramChat({ peer, compact = false, pollInterval = 8000 }: Props) {
  const [messages, setMessages] = useState<TgMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/telegram/messages?peer=${encodeURIComponent(peer)}&limit=50`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      // Messages come newest-first from iterMessages, reverse to show oldest at top
      setMessages((data.messages as TgMessage[]).reverse());
      setError(null);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const height = compact ? 360 : "100%";

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
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ background: "#f5f5f5" }}>
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
                  {msg.media && <MediaBubble media={msg.media} peer={peer} msgId={msg.id} />}
                  {msg.text && (
                    <p className="text-sm whitespace-pre-wrap leading-snug" style={{ color: "#222" }}>{msg.text}</p>
                  )}
                  <div className={`flex items-center gap-1 mt-0.5 ${msg.out ? "justify-end" : "justify-start"}`}>
                    <span className="text-xs" style={{ color: "#aaa" }}>{formatMsgTime(msg.date)}</span>
                    {msg.out && <span className="text-xs" style={{ color: "#4caf50" }}>✓✓</span>}
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
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid #e4e4e4", background: "#fff" }}>
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
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }}
        />

        {/* Text input */}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Введите сообщение..."
          disabled={recording || uploading}
          className="flex-1 text-sm px-3 py-2 focus:outline-none rounded-full"
          style={{ border: "1px solid #e0e0e0", background: "#f5f5f5" }}
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

      {/* Hidden media icons used by MediaBubble - keeps lucide from tree-shaking */}
      <span className="hidden"><Image size={1} /><Video size={1} /><X size={1} /></span>
    </div>
  );
}

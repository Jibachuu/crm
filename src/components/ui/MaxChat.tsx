"use client";

import { useState, useEffect, useRef } from "react";
import { Send, RefreshCw, Paperclip, Mic, MicOff } from "lucide-react";
import FileTemplatesPanel from "./FileTemplatesPanel";
import ImageLightbox from "./ImageLightbox";

export default function MaxChat({ chatId, compact = false, entityType, entityId }: { chatId: string; compact?: boolean; entityType?: string; entityId?: string }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [messages, setMessages] = useState<{ id: string; text: string; sender: string; senderId?: number; time: number; isMe: boolean; attaches?: any[]; chatId?: string; reactions?: { emoji: string; count: number }[]; forwardedFrom?: { senderName?: string; text?: string } | null; replyTo?: { id: string; senderName?: string; text?: string } | null; read?: boolean | null }[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [myId, setMyId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/max?action=status").then(r => r.json()).then(d => setMyId(d.userId)).catch(() => {});
  }, []);

  const loadingDoneRef = useRef(false);

  async function refreshAndLoad() {
    await fetch("/api/max?action=refresh").catch(() => {});
    await loadMessages();
  }

  async function loadMessages() {
    setError("");
    try {
      const res = await fetch(`/api/max?action=messages&chat_id=${chatId}&count=50`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Ошибка"); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgs = (data.messages ?? []).map((m: any) => ({
        ...m,
        isMe: myId ? (Number(m.senderId) === Number(myId)) : false,
      }));
      // Only update state if messages actually changed
      const newIds = msgs.map((m: { id: string }) => m.id).join(",");
      const oldIds = messages.map((m) => m.id).join(",");
      if (newIds !== oldIds) {
        setMessages(msgs);
        // Sync to communications timeline
        if (entityType && entityId && msgs.length > 0) {
          fetch("/api/sync-messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: msgs, channel: "maks", entity_type: entityType, entity_id: entityId }),
          }).catch(() => {});
        }
      }
    } catch (e) { setError(String(e)); }
    if (!loadingDoneRef.current) { setLoading(false); loadingDoneRef.current = true; }
  }

  useEffect(() => { if (chatId && myId !== null) refreshAndLoad(); }, [chatId, myId]);
  // Only scroll when last message ID changes (truly new message)
  const lastMsgIdRef = useRef("");
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? "";
    if (lastId && lastId !== lastMsgIdRef.current) {
      lastMsgIdRef.current = lastId;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);
  useEffect(() => {
    if (!chatId) return;
    const interval = setInterval(refreshAndLoad, 15000);
    return () => clearInterval(interval);
  }, [chatId, myId]);

  async function sendMessage() {
    if (!text.trim() || sending) return;
    setSending(true);
    const res = await fetch("/api/max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", chat_id: chatId, text: text.trim() }),
    });
    if (res.ok) { setText(""); setTimeout(loadMessages, 1000); }
    else { const data = await res.json(); alert("Ошибка: " + (data.error ?? "")); }
    setSending(false);
  }

  // Upload file natively to MAX servers
  async function sendFile(file: File) {
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      // Upload to MAX via VPS proxy
      const uploadRes = await fetch(`/api/max`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upload", chat_id: chatId, fileName: file.name, fileType: file.type, fileBase64: arrayBufferToBase64(buffer) }),
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const data = await uploadRes.json();
      if (data.ok) {
        setTimeout(loadMessages, 1000);
      } else {
        throw new Error(data.error ?? "Upload failed");
      }
    } catch (e) {
      alert("Ошибка загрузки: " + (e instanceof Error ? e.message : ""));
    }
    setUploading(false);
  }

  function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  // Voice recording
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: "audio/webm" });
        await sendFile(file);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch { alert("Не удалось получить доступ к микрофону"); }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function formatTime(ts: number) {
    if (!ts) return "";
    const d = new Date(ts > 9999999999 ? ts : ts * 1000);
    const now = new Date();
    const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return time;
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + time;
  }

  function formatDuration(secs: number) {
    return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;
  }

  if (error) return <div className="text-xs p-3 rounded" style={{ background: "#fdecea", color: "#c62828" }}>{error}</div>;

  return (
    <div className="flex flex-col" style={{ height: compact ? 400 : "100%" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
        <span className="text-xs font-semibold" style={{ color: "#888" }}>МАКС</span>
        <button onClick={refreshAndLoad} className="p-1 rounded hover:bg-gray-100" title="Обновить"><RefreshCw size={12} style={{ color: "#888" }} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ background: "#f8f9fa" }}>
        {loading && messages.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Загрузка...</p>}
        {!loading && messages.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Отправьте первое сообщение</p>}
        {messages.map((msg) => (
          <div key={msg.id} className="flex" style={{ justifyContent: msg.isMe ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "75%", padding: "8px 12px",
              borderRadius: msg.isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: msg.isMe ? "#0067a5" : "#fff",
              color: msg.isMe ? "#fff" : "#333",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)", fontSize: 13,
            }}>
              {!msg.isMe && <p className="text-xs font-medium mb-0.5" style={{ color: "#0067a5" }}>{msg.sender}</p>}

              {/* Forwarded badge */}
              {msg.forwardedFrom && (
                <div className="mb-1 pl-2 text-xs" style={{ borderLeft: `2px solid ${msg.isMe ? "rgba(255,255,255,0.5)" : "#0067a5"}`, opacity: 0.85 }}>
                  <p className="text-xs italic">↪ Переслано{msg.forwardedFrom.senderName ? ` от ${msg.forwardedFrom.senderName}` : ""}</p>
                </div>
              )}

              {/* Reply quote */}
              {msg.replyTo && (
                <div className="mb-1 pl-2 py-1 rounded text-xs" style={{ borderLeft: `2px solid ${msg.isMe ? "rgba(255,255,255,0.5)" : "#0067a5"}`, background: msg.isMe ? "rgba(255,255,255,0.1)" : "#f0f7ff" }}>
                  {msg.replyTo.senderName && <p className="font-medium" style={{ color: msg.isMe ? "rgba(255,255,255,0.85)" : "#0067a5" }}>{msg.replyTo.senderName}</p>}
                  {msg.replyTo.text && <p className="truncate" style={{ maxWidth: 200, opacity: 0.85 }}>{msg.replyTo.text}</p>}
                </div>
              )}

              {/* Attachments */}
              {msg.attaches?.map((a: { type: string; name?: string; size?: number; url?: string; preview?: string; duration?: number; fileId?: number }, ai: number) => {
                const photoSrc = a.preview || a.url || null;
                const photoFull = a.url || a.preview || null;
                return (
                <div key={ai} className="mb-1">
                  {a.type === "PHOTO" || a.type === "IMAGE" || a.type === "STICKER" ? (
                    photoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoSrc}
                        alt={a.name || ""}
                        onClick={() => photoFull && setLightbox(photoFull)}
                        className="rounded cursor-zoom-in hover:opacity-95"
                        style={{ maxWidth: 360, maxHeight: 360, width: "auto", height: "auto", objectFit: "contain", display: "block" }}
                      />
                    ) : <span className="text-xs">🖼 Фото</span>
                  ) : a.type === "AUDIO" ? (
                    <div>
                      <div className="flex items-center gap-1 text-xs mb-1">🎤 Голосовое{a.duration ? ` (${Math.round(a.duration/1000)}с)` : ""}</div>
                      {(a.url || a.fileId) && <audio controls src={a.fileId ? `/api/max?action=download&file_id=${a.fileId}&chat_id=${chatId}&message_id=${msg.id}` : a.url} className="w-full" style={{ maxWidth: 250, height: 36 }} />}
                    </div>
                  ) : a.type === "FILE" ? (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:opacity-80"
                      style={{ background: msg.isMe ? "rgba(255,255,255,0.15)" : "#f0f0f0" }}
                      onClick={() => {
                        const url = `/api/max?action=download&file_id=${a.fileId}&chat_id=${chatId}&message_id=${msg.id}`;
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = a.name || "file";
                        link.click();
                      }}>
                      <span className="text-lg">📄</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{a.name || "Файл"}</p>
                        {a.size && <p className="text-xs" style={{ color: msg.isMe ? "rgba(255,255,255,0.6)" : "#aaa" }}>{a.size > 1048576 ? (a.size / 1048576).toFixed(1) + " МБ" : (a.size / 1024).toFixed(0) + " КБ"}</p>}
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: msg.isMe ? "rgba(255,255,255,0.2)" : "#e8f4fd", color: msg.isMe ? "#fff" : "#0067a5" }}>
                        Скачать
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs italic">📎 {a.type}: {a.name || "вложение"}</p>
                  )}
                </div>
                );
              })}
              {/* Text */}
              {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
              {/* Empty message without attaches */}
              {!msg.text && (!msg.attaches || msg.attaches.length === 0) && !msg.forwardedFrom && !msg.replyTo && (
                <p className="text-xs italic" style={{ color: msg.isMe ? "rgba(255,255,255,0.7)" : "#888" }}>📎 Вложение</p>
              )}

              {/* Reactions */}
              {msg.reactions && msg.reactions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {msg.reactions.map((r, ri) => (
                    <span key={ri} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs"
                      style={{ background: msg.isMe ? "rgba(255,255,255,0.18)" : "#f0f0f0", color: msg.isMe ? "#fff" : "#555" }}>
                      <span style={{ fontSize: 12 }}>{r.emoji}</span>
                      {r.count > 1 && <span style={{ fontSize: 10 }}>{r.count}</span>}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-1 mt-0.5">
                <span className="text-xs" style={{ color: msg.isMe ? "rgba(255,255,255,0.6)" : "#aaa", fontSize: 10 }}>{formatTime(msg.time)}</span>
                {msg.isMe && (
                  <span className="text-xs" style={{ color: msg.read ? (msg.isMe ? "#a0d0ff" : "#0067a5") : (msg.isMe ? "rgba(255,255,255,0.55)" : "#aaa"), fontSize: 10 }} title={msg.read ? "Прочитано" : "Доставлено"}>
                    {msg.read ? "✓✓" : "✓"}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Recording indicator */}
      {recording && (
        <div className="flex items-center gap-3 px-4 py-2" style={{ background: "#fff3f3", borderTop: "1px solid #ffcdd2" }}>
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: "#d32f2f" }} />
          <span className="text-xs font-medium" style={{ color: "#d32f2f" }}>Запись {formatDuration(recordingTime)}</span>
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 relative" style={{ borderTop: "1px solid #e4e4e4" }}>
        <FileTemplatesPanel onInsert={(files) => {
          for (const f of files) {
            fetch(f.url).then((r) => r.blob()).then((blob) => {
              const file = new File([blob], f.name, { type: f.type || "application/octet-stream" });
              sendFile(file);
            }).catch(() => {});
          }
        }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading || recording}
          className="p-1.5 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-40">
          <Paperclip size={16} style={{ color: "#888" }} />
        </button>
        <input ref={fileRef} type="file" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }} />

        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
          placeholder={uploading ? "Загрузка..." : "Сообщение в МАКС..."}
          disabled={recording || uploading}
          className="flex-1 text-sm px-3 py-1.5 rounded-full focus:outline-none"
          style={{ border: "1px solid #e0e0e0", background: "#f5f5f5" }} />

        {text.trim() ? (
          <button onClick={sendMessage} disabled={sending}
            className="p-1.5 rounded-full disabled:opacity-40" style={{ background: "#0067a5" }}>
            <Send size={14} style={{ color: "#fff" }} />
          </button>
        ) : (
          <button onClick={recording ? stopRecording : startRecording} disabled={uploading}
            className="p-1.5 rounded-full disabled:opacity-40"
            style={{ background: recording ? "#d32f2f" : "#0067a5" }}>
            {recording ? <MicOff size={14} style={{ color: "#fff" }} /> : <Mic size={14} style={{ color: "#fff" }} />}
          </button>
        )}
      </div>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

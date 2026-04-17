"use client";

import { useState, useEffect, useRef } from "react";
import { Send, RefreshCw, Paperclip, Mic, MicOff, MoreVertical, Pencil, Trash2, Check } from "lucide-react";
import FileTemplatesPanel from "./FileTemplatesPanel";
import ImageLightbox from "./ImageLightbox";

const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;

function linkifyText(text: string) {
  const parts = text.split(URL_REGEX);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", wordBreak: "break-all" }}>{part}</a>
    ) : part
  );
}

export default function MaxChat({ chatId, compact = false, entityType, entityId, phone }: { chatId: string; compact?: boolean; entityType?: string; entityId?: string; phone?: string; }) {
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-resolve entity for sync when not provided (inbox context)
  const resolvedEntityRef = useRef<{ type: string; id: string } | null>(null);
  const resolvedRef = useRef(false);
  useEffect(() => {
    if (entityType && entityId) { resolvedEntityRef.current = { type: entityType, id: entityId }; resolvedRef.current = true; return; }
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      const orFilters = [`maks_id.eq.${chatId}`];
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
  }, [chatId, phone, entityType, entityId]);

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
      const res = await fetch(`/api/max?action=messages&chat_id=${chatId}&count=100`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Ошибка"); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgs = (data.messages ?? []).map((m: any) => ({
        ...m,
        isMe: myId ? (Number(m.senderId) === Number(myId)) : false,
      }));
      setHasMore(msgs.length >= 100);
      // Only update state if messages actually changed
      const newIds = msgs.map((m: { id: string }) => m.id).join(",");
      const oldIds = messages.map((m) => m.id).join(",");
      if (newIds !== oldIds) {
        setMessages(msgs);
        // Sync to communications timeline (from entity card or auto-resolved from inbox)
        const syncEntity = resolvedEntityRef.current;
        if (syncEntity && msgs.length > 0) {
          fetch("/api/sync-messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: msgs, channel: "maks", entity_type: syncEntity.type, entity_id: syncEntity.id }),
          }).catch(() => {});
        }
      }
    } catch (e) { setError(String(e)); }
    if (!loadingDoneRef.current) { setLoading(false); loadingDoneRef.current = true; }
  }

  async function loadOlderMessages() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/max?action=messages&chat_id=${chatId}&count=100&offset=${messages.length}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const older = (data.messages ?? []).map((m: any) => ({
          ...m,
          isMe: myId ? (Number(m.senderId) === Number(myId)) : false,
        }));
        if (older.length < 100) setHasMore(false);
        if (older.length > 0) {
          // Prepend older messages, dedup by id
          const existingIds = new Set(messages.map((m) => m.id));
          const newOlder = older.filter((m: { id: string }) => !existingIds.has(m.id));
          setMessages((prev) => [...newOlder, ...prev]);
        }
      }
    } catch { /* skip */ }
    setLoadingMore(false);
  }

  useEffect(() => { if (chatId && myId !== null) refreshAndLoad(); }, [chatId, myId]);
  const lastMsgIdRef = useRef("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const [showJumpBtn, setShowJumpBtn] = useState(false);

  const isNearBottom = () => {
    const c = scrollContainerRef.current;
    if (!c) return true;
    return c.scrollHeight - c.scrollTop - c.clientHeight < 150;
  };

  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;
    const onScroll = () => setShowJumpBtn(!isNearBottom());
    c.addEventListener("scroll", onScroll, { passive: true });
    return () => c.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastId = messages[messages.length - 1]?.id ?? "";
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      lastMsgIdRef.current = lastId;
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      return;
    }
    if (lastId === lastMsgIdRef.current) return;
    const wasAtBottom = isNearBottom();
    lastMsgIdRef.current = lastId;
    if (wasAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const jumpToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  async function saveEdit() {
    if (!editingId) return;
    const newText = editingText.trim();
    if (!newText) return;
    const id = editingId;
    setEditingId(null);
    try {
      const res = await fetch("/api/max", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit_message", chat_id: chatId, message_id: id, text: newText }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert("Не удалось отредактировать: " + (data.error ?? "неизвестная ошибка"));
        return;
      }
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, text: newText } : m));
      setTimeout(loadMessages, 800);
    } catch (e) {
      alert("Ошибка сети: " + String(e));
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm("Удалить сообщение? Оно будет удалено у обеих сторон.")) return;
    setOpenMenuId(null);
    try {
      const res = await fetch("/api/max", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_message", chat_id: chatId, message_id: id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert("Не удалось удалить: " + (data.error ?? "неизвестная ошибка"));
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      alert("Ошибка сети: " + String(e));
    }
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
    <div className="flex flex-col relative" style={{ height: compact ? 500 : "100%" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
        <span className="text-xs font-semibold" style={{ color: "#888" }}>МАКС</span>
        <button onClick={refreshAndLoad} className="p-1 rounded hover:bg-gray-100" title="Обновить"><RefreshCw size={12} style={{ color: "#888" }} /></button>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ background: "#f8f9fa" }}>
        {loading && messages.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Загрузка...</p>}
        {!loading && messages.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Отправьте первое сообщение</p>}
        {!loading && hasMore && messages.length > 0 && (
          <div className="text-center py-2">
            <button onClick={loadOlderMessages} disabled={loadingMore}
              className="text-xs px-3 py-1.5 rounded hover:bg-white disabled:opacity-50"
              style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}>
              {loadingMore ? "Загрузка..." : "Загрузить ещё"}
            </button>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex group" style={{ justifyContent: msg.isMe ? "flex-end" : "flex-start" }}>
            <div className="relative" style={{
              maxWidth: "75%", padding: "8px 12px",
              borderRadius: msg.isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: msg.isMe ? "#0067a5" : "#fff",
              color: msg.isMe ? "#fff" : "#333",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)", fontSize: 13,
            }}>
              {msg.isMe && editingId !== msg.id && (
                <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity" style={{ top: 2, right: -24 }}>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === msg.id ? null : msg.id)}
                    className="p-1 rounded hover:bg-slate-200"
                    style={{ background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
                    title="Действия"
                  >
                    <MoreVertical size={12} style={{ color: "#666" }} />
                  </button>
                  {openMenuId === msg.id && (
                    <div
                      className="absolute right-0 mt-1 py-1 rounded shadow-md"
                      style={{ background: "#fff", border: "1px solid #e0e0e0", zIndex: 20, minWidth: 140 }}
                      onMouseLeave={() => setOpenMenuId(null)}
                    >
                      <button
                        onClick={() => { setEditingId(msg.id); setEditingText(msg.text); setOpenMenuId(null); }}
                        className="w-full text-left text-xs px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
                        style={{ color: "#333" }}
                      >
                        <Pencil size={11} /> Редактировать
                      </button>
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        className="w-full text-left text-xs px-3 py-1.5 hover:bg-red-50 flex items-center gap-2"
                        style={{ color: "#c62828" }}
                      >
                        <Trash2 size={11} /> Удалить
                      </button>
                    </div>
                  )}
                </div>
              )}
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
              {/* Text or edit mode */}
              {editingId === msg.id ? (
                <div>
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                      if (e.key === "Escape") { setEditingId(null); }
                    }}
                    className="w-full text-sm resize-none focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.15)", color: msg.isMe ? "#fff" : "#222", minHeight: 40, border: "1px solid rgba(255,255,255,0.3)", borderRadius: 4, padding: 4 }}
                    autoFocus
                  />
                  <div className="flex gap-1 mt-1 justify-end">
                    <button onClick={() => setEditingId(null)} className="text-xs px-2 py-0.5 rounded" style={{ color: msg.isMe ? "rgba(255,255,255,0.8)" : "#666" }}>Отмена</button>
                    <button onClick={saveEdit} className="text-xs px-2 py-0.5 rounded flex items-center gap-1" style={{ background: msg.isMe ? "#fff" : "#0067a5", color: msg.isMe ? "#0067a5" : "#fff" }}>
                      <Check size={10} /> Сохранить
                    </button>
                  </div>
                </div>
              ) : msg.text && <p className="whitespace-pre-wrap">{linkifyText(msg.text)}</p>}
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

      {showJumpBtn && (
        <button
          onClick={jumpToBottom}
          className="absolute right-4 rounded-full shadow-md flex items-center justify-center"
          style={{ bottom: 80, width: 36, height: 36, background: "#0067a5", color: "#fff", zIndex: 5 }}
          title="К новым сообщениям"
        >
          ↓
        </button>
      )}

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
        <input ref={fileRef} type="file" className="hidden" multiple
          onChange={async (e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) await sendFile(files[i]); } e.target.value = ""; }} />

        <textarea value={text} onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
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
          placeholder={uploading ? "Загрузка..." : "Сообщение в МАКС..."}
          disabled={recording || uploading}
          rows={1}
          className="flex-1 text-sm px-3 py-1.5 rounded-2xl focus:outline-none resize-none"
          style={{ border: "1px solid #e0e0e0", background: "#f5f5f5", maxHeight: 120 }} />

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

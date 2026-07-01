"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Paperclip, Mic, MicOff, Edit2, Trash2, Check, X } from "lucide-react";
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
  // Inline edit/delete on own MAX messages. Verified opcodes 67/66
  // through /opt/max-proxy /probe; backed by /api/max edit_message /
  // delete_message actions.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  async function deleteMessage(id: string, forMe: boolean) {
    if (!confirm(forMe ? "Удалить только у себя?" : "Удалить у всех? (24-часовое окно MAX)")) return;
    const res = await fetch("/api/max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_message", chat_id: chatId, message_id: id, for_me: forMe }),
    });
    const data = await res.json();
    if (data.error) { alert("Не удалось удалить: " + data.error); return; }
    setMessages((p) => p.filter((m) => m.id !== id));
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) { alert("Текст не должен быть пустым"); return; }
    const res = await fetch("/api/max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit_message", chat_id: chatId, message_id: id, text: editText }),
    });
    const data = await res.json();
    if (data.error) { alert("Не удалось отредактировать: " + data.error); return; }
    setMessages((p) => p.map((m) => m.id === id ? { ...m, text: editText } : m));
    setEditingId(null);
    setEditText("");
  }
  const [hasMore, setHasMore] = useState(true);
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
  // Only scroll when last message ID changes AND user was at bottom
  const lastMsgIdRef = useRef("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

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
    const lastId = messages[messages.length - 1]?.id ?? "";
    if (lastId && lastId !== lastMsgIdRef.current) {
      lastMsgIdRef.current = lastId;
      // Recompute position right now — scroll event may not have fired yet
      const container = scrollContainerRef.current;
      if (!container) return;
      const threshold = 80;
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      if (atBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
      // Backlog v6 §5.5 — file.name пустое при вставке скриншота из
      // clipboard (Ctrl+V на Windows), и file.type иногда пуст у
      // голосовых/нестандартных файлов. Синтезируем имя из MIME, чтобы
      // на VPS прокси ушло читаемое расширение — иначе клиент видит
      // вложение без расширения и не может его открыть.
      const mime = file.type || "application/octet-stream";
      const ext = (mime.split("/")[1] || "bin").replace("jpeg", "jpg").split(";")[0];
      const safeName = file.name?.trim() || `image_${Date.now()}.${ext}`;
      // Upload to MAX via VPS proxy
      const uploadRes = await fetch(`/api/max`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upload", chat_id: chatId, fileName: safeName, fileType: mime, fileBase64: arrayBufferToBase64(buffer) }),
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

  // Внутренний render — R1 (2026-07-01): пузыри как в TG-Web (тёмная тема),
  // группировка и хвостики через inbox-theme.css. Компактный режим
  // (внутри карточки контакта/сделки) держит высоту 500px, полный
  // (в /inbox) — 100% доступной. См. [[inbox-theme]].
  return (
    <div className="inbox-scope" style={{ display: "flex", flexDirection: "column", height: compact ? 500 : "100%", background: "var(--tg-bg)" }}>
      <div ref={scrollContainerRef} className="inbox-messages" style={{ padding: "0 12px" }}>
        <div className="inbox-messages-inner">
          {loading && messages.length === 0 && <div style={{ margin: "auto", color: "var(--tg-text-secondary)", fontSize: 13 }}>Загрузка...</div>}
          {!loading && messages.length === 0 && <div style={{ margin: "auto", color: "var(--tg-text-secondary)", fontSize: 13 }}>Отправьте первое сообщение</div>}
          {!loading && hasMore && messages.length > 0 && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <button
                onClick={loadOlderMessages}
                disabled={loadingMore}
                style={{
                  fontSize: 12, padding: "6px 14px", borderRadius: 14,
                  background: "var(--tg-bg-panel)", color: "var(--tg-accent)",
                  border: "1px solid transparent", cursor: loadingMore ? "default" : "pointer",
                  opacity: loadingMore ? 0.5 : 1,
                }}
              >
                {loadingMore ? "Загрузка..." : "Загрузить ещё"}
              </button>
            </div>
          )}

          {messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const next = idx < messages.length - 1 ? messages[idx + 1] : null;
            const sameSenderAsPrev = prev && prev.isMe === msg.isMe;
            const sameSenderAsNext = next && next.isMe === msg.isMe;
            const closeToPrev = prev && Math.abs(msg.time - prev.time) < 5 * 60;
            const closeToNext = next && Math.abs(next.time - msg.time) < 5 * 60;
            const isFirstOfGroup = !prev || !sameSenderAsPrev || !closeToPrev;
            const isLastOfGroup = !next || !sameSenderAsNext || !closeToNext;
            const needsDateSep = !prev || new Date(prev.time * 1000).toDateString() !== new Date(msg.time * 1000).toDateString();

            return (
              <div key={msg.id}>
                {needsDateSep && (() => {
                  const d = new Date(msg.time * 1000);
                  const today = new Date();
                  const yest = new Date(today); yest.setDate(today.getDate() - 1);
                  let label = "";
                  if (d.toDateString() === today.toDateString()) label = "Сегодня";
                  else if (d.toDateString() === yest.toDateString()) label = "Вчера";
                  else label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
                  return <div className="inbox-date-sticker">{label}</div>;
                })()}
                <div
                  className={`inbox-msg-row ${msg.isMe ? "is-own" : ""} ${isFirstOfGroup ? "first-of-group" : ""}`}
                  onMouseEnter={() => setHoveredId(msg.id)}
                  onMouseLeave={() => setHoveredId((p) => p === msg.id ? null : p)}
                >
                  {msg.isMe && hoveredId === msg.id && editingId !== msg.id && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 6, alignSelf: "center" }}>
                      {msg.text && (
                        <button
                          onClick={() => { setEditingId(msg.id); setEditText(msg.text); }}
                          className="inbox-sidebar-btn"
                          style={{ width: 26, height: 26, background: "var(--tg-bg-panel)" }}
                          title="Редактировать"
                        >
                          <Edit2 size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteMessage(msg.id, false)}
                        className="inbox-sidebar-btn"
                        style={{ width: 26, height: 26, background: "var(--tg-bg-panel)", color: "#e57373" }}
                        title="Удалить у всех"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}

                  <div className={`inbox-msg-bubble ${isLastOfGroup ? "has-tail" : ""}`}>
                    {!msg.isMe && isFirstOfGroup && msg.sender && <div className="inbox-msg-sender">{msg.sender}</div>}

                    {msg.forwardedFrom && (
                      <div className="inbox-msg-forwarded">↪ Переслано{msg.forwardedFrom.senderName ? ` от ${msg.forwardedFrom.senderName}` : ""}</div>
                    )}

                    {msg.replyTo && (
                      <div className="inbox-msg-reply">
                        {msg.replyTo.senderName && <div className="inbox-msg-reply-name">{msg.replyTo.senderName}</div>}
                        {msg.replyTo.text && <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.replyTo.text}</div>}
                      </div>
                    )}

                    {msg.attaches?.map((a: { type: string; name?: string; size?: number; url?: string; preview?: string; duration?: number; fileId?: number }, ai: number) => {
                      const photoSrc = a.preview || a.url || null;
                      const photoFull = a.url || a.preview || null;
                      return (
                        <div key={ai} style={{ marginBottom: 4 }}>
                          {a.type === "PHOTO" || a.type === "IMAGE" || a.type === "STICKER" ? (
                            photoSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={photoSrc}
                                alt={a.name || ""}
                                onClick={() => photoFull && setLightbox(photoFull)}
                                className="inbox-msg-media-image"
                              />
                            ) : <span style={{ fontSize: 12 }}>🖼 Фото</span>
                          ) : a.type === "AUDIO" ? (
                            <div>
                              <div style={{ fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>🎤 Голосовое{a.duration ? ` (${Math.round(a.duration/1000)}с)` : ""}</div>
                              {(a.url || a.fileId) && <audio controls src={a.fileId ? `/api/max?action=download&file_id=${a.fileId}&chat_id=${chatId}&message_id=${msg.id}` : a.url} style={{ maxWidth: 250, height: 36, width: "100%" }} />}
                            </div>
                          ) : a.type === "FILE" ? (
                            <div
                              style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "6px 8px", borderRadius: 8, cursor: "pointer",
                                background: "rgba(255,255,255,0.06)",
                              }}
                              onClick={() => {
                                const url = `/api/max?action=download&file_id=${a.fileId}&chat_id=${chatId}&message_id=${msg.id}`;
                                const link = document.createElement("a");
                                link.href = url;
                                link.download = a.name || "file";
                                link.click();
                              }}
                            >
                              <span style={{ fontSize: 18 }}>📄</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name || "Файл"}</div>
                                {a.size && <div style={{ fontSize: 11, opacity: 0.7 }}>{a.size > 1048576 ? (a.size / 1048576).toFixed(1) + " МБ" : (a.size / 1024).toFixed(0) + " КБ"}</div>}
                              </div>
                            </div>
                          ) : (
                            (a.url || a.fileId) ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <audio
                                  controls
                                  src={a.fileId ? `/api/max?action=download&file_id=${a.fileId}&chat_id=${chatId}&message_id=${msg.id}` : a.url}
                                  style={{ maxWidth: 250, height: 36, width: "100%" }}
                                  onError={(e) => { (e.currentTarget.style as CSSStyleDeclaration).display = "none"; }}
                                />
                                <a
                                  href={a.fileId ? `/api/max?action=download&file_id=${a.fileId}&chat_id=${chatId}&message_id=${msg.id}` : a.url}
                                  download={a.name || `attachment_${msg.id}`}
                                  style={{ fontSize: 12, textDecoration: "underline", color: "var(--tg-text-link)" }}
                                >
                                  📎 {a.name || `Вложение (${a.type})`} — скачать
                                </a>
                              </div>
                            ) : (
                              <p style={{ fontSize: 12, fontStyle: "italic" }}>📎 {a.type}: {a.name || "вложение"}</p>
                            )
                          )}
                        </div>
                      );
                    })}

                    {editingId === msg.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          style={{ minWidth: 220 }}
                          autoFocus
                        />
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button onClick={() => { setEditingId(null); setEditText(""); }} className="inbox-sidebar-btn" style={{ width: 26, height: 26 }} title="Отмена"><X size={12} /></button>
                          <button onClick={() => saveEdit(msg.id)} className="inbox-sidebar-btn" style={{ width: 26, height: 26, color: "var(--tg-accent)" }} title="Сохранить"><Check size={12} /></button>
                        </div>
                      </div>
                    ) : (
                      msg.text && (
                        <div style={{ whiteSpace: "pre-wrap" }}>
                          {linkifyText(msg.text)}
                          <span className="inbox-msg-meta">
                            {formatTime(msg.time)}
                            {msg.isMe && <span className={`inbox-msg-tick ${msg.read ? "is-read" : ""}`}>{msg.read ? "✓✓" : "✓"}</span>}
                          </span>
                        </div>
                      )
                    )}

                    {!msg.text && (msg.attaches?.length ?? 0) > 0 && (
                      <div className="inbox-msg-meta" style={{ padding: "2px 6px 0" }}>
                        {formatTime(msg.time)}
                        {msg.isMe && <span className={`inbox-msg-tick ${msg.read ? "is-read" : ""}`}>{msg.read ? "✓✓" : "✓"}</span>}
                      </div>
                    )}

                    {!msg.text && (!msg.attaches || msg.attaches.length === 0) && !msg.forwardedFrom && !msg.replyTo && (
                      <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--tg-text-secondary)" }}>📎 Вложение</p>
                    )}

                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="inbox-msg-reactions">
                        {msg.reactions.map((r, ri) => (
                          <span key={ri} className="inbox-msg-reaction">
                            <span>{r.emoji}</span>
                            {r.count > 1 && <span>{r.count}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {recording && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "rgba(220, 76, 76, 0.15)", borderTop: "1px solid var(--tg-border)" }}>
          <div className="animate-pulse" style={{ width: 10, height: 10, borderRadius: "50%", background: "#e57373" }} />
          <span style={{ fontSize: 13, color: "#ff9a9a", fontWeight: 500 }}>Запись {formatDuration(recordingTime)}</span>
        </div>
      )}

      <div className="inbox-composer">
        <div className="inbox-composer-row">
          <FileTemplatesPanel onInsert={(files) => {
            for (const f of files) {
              fetch(f.url).then((r) => r.blob()).then((blob) => {
                const file = new File([blob], f.name, { type: f.type || "application/octet-stream" });
                sendFile(file);
              }).catch(() => {});
            }
          }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || recording} className="inbox-composer-btn" title="Прикрепить файл">
            <Paperclip size={18} />
          </button>
          <input ref={fileRef} type="file" className="hidden" multiple
            onChange={async (e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) await sendFile(files[i]); } e.target.value = ""; }} />

          <textarea value={text}
            onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
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
          />

          {text.trim() ? (
            <button onClick={sendMessage} disabled={sending} className="inbox-composer-btn inbox-composer-send" title="Отправить (Enter)">
              <Send size={16} />
            </button>
          ) : (
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={uploading}
              className="inbox-composer-btn inbox-composer-send"
              style={{ background: recording ? "#e57373" : "var(--tg-accent)" }}
              title={recording ? "Остановить запись" : "Голосовое"}
            >
              {recording ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>
      </div>

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

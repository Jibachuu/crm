"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Paperclip, Mic, MicOff, Download, FileText, Image, Music, Video, X, Check, CheckCheck } from "lucide-react";
import FileTemplatesPanel from "./FileTemplatesPanel";
import ImageLightbox from "./ImageLightbox";
import { useDraft } from "@/components/inbox/useDraft";
import MessageContextMenu, { MenuIcons } from "@/components/inbox/MessageContextMenu";
import ReplyBar from "@/components/inbox/ReplyBar";
import EmojiPicker from "@/components/inbox/EmojiPicker";
import { Smile } from "lucide-react";
import ChatSearchBar from "@/components/inbox/ChatSearchBar";
import { useChatSearch } from "@/components/inbox/useChatSearch";
import JumpToBottom from "@/components/inbox/JumpToBottom";
import { useToast } from "@/components/inbox/Toaster";
import { formatMessageText } from "@/components/inbox/formatText";
import ComposerAttachments from "@/components/inbox/ComposerAttachments";

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
    size?: number | null;
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
  senderName?: string; // current CRM user name, shown on outgoing messages
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

// linkify/formatting теперь общий — см. formatMessageText в @/components/inbox/formatText

function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

function iconForMime(mime: string | null): React.ComponentType<{ size?: number }> {
  if (!mime) return FileText;
  if (mime.startsWith("image/")) return Image;
  if (mime.startsWith("audio/")) return Music;
  if (mime.startsWith("video/")) return Video;
  return FileText;
}

function MediaBubble({ media, peer, msgId, onLightbox }: { media: NonNullable<TgMessage["media"]>; peer: string; msgId: number; onLightbox?: (src: string) => void }) {
  const mediaUrl = `/api/telegram/media?peer=${encodeURIComponent(peer)}&msgId=${msgId}`;
  const dlUrl = `${mediaUrl}&download=1`;

  if (media.type === "photo") {
    return (
      <div style={{ marginTop: 2 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt="Фото"
          className="inbox-msg-media-image"
          onClick={() => onLightbox?.(mediaUrl)}
        />
      </div>
    );
  }

  if (media.type === "voice") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <Music size={16} style={{ color: "var(--tg-accent)", flexShrink: 0 }} />
        <audio controls src={mediaUrl} style={{ height: 32, maxWidth: 240 }} />
        {media.duration && <span style={{ fontSize: 11, opacity: 0.7 }}>{formatDuration(media.duration)}</span>}
      </div>
    );
  }

  if (media.type === "audio") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
        {media.fileName && <span style={{ fontSize: 13, fontWeight: 500 }}>{media.fileName}</span>}
        <audio controls src={mediaUrl} style={{ height: 32, maxWidth: 260 }} />
      </div>
    );
  }

  if (media.type === "video") {
    return (
      <div style={{ marginTop: 2, position: "relative" }}>
        <video controls src={mediaUrl} style={{ maxWidth: 360, maxHeight: 360, borderRadius: 10, display: "block" }} />
      </div>
    );
  }

  if (media.type === "document") {
    const Icon = iconForMime(media.mimeType);
    const size = formatSize(media.size);
    return (
      <a
        href={dlUrl}
        download={media.fileName ?? "file"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
          textDecoration: "none",
          color: "inherit",
          marginTop: 2,
          minWidth: 220,
          maxWidth: 340,
          transition: "background-color 0.1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
      >
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: "var(--tg-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, color: "#fff",
        }}>
          <Icon size={20} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 500,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{media.fileName ?? "Файл"}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {size} {media.mimeType && `· ${media.mimeType.split("/").pop()}`}
          </div>
        </div>
        <Download size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
      </a>
    );
  }

  if (media.type === "sticker") {
    return <span style={{ fontSize: 32, marginTop: 4, display: "block" }}>🎭</span>;
  }

  if (media.type === "webpage" && media.url) {
    return (
      <a href={media.url} target="_blank" rel="noopener noreferrer"
        style={{
          display: "block", padding: 10, borderRadius: 10, marginTop: 4,
          background: "rgba(255,255,255,0.06)", textDecoration: "none", color: "inherit",
          borderLeft: "3px solid var(--tg-accent)",
          maxWidth: 300,
        }}>
        {media.title && <div style={{ fontSize: 13, fontWeight: 500 }}>{media.title}</div>}
        {media.description && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{media.description}</div>}
        <div style={{ fontSize: 11, marginTop: 3, color: "var(--tg-text-link)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{media.url}</div>
      </a>
    );
  }

  // Fallback для unsupported / неизвестных типов — дать хотя бы скачать
  return (
    <a
      href={dlUrl}
      download={media.fileName ?? "file"}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 10px", borderRadius: 8,
        background: "rgba(255,255,255,0.06)",
        color: "inherit", textDecoration: "none", marginTop: 2,
      }}
    >
      <FileText size={16} style={{ opacity: 0.7 }} />
      <span style={{ fontSize: 13 }}>{media.fileName ?? "Вложение"}</span>
      <Download size={14} style={{ opacity: 0.6, marginLeft: "auto" }} />
    </a>
  );
}

export default function TelegramChat({ peer, compact = false, pollInterval = 8000, readOnly = false, senderName, entityType, entityId, phone }: Props & { entityType?: string; entityId?: string; phone?: string }) {
  const toast = useToast();
  const [messages, setMessages] = useState<TgMessage[]>([]);
  // R6: очередь аттачей — файл сначала висит в composer'е, уходит по Send
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sendAsFile, setSendAsFile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // R2: черновик на чат — сохраняется в localStorage под ключом
  // peer'а. Пример: `inbox:draft:tg:alexey_ivanov`.
  const [text, setText, clearText] = useDraft(`tg:${peer}`);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const sentByRef = useRef<Map<string, string>>(new Map()); // msgText+time → senderName

  // R2: reply target + контекстное меню
  const [replyTo, setReplyTo] = useState<TgMessage | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msg: TgMessage } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // При смене чата сбрасываем reply
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => { setReplyTo(null); setCtxMenu(null); setEmojiOpen(false); setSearchOpen(false); }, [peer]);

  // R5: поиск в чате + jump-to-bottom
  const [searchOpen, setSearchOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  // Ссылка на скроллер — объявлена ниже, но search-хук требует её при
  // инициализации. Держим отдельный ref-контейнер и связываем через
  // useEffect после того как scrollContainerRef заполнится.
  const searchContainerRef = useRef<HTMLElement | null>(null);
  const search = useChatSearch({
    messages,
    getText: (m) => m.text || (m.media ? "[медиа]" : ""),
    getId: (m) => m.id,
    enabled: searchOpen,
    containerRef: searchContainerRef,
  });

  // Ctrl+F внутри чата — открыть поиск
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        // Не глотаем если фокус в input вне инбокса
        const target = e.target as HTMLElement | null;
        const inInbox = target?.closest?.(".inbox-scope");
        if (!inInbox) return;
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function insertEmoji(e: string) {
    const el = composerRef.current;
    if (!el) { setText(text + e); return; }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    setText(next);
    setTimeout(() => {
      if (!composerRef.current) return;
      composerRef.current.focus();
      const pos = start + e.length;
      composerRef.current.setSelectionRange(pos, pos);
    }, 0);
  }

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
        // Auto-resolve: если TG не может найти peer, пробуем add-contact
        // с username (если он в peer уже) или с phone. resolveAttemptedRef
        // не даёт зациклиться — один шанс.
        if (data.error.includes("Could not find") && !resolveAttemptedRef.current) {
          resolveAttemptedRef.current = true;
          // Определяем что подать в add-contact: если peer — @username или буквы, то username; иначе phone.
          const isUsername = /^[a-zA-Z]/.test(peer) || peer.startsWith("@");
          const addBody: Record<string, string> = {};
          if (isUsername) addBody.username = peer.replace(/^@/, "");
          else if (phone) addBody.phone = phone;
          else if (/^\+?\d{6,}$/.test(peer)) addBody.phone = peer;

          if (Object.keys(addBody).length > 0) {
            try {
              const addRes = await fetch("/api/telegram/add-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(addBody),
              });
              const addData = await addRes.json();
              if (addData?.ok && addData.user) {
                // Резолв прошёл — сохраняем id в CRM-контакт если есть entityType=contact
                if (resolvedEntityRef.current?.type === "contact") {
                  fetch("/api/contacts", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: resolvedEntityRef.current.id,
                      telegram_id: String(addData.user.id),
                      telegram_username: addData.user.username || undefined,
                    }),
                  }).catch(() => {});
                }
                // Retry — теперь peer резолвится
                const retryPeer = addData.user.username || String(addData.user.id) || phone || peer;
                const retry = await fetch(`/api/telegram/messages?peer=${encodeURIComponent(retryPeer)}&limit=50`);
                const retryData = await retry.json();
                if (!retryData.error) {
                  const msgs = (retryData.messages as TgMessage[]).reverse();
                  setMessages(msgs);
                  setError(null);
                  setLoading(false);
                  return;
                }
                // Ретрай без сообщений — просто пустой чат
                setMessages([]);
                setError(null);
                setLoading(false);
                return;
              }
              setError(addData?.error || "Не удалось найти в Telegram. Проверь @username или номер.");
              setLoading(false);
              return;
            } catch { /* fall through */ }
          }
          setError("Нужен @username или телефон для первого подключения. Добавь через кнопку «Редактировать» в карточке.");
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

  // Автоотметка «прочитано» при открытии чата — уходят синие галочки
  // клиента и обнуляется unreadCount в его карточке.
  useEffect(() => {
    if (!peer) return;
    fetch("/api/telegram/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peer }),
    }).catch(() => { /* тихо, не критично */ });
  }, [peer]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Прокидываем ссылку в search-хук
  useEffect(() => { searchContainerRef.current = scrollContainerRef.current; });

  // При смене чата — форсим скролл в самый низ. Многократный пин
  // потому что медиа (картинки/видео) прогружаются позже и поднимают
  // scrollHeight — если пинуть один раз, пользователь оказывается
  // не совсем внизу.
  const scrolledForPeerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!peer) return;
    if (messages.length === 0) return;
    if (scrolledForPeerRef.current === peer) return;
    scrolledForPeerRef.current = peer;
    const el = scrollContainerRef.current;
    if (!el) return;
    const pin = () => { const c = scrollContainerRef.current; if (c) c.scrollTop = c.scrollHeight; };
    requestAnimationFrame(pin);
    setTimeout(pin, 60);
    setTimeout(pin, 200);
    setTimeout(pin, 600);
    setTimeout(pin, 1200);
  }, [messages.length, peer]);
  const wasAtBottomRef = useRef(true);

  // Track whether user is at bottom before new messages arrive
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 80;
      const atB = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      wasAtBottomRef.current = atB;
      setAtBottom(atB);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Track last message count to scroll only on new messages (not on any re-render)
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const prev = prevMsgCountRef.current;
    const curr = messages.length;
    prevMsgCountRef.current = curr;
    // Only scroll when a new message is appended AND the user was near bottom
    if (curr <= prev) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    // Recompute "at bottom" right now — scroll event may not have fired yet
    const threshold = 80;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    // Если в очереди аттачи — отправляем их (с caption если есть текст)
    if (pendingFiles.length > 0 && !sending) {
      setSending(true);
      const files = pendingFiles;
      const caption = text.trim();
      setPendingFiles([]);
      clearText();
      setReplyTo(null);
      try {
        for (let i = 0; i < files.length; i++) {
          const isLast = i === files.length - 1;
          await sendFile(files[i], isLast ? caption : "");
        }
      } catch { toast.error("Не удалось отправить файлы"); }
      setSendAsFile(false);
      setSending(false);
      return;
    }
    if (!text.trim() || sending) return;
    setSending(true);
    let body = text.trim();
    // R2: если отвечаем на сообщение — добавляем цитату сверху.
    // Пока это чисто визуальная фича на стороне отправителя;
    // MTProto reply_to_msg_id в /api/telegram/send пока не пробрасываем
    // (R3 задача — прошить это в gramjs client.sendMessage).
    if (replyTo) {
      const qname = replyTo.fromName || "Сообщение";
      const qtext = (replyTo.text || (replyTo.media ? "[медиа]" : "")).slice(0, 120);
      body = `> ${qname}: ${qtext}\n${body}`;
    }
    clearText();
    setReplyTo(null);
    try {
      const res = await fetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: peer, message: body }),
      });
      if (!res.ok) throw new Error("send failed");
      // Track who sent this message
      if (senderName) sentByRef.current.set(body, senderName);
      await fetchMessages(true);
    } catch {
      setText(body);
      toast.error("Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File, caption = "") {
    setUploading(true);
    const fd = new FormData();
    // Browser hands us File objects with empty .name when the user pastes
    // a screenshot via Ctrl+V (or drops one from the system clipboard
    // on Windows). The TG proxy then sends it as "unnamed" with no
    // extension, so the recipient can't open it. Synthesize a name
    // based on the MIME type so it stays a real .png/.jpg/etc.
    const ext = (file.type.split("/")[1] || "bin").replace("jpeg", "jpg").split(";")[0];
    const safeName = file.name?.trim() || `image_${Date.now()}.${ext}`;
    const named = file.name === safeName ? file : new File([file], safeName, { type: file.type });
    fd.append("file", named);
    fd.append("peer", peer);
    if (caption) fd.append("caption", caption);
    if (sendAsFile) fd.append("sendAsFile", "1");
    await fetch("/api/telegram/upload", { method: "POST", body: fd });
    await fetchMessages(true);
    setUploading(false);
  }

  // Добавление в очередь (не отправляет сразу — уходит по Send)
  function enqueueFiles(files: File[] | FileList) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setPendingFiles((p) => [...p, ...arr]);
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

  // compact = встроенный чат в карточке контакта/сделки. 640px даёт
  // достаточно места для истории + composer, при этом не выдавливает
  // остальные табы карточки. Раньше было 500 — слишком тесно.
  const height = compact ? 640 : "100%";

  if (loading) {
    return (
      <div className="inbox-scope" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: compact ? 200 : 300, background: "var(--tg-bg)" }}>
        <div style={{ fontSize: 13, color: "var(--tg-text-secondary)" }}>Загрузка сообщений...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inbox-scope" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, height: compact ? 200 : 300, background: "var(--tg-bg)" }}>
        <p style={{ fontSize: 13, color: "#e57373", textAlign: "center", padding: "0 16px" }}>{error}</p>
        <button onClick={() => fetchMessages()} style={{ fontSize: 12, textDecoration: "underline", background: "transparent", border: "none", color: "var(--tg-accent)", cursor: "pointer" }}>Повторить</button>
      </div>
    );
  }

  return (
    <div
      className="inbox-scope"
      style={{ display: "flex", flexDirection: "column", height, overflow: "hidden", background: "var(--tg-bg)", position: "relative", borderRadius: compact ? 12 : 0 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        enqueueFiles(e.dataTransfer.files);
      }}
    >
      {dragOver && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 40,
          background: "rgba(106, 183, 255, 0.15)", border: "2px dashed var(--tg-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 500, color: "var(--tg-accent)",
          pointerEvents: "none",
        }}>
          Отпустите файл чтобы отправить
        </div>
      )}
      {searchOpen && (
        <ChatSearchBar
          query={search.query}
          onQuery={search.setQuery}
          activeIdx={search.activeIdx}
          matchCount={search.matchIds.length}
          onPrev={search.prev}
          onNext={search.next}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <JumpToBottom
        visible={!atBottom}
        onClick={() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
      />
      <div ref={scrollContainerRef} className="inbox-messages" style={{ padding: "0 12px" }}>
        <div className="inbox-messages-inner">
          {messages.length === 0 && (
            <div style={{ margin: "auto", fontSize: 13, color: "var(--tg-text-secondary)" }}>Нет сообщений</div>
          )}
          {messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const next = idx < messages.length - 1 ? messages[idx + 1] : null;
            const sameSenderAsPrev = prev && prev.out === msg.out;
            const sameSenderAsNext = next && next.out === msg.out;
            const closeToPrev = prev && Math.abs(msg.date - prev.date) < 5 * 60;
            const closeToNext = next && Math.abs(next.date - msg.date) < 5 * 60;
            const isFirstOfGroup = !prev || !sameSenderAsPrev || !closeToPrev;
            const isLastOfGroup = !next || !sameSenderAsNext || !closeToNext;
            const showDateSep = !prev || !isSameDay(prev.date, msg.date);

            return (
              <div key={msg.id}>
                {showDateSep && <div className="inbox-date-sticker">{formatDateSep(msg.date)}</div>}

                <div
                  data-msg-id={msg.id}
                  className={
                    `inbox-msg-row ${msg.out ? "is-own" : ""} ${isFirstOfGroup ? "first-of-group" : ""}` +
                    (search.matchIdSet.has(String(msg.id)) ? " is-search-match" : "") +
                    (search.activeId === String(msg.id) ? " is-search-active" : "")
                  }
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, msg }); }}
                  onDoubleClick={() => { if (msg.text) { setReplyTo(msg); composerRef.current?.focus(); } }}
                >
                  <div className={`inbox-msg-bubble ${isLastOfGroup ? "has-tail" : ""} ${msg.media && !msg.text ? "is-media" : ""}`}>
                    {!msg.out && isFirstOfGroup && msg.fromName && (
                      <div className="inbox-msg-sender">{msg.fromName}</div>
                    )}
                    {msg.out && isFirstOfGroup && senderName && (sentByRef.current.has(msg.text) || !msg.fromName) && (
                      <div className="inbox-msg-sender" style={{ color: "#a8dc9c" }}>{sentByRef.current.get(msg.text) || senderName}</div>
                    )}

                    {msg.forwardedFrom && (
                      <div className="inbox-msg-forwarded">↪ Переслано{msg.forwardedFrom.senderName ? ` от ${msg.forwardedFrom.senderName}` : ""}</div>
                    )}

                    {msg.media && <MediaBubble media={msg.media} peer={peer} msgId={msg.id} onLightbox={setLightbox} />}

                    {msg.text && (
                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                        {formatMessageText(msg.text)}
                        <span className="inbox-msg-meta">
                          {formatMsgTime(msg.date)}
                          {msg.out && (msg.read ? <CheckCheck size={14} className="inbox-msg-tick is-read" /> : <Check size={14} className="inbox-msg-tick" />)}
                        </span>
                      </div>
                    )}

                    {!msg.text && msg.media && (
                      <div className="inbox-msg-meta" style={{ padding: "2px 6px 0" }}>
                        {formatMsgTime(msg.date)}
                        {msg.out && (msg.read ? <CheckCheck size={14} className="inbox-msg-tick is-read" /> : <Check size={14} className="inbox-msg-tick" />)}
                      </div>
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

      {(uploading || recording) && (
        <div style={{ padding: "6px 16px", fontSize: 12, display: "flex", alignItems: "center", gap: 8, background: recording ? "rgba(220, 76, 76, 0.15)" : "var(--tg-bg-panel)", color: recording ? "#ff9a9a" : "var(--tg-accent)" }}>
          {recording ? (
            <>
              <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#e57373" }} />
              Запись {formatDuration(recordingTime)} — нажмите ещё раз чтобы отправить
            </>
          ) : (
            <>
              <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--tg-accent)" }} />
              Отправка файла...
            </>
          )}
        </div>
      )}

      {readOnly ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "12px", borderTop: "1px solid var(--tg-border)", background: "var(--tg-bg-panel)" }}>
          <span style={{ fontSize: 12, color: "var(--tg-text-secondary)" }}>Это канал — отправка сообщений недоступна</span>
        </div>
      ) : (
        <>
          {replyTo && (
            <ReplyBar
              senderName={replyTo.fromName || "Ответ"}
              text={replyTo.text || (replyTo.media ? "[медиа]" : "")}
              onCancel={() => setReplyTo(null)}
            />
          )}
          <ComposerAttachments
            files={pendingFiles}
            onRemove={(i) => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
            asFile={sendAsFile}
            onToggleAsFile={setSendAsFile}
          />
          <div className="inbox-composer" style={{ position: "relative" }}>
          {emojiOpen && (
            <EmojiPicker
              onPick={(e) => insertEmoji(e)}
              onClose={() => setEmojiOpen(false)}
              anchorEl={emojiBtnRef.current}
            />
          )}
          <div className="inbox-composer-row">
            <FileTemplatesPanel onInsert={(files) => {
              for (const f of files) {
                fetch(f.url).then((r) => r.blob()).then((blob) => {
                  const file = new File([blob], f.name, { type: f.type || "application/octet-stream" });
                  enqueueFiles([file]);
                }).catch(() => {});
              }
            }} />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || recording}
              className="inbox-composer-btn"
              title="Прикрепить файл"
            >
              <Paperclip size={18} />
            </button>
            <input ref={fileInputRef} type="file" className="hidden" multiple
              onChange={(e) => { if (e.target.files) enqueueFiles(e.target.files); e.target.value = ""; }} />
            <button
              ref={emojiBtnRef}
              onClick={() => setEmojiOpen((v) => !v)}
              className="inbox-composer-btn"
              title="Эмодзи"
            >
              <Smile size={18} />
            </button>

            <textarea
              ref={composerRef}
              value={text}
              onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                else if (e.key === "Escape" && replyTo) { e.preventDefault(); setReplyTo(null); }
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const files: File[] = [];
                for (let i = 0; i < items.length; i++) {
                  if (items[i].kind === "file") {
                    const f = items[i].getAsFile();
                    if (f) files.push(f);
                  }
                }
                if (files.length > 0) {
                  e.preventDefault();
                  enqueueFiles(files);
                }
              }}
              placeholder="Сообщение"
              disabled={recording || uploading}
              rows={1}
            />

            {text.trim() || pendingFiles.length > 0 ? (
              <button
                onClick={sendMessage}
                disabled={sending || uploading}
                className="inbox-composer-btn inbox-composer-send"
                title="Отправить (Enter)"
              >
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
        </>
      )}

      {/* Скрытые иконки MediaBubble от tree-shake */}
      <span className="hidden"><Image size={1} /><Video size={1} /><X size={1} /></span>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {ctxMenu && (() => {
        const m = ctxMenu.msg;
        const items = [] as { icon: React.ComponentType<{ size?: number }>; label: string; onClick: () => void; danger?: boolean }[];
        if (!readOnly) items.push({ icon: MenuIcons.Reply, label: "Ответить", onClick: () => { setReplyTo(m); composerRef.current?.focus(); } });
        if (m.text) items.push({ icon: MenuIcons.Copy, label: "Копировать текст", onClick: () => { navigator.clipboard.writeText(m.text).then(() => toast.success("Скопировано")).catch(() => toast.error("Не удалось скопировать")); } });
        if (m.out && !readOnly) {
          items.push({ icon: MenuIcons.Trash2, label: "Удалить у всех", danger: true, onClick: async () => {
            if (!confirm("Удалить это сообщение у всех? Действие необратимо.")) return;
            const res = await fetch("/api/telegram/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ peer, message_ids: [m.id], revoke: true }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.ok) {
              setMessages((prev) => prev.filter((x) => x.id !== m.id));
              toast.success("Сообщение удалено");
            } else {
              toast.error("Не удалось удалить: " + (data?.error ?? res.status));
            }
          } });
          items.push({ icon: MenuIcons.Trash2, label: "Удалить только у меня", onClick: async () => {
            const res = await fetch("/api/telegram/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ peer, message_ids: [m.id], revoke: false }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.ok) {
              setMessages((prev) => prev.filter((x) => x.id !== m.id));
              toast.success("Удалено у себя");
            } else toast.error("Не удалось: " + (data?.error ?? res.status));
          } });
        }
        return <MessageContextMenu x={ctxMenu.x} y={ctxMenu.y} items={items} onClose={() => setCtxMenu(null)} />;
      })()}
    </div>
  );
}

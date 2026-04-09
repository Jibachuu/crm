"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Paperclip, Phone, Mic, MicOff, Download, FileText, Play, Plus, Users, X, Check } from "lucide-react";
import { getInitials } from "@/lib/utils";

interface User {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  is_active: boolean;
  last_seen_at?: string;
}

function isOnline(lastSeen?: string) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 3 * 60 * 1000; // 3 min
}

function lastSeenText(lastSeen?: string) {
  if (!lastSeen) return "не в сети";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 3 * 60 * 1000) return "онлайн";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `был(а) ${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `был(а) ${hrs} ч назад`;
  return `был(а) ${new Date(lastSeen).toLocaleDateString("ru-RU")}`;
}

interface Message {
  id: string;
  from_user: string;
  to_user: string;
  body: string | null;
  file_url: string | null;
  file_name: string | null;
  is_read: boolean;
  created_at: string;
}

interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  body: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  users?: { full_name: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface GroupChat { id: string; name: string; created_by: string; group_chat_members: any[] }

type ChatTarget = { type: "user"; user: User } | { type: "group"; group: GroupChat };

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + time;
}

const ROLE_LABELS: Record<string, string> = { admin: "Администратор", supervisor: "Руководитель", manager: "Менеджер" };

function Linkify({ text, isMe }: { text: string; isMe: boolean }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <span>{parts.map((part, i) =>
      urlRegex.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: isMe ? "#b3d9ff" : "#0067a5" }}>{part}</a>
      ) : <span key={i}>{part}</span>
    )}</span>
  );
}

function isAudioFile(name: string | null) { return name ? /\.(mp3|wav|ogg|webm|m4a|aac)$/i.test(name) : false; }
function isVoiceMessage(name: string | null) { return name?.startsWith("voice_") ?? false; }

export default function TeamClient({ currentUserId, users }: { currentUserId: string; users: User[] }) {
  const [target, setTarget] = useState<ChatTarget | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [groupUnreadMap, setGroupUnreadMap] = useState<Record<string, number>>({});
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState<Set<string>>(new Set());
  const [showMembers, setShowMembers] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch unread counts (personal)
  const fetchUnread = useCallback(async () => {
    const res = await fetch("/api/team/messages");
    if (res.ok) { const data = await res.json(); setUnreadMap(data.unreadMap ?? {}); }
  }, []);

  // Fetch groups + group unread
  const fetchGroups = useCallback(async () => {
    const res = await fetch("/api/team/groups");
    if (res.ok) { const data = await res.json(); setGroups(data.groups ?? []); setGroupUnreadMap(data.unreadMap ?? {}); }
  }, []);

  useEffect(() => { fetchUnread(); fetchGroups(); }, [fetchUnread, fetchGroups]);
  useEffect(() => {
    const i1 = setInterval(fetchUnread, 15000);
    const i2 = setInterval(fetchGroups, 15000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [fetchUnread, fetchGroups]);

  // Fetch personal messages
  const fetchMessages = useCallback(async () => {
    if (target?.type !== "user") return;
    const res = await fetch(`/api/team/messages?peer=${target.user.id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      setUnreadMap((prev) => { const n = { ...prev }; delete n[target.user.id]; return n; });
    }
  }, [target]);

  // Fetch group messages
  const fetchGroupMessages = useCallback(async () => {
    if (target?.type !== "group") return;
    const res = await fetch("/api/team/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "messages", group_id: target.group.id }),
    });
    if (res.ok) {
      const data = await res.json();
      setGroupMessages(data.messages ?? []);
      setGroupUnreadMap((prev) => { const n = { ...prev }; delete n[target.group.id]; return n; });
    }
  }, [target]);

  useEffect(() => { if (target?.type === "user") fetchMessages(); else if (target?.type === "group") fetchGroupMessages(); }, [target, fetchMessages, fetchGroupMessages]);
  useEffect(() => {
    if (!target) return;
    const fn = target.type === "user" ? fetchMessages : fetchGroupMessages;
    const interval = setInterval(fn, 5000);
    return () => clearInterval(interval);
  }, [target, fetchMessages, fetchGroupMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, groupMessages]);

  // Send personal message
  async function sendPersonalMessage() {
    if (!text.trim() || target?.type !== "user" || sending) return;
    setSending(true);
    const res = await fetch("/api/team/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_user: target.user.id, body: text.trim() }),
    });
    if (res.ok) { const data = await res.json(); setMessages((prev) => [...prev, data.message]); setText(""); }
    setSending(false);
  }

  // Send group message
  async function sendGroupMessage() {
    if (!text.trim() || target?.type !== "group" || sending) return;
    setSending(true);
    const res = await fetch("/api/team/groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", group_id: target.group.id, text: text.trim() }),
    });
    if (res.ok) { const data = await res.json(); setGroupMessages((prev) => [...prev, data.message]); setText(""); }
    setSending(false);
  }

  function sendMessage() {
    if (target?.type === "user") sendPersonalMessage();
    else if (target?.type === "group") sendGroupMessage();
  }

  // File upload for personal and group chats
  async function sendFile(file: File) {
    if (!target) return;
    setUploading(true);

    if (target.type === "user") {
      const form = new FormData();
      form.append("file", file);
      form.append("to_user", target.user.id);
      const res = await fetch("/api/team/upload", { method: "POST", body: form });
      if (res.ok) { const data = await res.json(); setMessages((prev) => [...prev, data.message]); }
      else { const err = await res.json(); alert("Ошибка: " + (err.error ?? "")); }
    } else {
      // Upload to storage first, then send as group message
      const form = new FormData();
      form.append("file", file);
      form.append("group_id", target.group.id);
      const res = await fetch("/api/team/upload", { method: "POST", body: form });
      if (res.ok) { const data = await res.json(); setGroupMessages((prev) => [...prev, data.message]); }
      else { const err = await res.json(); alert("Ошибка: " + (err.error ?? "")); }
    }

    setUploading(false);
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
      setRecording(true); setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch { alert("Не удалось получить доступ к микрофону"); }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function formatDuration(secs: number) { return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`; }

  // Jitsi call
  async function startCall() {
    const roomId = "CrmCall" + Date.now() + Math.random().toString(36).slice(2, 8);
    const callUrl = `https://meet.jit.si/${roomId}`;
    const callWindow = window.open(callUrl, "_blank");

    if (target?.type === "user") {
      await fetch("/api/team/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_user: target.user.id, body: `📞 Приглашение в видеозвонок!\nПрисоединяйтесь: ${callUrl}` }),
      }).then(async (res) => { if (res.ok) { const data = await res.json(); setMessages((prev) => [...prev, data.message]); } });
    } else if (target?.type === "group") {
      // Send link to all group members
      await fetch("/api/team/groups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", group_id: target.group.id, text: `📞 Приглашение в видеозвонок!\nПрисоединяйтесь: ${callUrl}` }),
      }).then(async (res) => { if (res.ok) { const data = await res.json(); setGroupMessages((prev) => [...prev, data.message]); } });
    }

    if (!callWindow) alert(`Браузер заблокировал окно. Откройте вручную:\n${callUrl}`);
  }

  // Create group
  async function createGroup() {
    if (!newGroupName.trim()) return;
    const res = await fetch("/api/team/groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: newGroupName, memberIds: [...newGroupMembers] }),
    });
    if (res.ok) {
      setShowCreateGroup(false); setNewGroupName(""); setNewGroupMembers(new Set());
      fetchGroups();
    }
  }

  const filteredUsers = users.filter((u) =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );
  const totalUnread = Object.values(unreadMap).reduce((s, n) => s + n, 0) + Object.values(groupUnreadMap).reduce((s, n) => s + n, 0);

  // Current chat messages for rendering
  const chatMessages = target?.type === "user" ? messages : [];
  const chatGroupMessages = target?.type === "group" ? groupMessages : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderMessageBubble(msg: { id: string; body: string | null; file_url: string | null; file_name: string | null; created_at: string }, isMe: boolean, senderName?: string) {
    return (
      <div key={msg.id} className="flex" style={{ justifyContent: isMe ? "flex-end" : "flex-start" }}>
        <div style={{
          maxWidth: "70%", padding: "8px 12px",
          borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          background: isMe ? "#0067a5" : "#fff", color: isMe ? "#fff" : "#333",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        }}>
          {senderName && !isMe && (
            <p className="text-xs font-semibold mb-1" style={{ color: "#0067a5" }}>{senderName}</p>
          )}
          {msg.file_url && (
            isVoiceMessage(msg.file_name) || isAudioFile(msg.file_name) ? (
              <div className="mb-1">
                <div className="flex items-center gap-2 mb-1">
                  <Play size={14} style={{ color: isMe ? "#b3d9ff" : "#0067a5" }} />
                  <span className="text-xs font-medium">{isVoiceMessage(msg.file_name) ? "Голосовое" : msg.file_name}</span>
                </div>
                <audio controls src={msg.file_url} className="w-full" style={{ maxWidth: 280, height: 36 }} />
              </div>
            ) : (
              <a href={msg.file_url} target="_blank" rel="noopener noreferrer" download={msg.file_name ?? undefined}
                className="flex items-center gap-2 px-3 py-2 rounded mb-1 transition-colors"
                style={{ background: isMe ? "rgba(255,255,255,0.15)" : "#f5f5f5", textDecoration: "none", color: isMe ? "#fff" : "#333" }}>
                <FileText size={16} style={{ color: isMe ? "#b3d9ff" : "#0067a5", flexShrink: 0 }} />
                <p className="text-xs font-medium truncate flex-1">{msg.file_name ?? "Файл"}</p>
                <Download size={14} style={{ color: isMe ? "#b3d9ff" : "#888", flexShrink: 0 }} />
              </a>
            )
          )}
          {msg.body && <p className="text-sm whitespace-pre-wrap"><Linkify text={msg.body} isMe={isMe} /></p>}
          <p className="text-xs mt-1" style={{ color: isMe ? "rgba(255,255,255,0.6)" : "#aaa", textAlign: "right" }}>{formatTime(msg.created_at)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full" style={{ height: "calc(100vh - 48px)" }}>
      {/* Left panel */}
      <div className="flex flex-col" style={{ width: 300, borderRight: "1px solid #e4e4e4", background: "#fff" }}>
        <div className="px-3 py-3" style={{ borderBottom: "1px solid #f0f0f0" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..." className="w-full px-3 py-1.5 text-xs focus:outline-none"
            style={{ border: "1px solid #e0e0e0", borderRadius: 4 }} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Groups */}
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "#888" }}>ГРУППЫ · {groups.length}</span>
            <button onClick={() => setShowCreateGroup(true)} className="p-1 rounded hover:bg-gray-100"><Plus size={13} style={{ color: "#0067a5" }} /></button>
          </div>
          {groups.map((g) => {
            const isSel = target?.type === "group" && target.group.id === g.id;
            const unread = groupUnreadMap[g.id] ?? 0;
            const memberCount = g.group_chat_members?.length ?? 0;
            return (
              <button key={g.id} onClick={() => setTarget({ type: "group", group: g })}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                style={{ background: isSel ? "#e8f4fd" : "transparent", borderLeft: isSel ? "3px solid #0067a5" : "3px solid transparent" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#e8f4fd" }}>
                  <Users size={16} style={{ color: "#0067a5" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate" style={{ color: "#222" }}>{g.name}</span>
                    {unread > 0 && <span className="text-xs text-white rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ background: "#0067a5", minWidth: 18, textAlign: "center" }}>{unread}</span>}
                  </div>
                  <span className="text-xs" style={{ color: "#aaa" }}>{memberCount} участников</span>
                </div>
              </button>
            );
          })}

          {/* Personal chats */}
          <div className="px-3 py-2 flex items-center justify-between" style={{ borderTop: groups.length > 0 ? "1px solid #f0f0f0" : "none" }}>
            <span className="text-xs font-semibold" style={{ color: "#888" }}>КОМАНДА · {users.length}</span>
            {totalUnread > 0 && <span className="text-xs text-white rounded-full px-1.5 py-0.5" style={{ background: "#e74c3c", minWidth: 18, textAlign: "center" }}>{totalUnread}</span>}
          </div>
          {filteredUsers.map((u) => {
            const isSel = target?.type === "user" && target.user.id === u.id;
            const unread = unreadMap[u.id] ?? 0;
            return (
              <button key={u.id} onClick={() => setTarget({ type: "user", user: u })}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                style={{ background: isSel ? "#e8f4fd" : "transparent", borderLeft: isSel ? "3px solid #0067a5" : "3px solid transparent" }}>
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: u.is_active ? "#0067a5" : "#aaa" }}>{getInitials(u.full_name)}</div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                    style={{ background: isOnline(u.last_seen_at) ? "#2e7d32" : "#ccc" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate" style={{ color: "#222" }}>{u.full_name ?? u.email}</span>
                    {unread > 0 && <span className="text-xs text-white rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ background: "#0067a5", minWidth: 18, textAlign: "center" }}>{unread}</span>}
                  </div>
                  <span className="text-xs" style={{ color: isOnline(u.last_seen_at) ? "#2e7d32" : "#aaa" }}>{lastSeenText(u.last_seen_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="p-3" style={{ borderTop: "1px solid #f0f0f0" }}>
          <button onClick={startCall} disabled={!target} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded transition-colors disabled:opacity-40"
            style={{ background: "#5b57d1", color: "#fff", borderRadius: 6 }}>
            <Phone size={14} /> Позвонить
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-col flex-1 min-w-0" style={{ background: "#f5f5f5" }}>
        {!target ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Send size={48} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите чат</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid #e4e4e4", background: "#fff" }}>
              <div className="flex items-center gap-3">
                {target.type === "user" ? (
                  <>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ background: "#0067a5" }}>
                      {getInitials(target.user.full_name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#222" }}>{target.user.full_name}</p>
                      <p className="text-xs" style={{ color: "#aaa" }}>{target.user.email}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#e8f4fd" }}>
                      <Users size={18} style={{ color: "#0067a5" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#222" }}>{target.group.name}</p>
                      <button onClick={() => setShowMembers(!showMembers)} className="text-xs hover:underline" style={{ color: "#0067a5" }}>
                        {target.group.group_chat_members?.length ?? 0} участников
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button onClick={startCall} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors"
                style={{ background: "#5b57d1", color: "#fff", borderRadius: 4 }}>
                <Phone size={12} /> Позвонить
              </button>
            </div>

            {/* Members panel */}
            {showMembers && target.type === "group" && (
              <div className="px-4 py-2" style={{ background: "#f8f9fa", borderBottom: "1px solid #e4e4e4" }}>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {target.group.group_chat_members?.map((m: { user_id: string; users: { id: string; full_name: string } }) => (
                    <span key={m.user_id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: "#e8f4fd", color: "#0067a5" }}>
                      {m.users?.full_name ?? "—"}
                      {m.user_id !== target.group.created_by && (
                        <button onClick={async () => {
                          if (!confirm(`Удалить ${m.users?.full_name} из группы?`)) return;
                          await fetch("/api/team/groups", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "remove_member", group_id: target.group.id, user_id: m.user_id }),
                          });
                          fetchGroups();
                        }} className="hover:text-red-600"><X size={10} /></button>
                      )}
                    </span>
                  ))}
                </div>
                {/* Add member */}
                <select
                  onChange={async (e) => {
                    const uid = e.target.value;
                    if (!uid) return;
                    await fetch("/api/team/groups", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "add_member", group_id: target.group.id, user_id: uid }),
                    });
                    e.target.value = "";
                    fetchGroups();
                  }}
                  className="text-xs px-2 py-1 rounded outline-none" style={{ border: "1px solid #d0d0d0", color: "#888" }}>
                  <option value="">+ Добавить участника</option>
                  {users.filter((u) => !target.group.group_chat_members?.some((m: { user_id: string }) => m.user_id === u.id)).map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {target.type === "user" && chatMessages.length === 0 && <p className="text-xs text-center py-8" style={{ color: "#aaa" }}>Начните переписку</p>}
              {target.type === "group" && chatGroupMessages.length === 0 && <p className="text-xs text-center py-8" style={{ color: "#aaa" }}>Начните общение в группе</p>}

              {target.type === "user" && chatMessages.map((msg) => renderMessageBubble(msg, msg.from_user === currentUserId))}
              {target.type === "group" && chatGroupMessages.map((msg) => renderMessageBubble(msg, msg.sender_id === currentUserId, msg.users?.full_name))}
              <div ref={bottomRef} />
            </div>

            {/* Recording */}
            {recording && (
              <div className="flex items-center gap-3 px-4 py-2" style={{ background: "#fff3f3", borderTop: "1px solid #ffcdd2" }}>
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: "#d32f2f" }} />
                <span className="text-xs font-medium" style={{ color: "#d32f2f" }}>Запись {formatDuration(recordingTime)}</span>
              </div>
            )}

            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid #e4e4e4", background: "#fff" }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading || recording} className="p-1.5 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-40">
                <Paperclip size={18} style={{ color: "#888" }} />
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }} />

              <input value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={uploading ? "Загрузка..." : "Сообщение..."}
                disabled={recording || uploading}
                className="flex-1 text-sm px-3 py-2 focus:outline-none rounded-full"
                style={{ border: "1px solid #e0e0e0", background: "#f5f5f5" }} />
              {text.trim() ? (
                <button onClick={sendMessage} disabled={sending} className="p-2 rounded-full transition-colors disabled:opacity-40" style={{ background: "#0067a5" }}>
                  <Send size={16} style={{ color: "#fff" }} />
                </button>
              ) : (
                <button onClick={recording ? stopRecording : startRecording} disabled={uploading}
                  className="p-2 rounded-full transition-colors disabled:opacity-40" style={{ background: recording ? "#d32f2f" : "#0067a5" }}>
                  {recording ? <MicOff size={16} style={{ color: "#fff" }} /> : <Mic size={16} style={{ color: "#fff" }} />}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
          <div className="rounded-lg shadow-xl w-96" style={{ background: "#fff" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #e4e4e4" }}>
              <h3 className="text-sm font-semibold">Новый групповой чат</h3>
              <button onClick={() => setShowCreateGroup(false)} className="p-1 rounded hover:bg-gray-100"><X size={14} /></button>
            </div>
            <div className="p-4 space-y-3">
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Название группы" className="w-full text-sm px-3 py-2 rounded focus:outline-none"
                style={{ border: "1px solid #d0d0d0" }} />
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: "#888" }}>Участники:</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={newGroupMembers.has(u.id)}
                        onChange={() => setNewGroupMembers((prev) => { const s = new Set(prev); s.has(u.id) ? s.delete(u.id) : s.add(u.id); return s; })}
                        style={{ accentColor: "#0067a5" }} />
                      <span className="text-xs" style={{ color: "#333" }}>{u.full_name ?? u.email}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={createGroup} disabled={!newGroupName.trim()}
                className="w-full flex items-center justify-center gap-2 text-sm py-2 rounded text-white font-medium disabled:opacity-50"
                style={{ background: "#0067a5" }}>
                <Check size={14} /> Создать ({newGroupMembers.size + 1} чел.)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

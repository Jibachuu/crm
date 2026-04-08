"use client";

import { useState, useEffect, useRef } from "react";
import { Send, RefreshCw, Paperclip, Mic, MicOff, Play, FileText, Download } from "lucide-react";

export default function MaxChat({ chatId, compact = false }: { chatId: string; compact?: boolean }) {
  const [messages, setMessages] = useState<{ id: string; text: string; sender: string; senderId?: number; time: number; isMe: boolean }[]>([]);
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

  async function loadMessages() {
    setError("");
    try {
      const res = await fetch(`/api/max?action=messages&chat_id=${chatId}&count=50`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Ошибка"); return; }
      const msgs = (data.messages ?? []).map((m: { id: string; text: string; sender: string; senderId?: number; time: number }) => ({
        ...m,
        isMe: myId ? (Number(m.senderId) === Number(myId)) : false,
      }));
      setMessages(msgs);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }

  useEffect(() => { if (chatId && myId !== null) loadMessages(); }, [chatId, myId]);
  // Only scroll on new messages, not on every poll
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages]);
  useEffect(() => {
    if (!chatId) return;
    const interval = setInterval(loadMessages, 8000);
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

  // Upload file to Supabase Storage, send link in MAX
  async function sendFile(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("to_user", "max_" + chatId); // use special prefix for MAX uploads
    const res = await fetch("/api/team/upload", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      const fileUrl = data.message?.file_url;
      if (fileUrl) {
        const label = file.name.startsWith("voice_") ? "🎤 Голосовое сообщение" : `📎 ${file.name}`;
        await fetch("/api/max", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send", chat_id: chatId, text: `${label}\n${fileUrl}` }),
        });
        setTimeout(loadMessages, 1000);
      }
    } else {
      alert("Ошибка загрузки файла");
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

  // Check if message contains a file URL
  function isFileMessage(text: string) {
    return text.includes("📎") || text.includes("🎤");
  }

  function getFileUrl(text: string) {
    const match = text.match(/https?:\/\/[^\s]+/);
    return match?.[0] ?? null;
  }

  if (error) return <div className="text-xs p-3 rounded" style={{ background: "#fdecea", color: "#c62828" }}>{error}</div>;

  return (
    <div className="flex flex-col" style={{ height: compact ? 400 : "100%" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
        <span className="text-xs font-semibold" style={{ color: "#888" }}>МАКС</span>
        <button onClick={loadMessages} className="p-1 rounded hover:bg-gray-100"><RefreshCw size={12} style={{ color: "#888" }} /></button>
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

              {/* Voice/file messages */}
              {msg.text.includes("🎤") && getFileUrl(msg.text) ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Play size={14} style={{ color: msg.isMe ? "#b3d9ff" : "#0067a5" }} />
                    <span className="text-xs">Голосовое</span>
                  </div>
                  <audio controls src={getFileUrl(msg.text)!} className="w-full" style={{ maxWidth: 250, height: 36 }} />
                </div>
              ) : msg.text.includes("📎") && getFileUrl(msg.text) ? (
                <a href={getFileUrl(msg.text)!} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2 py-1.5 rounded"
                  style={{ background: msg.isMe ? "rgba(255,255,255,0.15)" : "#f5f5f5", textDecoration: "none", color: msg.isMe ? "#fff" : "#333" }}>
                  <FileText size={14} style={{ color: msg.isMe ? "#b3d9ff" : "#0067a5" }} />
                  <span className="text-xs truncate">{msg.text.split("\n")[0].replace("📎 ", "")}</span>
                  <Download size={12} style={{ color: msg.isMe ? "#b3d9ff" : "#888" }} />
                </a>
              ) : (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              )}

              <p className="text-xs mt-0.5" style={{ color: msg.isMe ? "rgba(255,255,255,0.6)" : "#aaa", textAlign: "right", fontSize: 10 }}>{formatTime(msg.time)}</p>
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
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid #e4e4e4" }}>
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
    </div>
  );
}

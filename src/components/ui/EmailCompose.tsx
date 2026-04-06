"use client";

import { useState, useRef } from "react";
import { Send, X, Paperclip } from "lucide-react";
import Button from "./Button";

interface Props {
  to: string;
  entityType?: string;
  entityId?: string;
  defaultSubject?: string;
  onSent?: () => void;
  onClose?: () => void;
  compact?: boolean;
}

export default function EmailCompose({ to, entityType, entityId, defaultSubject, onSent, onClose, compact = false }: Props) {
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);

    // Convert files to base64 for reliable upload
    const fileData: { name: string; type: string; data: string }[] = [];
    for (const f of files) {
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      fileData.push({ name: f.name, type: f.type, data: btoa(binary) });
    }

    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to, subject, body,
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        files: fileData,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const fileInfo = files.length > 0 ? ` (файлов: ${data.attachmentCount ?? 0})` : "";
      setSentMsg(`Письмо отправлено на ${to}${fileInfo}`);
      setSent(true);
      setTimeout(() => { setSent(false); setSentMsg(""); setSubject(""); setBody(""); setFiles([]); onSent?.(); }, 3000);
    } else {
      alert("Ошибка: " + (data.error ?? "не удалось отправить"));
    }
    setSending(false);
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 p-4 rounded" style={{ background: "#e8f5e9", border: "1px solid #a5d6a7" }}>
        <Send size={14} style={{ color: "#2e7d32" }} />
        <span className="text-sm font-medium" style={{ color: "#2e7d32" }}>{sentMsg || `Письмо отправлено на ${to}`}</span>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };

  return (
    <div className="rounded" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
        <span className="text-xs font-semibold" style={{ color: "#555" }}>Новое письмо</span>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={14} style={{ color: "#aaa" }} /></button>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs" style={{ color: "#888" }}>
          <span>Кому:</span>
          <span className="font-medium" style={{ color: "#333" }}>{to}</span>
        </div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Тема письма"
          style={inputStyle}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Текст письма..."
          rows={compact ? 4 : 6}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        {/* Attachments */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                style={{ background: "#f0f0f0", color: "#555" }}>
                <Paperclip size={10} /> {f.name} ({(f.size / 1024).toFixed(0)} КБ)
                <button onClick={() => removeFile(i)} className="ml-1 hover:text-red-600"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded hover:bg-gray-100 transition-colors" style={{ color: "#888" }}>
              <Paperclip size={13} /> Прикрепить файл
            </button>
          </div>
          <Button size="sm" onClick={handleSend} loading={sending} disabled={!subject.trim() || !body.trim()}>
            <Send size={13} /> Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}

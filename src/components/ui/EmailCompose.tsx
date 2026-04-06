"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import Button from "./Button";

interface Props {
  to: string;
  entityType?: string;
  entityId?: string;
  onSent?: () => void;
  onClose?: () => void;
  compact?: boolean;
}

export default function EmailCompose({ to, entityType, entityId, onSent, onClose, compact = false }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body, entityType, entityId }),
    });
    if (res.ok) {
      setSent(true);
      setTimeout(() => { setSent(false); setSubject(""); setBody(""); onSent?.(); }, 2000);
    } else {
      const data = await res.json();
      alert("Ошибка: " + (data.error ?? "не удалось отправить"));
    }
    setSending(false);
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 p-4 rounded" style={{ background: "#e8f5e9", border: "1px solid #a5d6a7" }}>
        <Send size={14} style={{ color: "#2e7d32" }} />
        <span className="text-sm font-medium" style={{ color: "#2e7d32" }}>Письмо отправлено на {to}</span>
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
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSend} loading={sending} disabled={!subject.trim() || !body.trim()}>
            <Send size={13} /> Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}

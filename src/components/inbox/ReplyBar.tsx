"use client";

import { X, Reply as ReplyIcon } from "lucide-react";

interface Props {
  senderName: string;
  text: string;
  onCancel: () => void;
}

// Плашка над composer'ом когда пользователь отвечает на конкретное
// сообщение. Показывает от кого/что цитируем + крестик. Клик по крестику
// снимает reply-target.
export default function ReplyBar({ senderName, text, onCancel }: Props) {
  const trimmed = text.length > 120 ? text.slice(0, 120) + "…" : text;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: "var(--tg-bg-panel-hover)",
        borderTop: "1px solid var(--tg-border-subtle)",
        borderLeft: "3px solid var(--tg-accent)",
      }}
    >
      <ReplyIcon size={16} style={{ color: "var(--tg-accent)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--tg-accent)" }}>{senderName || "Ответ"}</div>
        <div style={{ fontSize: 13, color: "var(--tg-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trimmed || "(без текста)"}</div>
      </div>
      <button
        onClick={onCancel}
        className="inbox-sidebar-btn"
        style={{ width: 28, height: 28, flexShrink: 0 }}
        title="Отменить ответ (Esc)"
      >
        <X size={16} />
      </button>
    </div>
  );
}

"use client";

import { ChevronDown } from "lucide-react";

interface Props {
  visible: boolean;
  unreadCount?: number;
  onClick: () => void;
}

// Плавающая кнопка «вниз» — появляется когда пользователь прокрутил
// ленту сообщений вверх и есть куда прыгать. Если есть непрочитанные,
// показываем цифру над иконкой (как в TG).
export default function JumpToBottom({ visible, unreadCount = 0, onClick }: Props) {
  if (!visible) return null;
  return (
    <button
      onClick={onClick}
      style={{
        position: "absolute",
        bottom: 82,
        right: 20,
        zIndex: 30,
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: "var(--tg-bg-panel)",
        border: "1px solid var(--tg-border-subtle)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--tg-text-secondary)",
        cursor: "pointer",
        transition: "transform 0.1s, background-color 0.1s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tg-bg-panel-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--tg-bg-panel)"; }}
      title="К последнему сообщению"
    >
      <ChevronDown size={20} />
      {unreadCount > 0 && (
        <span style={{
          position: "absolute",
          top: -4,
          right: -4,
          minWidth: 20,
          height: 20,
          padding: "0 6px",
          borderRadius: 10,
          background: "var(--tg-badge-unread)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>{unreadCount > 99 ? "99+" : unreadCount}</span>
      )}
    </button>
  );
}

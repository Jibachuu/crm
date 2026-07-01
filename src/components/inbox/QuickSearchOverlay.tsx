"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import ChatListItem from "./ChatListItem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dialog = any;

interface Props {
  dialogs: Dialog[];
  onPick: (d: Dialog) => void;
  onClose: () => void;
  formatTime: (ts: number) => string;
}

// Ctrl+K overlay — быстрый поиск по всем чатам. Открывается на весь экран
// с большим затемнением, в центре — поле поиска и список совпадений.
// Стрелки ↑↓ навигируют, Enter выбирает, Esc закрывает.
export default function QuickSearchOverlay({ dialogs, onPick, onClose, formatTime }: Props) {
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/^@/, "");
    const digits = query.replace(/\D/g, "");
    if (!query) return dialogs.slice(0, 30);
    return dialogs.filter((d) => {
      if (d.name?.toLowerCase().includes(query)) return true;
      if (d.lastMessage?.toLowerCase().includes(query)) return true;
      if (d.username?.toLowerCase().includes(query)) return true;
      if (d.phone && digits && d.phone.replace(/\D/g, "").includes(digits)) return true;
      return false;
    }).slice(0, 50);
  }, [q, dialogs]);

  useEffect(() => { setActiveIdx(0); }, [q]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const d = results[activeIdx];
      if (d) { onPick(d); onClose(); }
    }
  }

  // Автоскролл к выбранному
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "10vh",
        animation: "fade-in 0.12s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: "min(640px, 92vw)",
          maxHeight: "76vh",
          background: "var(--tg-bg-panel)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--tg-border-subtle)" }}>
          <Search size={18} style={{ color: "var(--tg-text-secondary)" }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по чатам, именам, номерам…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "var(--tg-text)",
              fontSize: 16,
              padding: 0,
              outline: "none",
            }}
          />
          <span style={{
            fontSize: 11, color: "var(--tg-text-tertiary)",
            padding: "2px 6px", borderRadius: 4, border: "1px solid var(--tg-border-subtle)",
          }}>Esc</span>
          <button onClick={onClose} className="inbox-sidebar-btn" style={{ width: 28, height: 28 }} title="Закрыть"><X size={16} /></button>
        </div>

        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {results.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--tg-text-secondary)" }}>Ничего не найдено</p>
          ) : (
            results.map((d, i) => (
              <div key={d.id} data-idx={i} style={i === activeIdx ? { background: "var(--tg-bg-panel-selected)" } : undefined}>
                <ChatListItem
                  name={d.name}
                  preview={d.lastMessage || "…"}
                  time={formatTime(d.lastTime)}
                  unreadCount={d.unreadCount}
                  isUnread={d.unread || (d.unreadCount ?? 0) > 0}
                  isSelected={i === activeIdx}
                  avatarUrl={d.avatar}
                  channel={d.channel}
                  onClick={() => { onPick(d); onClose(); }}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

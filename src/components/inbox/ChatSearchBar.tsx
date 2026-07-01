"use client";

import { useEffect, useRef } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";

interface Props {
  query: string;
  onQuery: (v: string) => void;
  activeIdx: number;         // 0-based
  matchCount: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

// Панель поиска внутри чата — прилипает под шапкой чата.
// Enter → следующий, Shift+Enter → предыдущий, Esc → закрыть.
export default function ChatSearchBar({ query, onQuery, activeIdx, matchCount, onPrev, onNext, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px",
        background: "var(--tg-bg-panel)",
        borderBottom: "1px solid var(--tg-border)",
        flexShrink: 0,
      }}
    >
      <Search size={16} style={{ color: "var(--tg-text-secondary)" }} />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) onPrev(); else onNext(); }
          else if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
        placeholder="Искать в этом чате…"
        style={{
          flex: 1,
          background: "var(--tg-bg-input)",
          color: "var(--tg-text)",
          border: "1px solid transparent",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 13,
          outline: "none",
        }}
      />
      <span style={{ fontSize: 12, color: "var(--tg-text-secondary)", minWidth: 44, textAlign: "center" }}>
        {query ? (matchCount === 0 ? "0" : `${activeIdx + 1}/${matchCount}`) : ""}
      </span>
      <button onClick={onPrev} disabled={matchCount === 0} className="inbox-sidebar-btn" style={{ width: 28, height: 28 }} title="Предыдущий (Shift+Enter)">
        <ChevronUp size={16} />
      </button>
      <button onClick={onNext} disabled={matchCount === 0} className="inbox-sidebar-btn" style={{ width: 28, height: 28 }} title="Следующий (Enter)">
        <ChevronDown size={16} />
      </button>
      <button onClick={onClose} className="inbox-sidebar-btn" style={{ width: 28, height: 28 }} title="Закрыть (Esc)">
        <X size={16} />
      </button>
    </div>
  );
}

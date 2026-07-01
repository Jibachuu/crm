"use client";

import { useEffect, useRef, useState } from "react";
import { emojify } from "./emojify";

// Компактный emoji-picker без внешних зависимостей. Список отобран
// вручную (это то что нужно менеджеру для общения с клиентом,
// а не 3000 unicode-emoji с флагами стран). Категории —
// табы сверху, поиск по названию в футере.

const CATEGORIES: { id: string; label: string; emojis: string[] }[] = [
  {
    id: "smileys",
    label: "Смайлы",
    emojis: [
      "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇",
      "🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚",
      "😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥳",
      "😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖",
      "😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯",
      "😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔",
      "🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦",
      "😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴",
      "🤢","🤮","🤧","😷","🤒","🤕","🤑","🤠","😈","👿",
    ],
  },
  {
    id: "gesture",
    label: "Жесты",
    emojis: [
      "👍","👎","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙",
      "👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋",
      "🤝","👏","🙌","🙏","🤲","💪","🦾","✍️","💅","🤳",
      "🫡","🫰","🫶","🫵","🫱","🫲","🫳","🫴",
    ],
  },
  {
    id: "hearts",
    label: "Сердца",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️",
    ],
  },
  {
    id: "objects",
    label: "Объекты",
    emojis: [
      "✅","❌","⚠️","❗","❓","❕","❔","💯","🔥","⭐",
      "✨","🎉","🎊","🎁","🎂","🎈","🏆","🥇","🥈","🥉",
      "📞","📱","💻","⌨️","🖥️","🖨️","📷","📹","🎥","💡",
      "📎","📌","📍","🗓️","📅","📆","🕐","⏰","⏳","💰",
      "💵","💳","💎","🔑","🔐","📧","✉️","📬","📤","📥",
    ],
  },
];

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
  anchorEl?: HTMLElement | null;
}

export default function EmojiPicker({ onPick, onClose, anchorEl }: Props) {
  const [cat, setCat] = useState(CATEGORIES[0].id);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl?.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorEl]);

  const activeCat = CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[0];
  const emojis = q.trim() ? CATEGORIES.flatMap((c) => c.emojis) : activeCat.emojis;

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        bottom: 56,
        right: 8,
        width: 340,
        maxHeight: 380,
        background: "var(--tg-bg-panel)",
        border: "1px solid var(--tg-border-subtle)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 60,
      }}
    >
      <div style={{ display: "flex", gap: 2, padding: 4, borderBottom: "1px solid var(--tg-border-subtle)" }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            style={{
              flex: 1, padding: "6px 4px",
              background: cat === c.id ? "var(--tg-bg-panel-hover)" : "transparent",
              color: cat === c.id ? "var(--tg-text)" : "var(--tg-text-secondary)",
              border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--tg-border-subtle)" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти эмодзи…"
          style={{ width: "100%", fontSize: 13, padding: "6px 10px" }}
        />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gap: 2,
        padding: 8,
        overflowY: "auto",
        flex: 1,
      }}>
        {emojis.map((e, i) => (
          <button
            key={`${e}-${i}`}
            onClick={() => onPick(e)}
            style={{
              padding: 4, fontSize: 22, background: "transparent",
              border: "none", cursor: "pointer", borderRadius: 6,
              transition: "background-color 0.1s",
              lineHeight: 1,
            }}
            onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--tg-bg-panel-hover)")}
            onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
          >
            {emojify(e)}
          </button>
        ))}
      </div>
    </div>
  );
}

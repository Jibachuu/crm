"use client";

import { useEffect, useRef } from "react";
import { Reply, Copy, Pencil, Trash2, Link2 } from "lucide-react";

interface Item {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: Item[];
  onClose: () => void;
}

// Контекстное меню сообщения. Позиционируется у курсора, закрывается
// по клику вне / Escape. Пункты передаём массивом — родитель решает
// что показать (Ответить / Копировать / Редактировать / Удалить / т.п.).
export default function MessageContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Корректировка позиции если меню выходит за экран
  const style: React.CSSProperties = { position: "fixed", left: x, top: y, zIndex: 1000 };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth) el.style.left = window.innerWidth - r.width - 8 + "px";
    if (r.bottom > window.innerHeight) el.style.top = window.innerHeight - r.height - 8 + "px";
  }, []);

  return (
    <div
      ref={ref}
      style={{
        ...style,
        background: "var(--tg-bg-panel)",
        border: "1px solid var(--tg-border-subtle)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        padding: 4,
        minWidth: 200,
        transformOrigin: "top left",
        animation: "ctx-menu-in 0.16s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <style>{`
        @keyframes ctx-menu-in {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <button
            key={i}
            onClick={() => { it.onClick(); onClose(); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 14px",
              width: "100%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: it.danger ? "#ff6b6b" : "var(--tg-text)",
              fontSize: 14,
              borderRadius: 7,
              textAlign: "left",
              transition: "background-color 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = it.danger ? "rgba(255,107,107,0.14)" : "var(--tg-bg-panel-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Icon size={16} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// Экспорт иконок для родителей — чтобы не таскать lucide в них
export const MenuIcons = { Reply, Copy, Pencil, Trash2, Link2 };

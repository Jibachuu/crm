"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, X, Info, AlertTriangle } from "lucide-react";

type Kind = "success" | "error" | "info" | "warn";

interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

interface Ctx {
  show: (text: string, kind?: Kind) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
  warn: (text: string) => void;
}

const ToastContext = createContext<Ctx | null>(null);

const KIND_ICON: Record<Kind, React.ComponentType<{ size?: number }>> = {
  success: Check,
  error: X,
  info: Info,
  warn: AlertTriangle,
};
const KIND_COLOR: Record<Kind, string> = {
  success: "#a8dc9c",
  error: "#ff6b6b",
  info: "#6ab7ff",
  warn: "#ffab6b",
};

const AUTO_DISMISS_MS = 3500;

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((text: string, kind: Kind = "info") => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const ctx: Ctx = {
    show,
    success: (t) => show(t, "success"),
    error: (t) => show(t, "error"),
    info: (t) => show(t, "info"),
    warn: (t) => show(t, "warn"),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 9999,
        pointerEvents: "none",
      }}>
        {toasts.map((t) => {
          const Icon = KIND_ICON[t.kind];
          const color = KIND_COLOR[t.kind];
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                background: "var(--tg-bg-panel, #17212b)",
                color: "var(--tg-text, #fff)",
                border: `1px solid ${color}55`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 8,
                boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
                fontSize: 13,
                minWidth: 220,
                maxWidth: 400,
                animation: "toast-in 0.18s ease-out",
                pointerEvents: "auto",
                cursor: "default",
              }}
              onClick={() => dismiss(t.id)}
            >
              <Icon size={16} />
              <span style={{ flex: 1 }}>{t.text}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

// Хук с безопасным fallback — если провайдер не смонтирован, no-op вместо
// краша. Так компоненты, живущие вне ToasterProvider (например в карточке
// сделки), не ломаются.
export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  const noop = () => {};
  const asFn = () => noop;
  return { show: asFn(), success: asFn(), error: asFn(), info: asFn(), warn: asFn() };
}

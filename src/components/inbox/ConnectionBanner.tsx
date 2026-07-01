"use client";

import { WifiOff, Loader2 } from "lucide-react";
import type { ConnectionState } from "./useInboxStream";

interface Props {
  state: ConnectionState;
}

// Тонкая полоска сверху с индикатором соединения. Показывается
// только когда connecting/disconnected — в connected-состоянии
// молча пропадает, чтобы не отвлекать.
export default function ConnectionBanner({ state }: Props) {
  if (state === "connected") return null;
  const disconnected = state === "disconnected";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 500,
        background: disconnected ? "rgba(255, 152, 0, 0.15)" : "var(--tg-bg-panel)",
        color: disconnected ? "#ffb74d" : "var(--tg-text-secondary)",
        borderBottom: "1px solid var(--tg-border)",
      }}
    >
      {disconnected ? <WifiOff size={13} /> : <Loader2 size={13} className="animate-spin" />}
      {disconnected ? "Соединение потеряно. Переподключаемся…" : "Подключаемся к серверу…"}
    </div>
  );
}

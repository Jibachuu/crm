"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionState = "connecting" | "connected" | "disconnected";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dialog = any;

interface Options {
  onFullSync: (dialogs: Dialog[]) => void;
  onDelta: (changed: Dialog[], removed: string[]) => void;
  enabled?: boolean;
}

// Клиентский хук для /api/inbox/stream. Открывает EventSource, слушает
// события `full` / `delta` / `bye`, автоматически переподключается
// с exponential backoff при потере связи.
export function useInboxStream({ onFullSync, onDelta, enabled = true }: Options) {
  const [state, setState] = useState<ConnectionState>("connecting");
  const esRef = useRef<EventSource | null>(null);
  const retryDelayRef = useRef(1000);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onFullSyncRef = useRef(onFullSync);
  const onDeltaRef = useRef(onDelta);
  useEffect(() => { onFullSyncRef.current = onFullSync; }, [onFullSync]);
  useEffect(() => { onDeltaRef.current = onDelta; }, [onDelta]);

  const connect = useCallback(() => {
    if (!enabled) return;
    setState("connecting");

    const es = new EventSource("/api/inbox/stream");
    esRef.current = es;

    es.addEventListener("connected", () => {
      setState("connected");
      retryDelayRef.current = 1000;
    });

    es.addEventListener("full", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        onFullSyncRef.current(data.dialogs ?? []);
      } catch { /* skip */ }
    });

    es.addEventListener("delta", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        onDeltaRef.current(data.changed ?? [], data.removed ?? []);
      } catch { /* skip */ }
    });

    es.addEventListener("bye", () => {
      // Сервер завершил сессию (тайм-аут) — переподключаемся сразу.
      es.close();
      esRef.current = null;
      setState("connecting");
      retryTimerRef.current = setTimeout(connect, 100);
    });

    es.onerror = () => {
      // EventSource пытается переподключиться сам, но если браузер
      // висит на re-try и мы хотим показать индикатор — форсим
      // управление сами: закрываем, ждём и переоткрываем с backoff.
      setState("disconnected");
      es.close();
      esRef.current = null;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 1.6, 30000);
      retryTimerRef.current = setTimeout(connect, delay);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };
  }, [connect, enabled]);

  return { state };
}

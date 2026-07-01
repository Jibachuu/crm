"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Options<M> {
  messages: M[];
  getText: (msg: M) => string;
  getId: (msg: M) => string | number;
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
}

// Хук поиска по ленте сообщений. Возвращает:
// - matchIds: массив ID сообщений в порядке от старых к новым (для навигации ↑↓)
// - activeIdx: текущее активное совпадение
// - setActive: перейти к N-му
// - next/prev: сдвиг активного
// - Автоскролл к активному совпадению
export function useChatSearch<M>({ messages, getText, getId, enabled, containerRef }: Options<M>) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const matchIds = useMemo(() => {
    if (!enabled || !query.trim()) return [] as string[];
    const q = query.toLowerCase();
    const ids: string[] = [];
    for (const m of messages) {
      const t = getText(m).toLowerCase();
      if (t.includes(q)) ids.push(String(getId(m)));
    }
    return ids;
  }, [messages, query, enabled, getText, getId]);

  const matchIdSet = useMemo(() => new Set(matchIds), [matchIds]);

  // Сбрасываем активный при смене результата
  useEffect(() => {
    if (activeIdx >= matchIds.length) setActiveIdx(Math.max(0, matchIds.length - 1));
  }, [matchIds.length, activeIdx]);

  // Автоскролл к активному
  const lastActiveRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const targetId = matchIds[activeIdx];
    if (!targetId) return;
    if (lastActiveRef.current === targetId) return;
    lastActiveRef.current = targetId;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(targetId)}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx, matchIds, enabled, containerRef]);

  function next() {
    if (matchIds.length === 0) return;
    setActiveIdx((i) => (i + 1) % matchIds.length);
  }
  function prev() {
    if (matchIds.length === 0) return;
    setActiveIdx((i) => (i - 1 + matchIds.length) % matchIds.length);
  }

  return {
    query, setQuery,
    activeIdx, setActiveIdx,
    matchIds, matchIdSet,
    activeId: matchIds[activeIdx] as string | undefined,
    next, prev,
  };
}

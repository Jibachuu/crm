"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import DateSeparator, { formatDateSep, isSameDay } from "./DateSeparator";

interface MessageLike {
  id: string | number;
  unix: number; // seconds
}

interface Props<M extends MessageLike> {
  messages: M[];
  renderMessage: (msg: M, ctx: { isFirstOfGroup: boolean; isLastOfGroup: boolean; prev: M | null; next: M | null }) => ReactNode;
  isOwn: (msg: M) => boolean;
  autoAnchorBottom?: boolean;   // при новых сообщениях снизу
  loading?: boolean;
  emptyMessage?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  scrollKey?: string;           // при смене чата — форсим скролл вниз
}

// Обёртка над лентой сообщений. Отвечает за:
// - Разделители по датам (sticky)
// - Плавающая дата сверху при скролле
// - Auto-scroll вниз когда пришло новое (только если пользователь и так внизу)
// - Пагинацию вверх (onLoadMore при скролле в топ)
// - Правильную группировку (isFirstOfGroup / isLastOfGroup) — 5 минут
//   между сообщениями от одного отправителя = одна группа.
export default function MessagesList<M extends MessageLike>({
  messages, renderMessage, isOwn,
  autoAnchorBottom = true, loading, emptyMessage,
  onLoadMore, hasMore, scrollKey,
}: Props<M>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const lastCountRef = useRef(0);
  const [floatingDate, setFloatingDate] = useState<string | null>(null);
  const floatingDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // При смене чата — скролл сразу в самый низ.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    wasAtBottomRef.current = true;
  }, [scrollKey]);

  // При новых сообщениях — если пользователь стоял внизу, скролл вниз.
  // Если он был в середине истории — не сдвигаем (иначе теряется контекст).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const newCount = messages.length;
    const wasAtBottom = wasAtBottomRef.current;
    if (autoAnchorBottom && wasAtBottom && newCount > lastCountRef.current) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
    lastCountRef.current = newCount;
  }, [messages.length, autoAnchorBottom]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    wasAtBottomRef.current = remaining < 24;

    // Пагинация вверх
    if (hasMore && onLoadMore && el.scrollTop < 100) {
      onLoadMore();
    }

    // Floating-date: находим первое видимое сообщение и показываем его дату
    const rows = el.querySelectorAll<HTMLElement>("[data-msg-unix]");
    const scrollTop = el.scrollTop;
    let visibleUnix: number | null = null;
    for (const row of Array.from(rows)) {
      if (row.offsetTop >= scrollTop) {
        visibleUnix = Number(row.dataset.msgUnix);
        break;
      }
    }
    if (visibleUnix) {
      setFloatingDate(formatDateSep(visibleUnix));
      if (floatingDateTimerRef.current) clearTimeout(floatingDateTimerRef.current);
      floatingDateTimerRef.current = setTimeout(() => setFloatingDate(null), 1500);
    }
  }

  useEffect(() => {
    return () => { if (floatingDateTimerRef.current) clearTimeout(floatingDateTimerRef.current); };
  }, []);

  if (loading && messages.length === 0) {
    return (
      <div className="inbox-messages" ref={scrollerRef}>
        <div style={{ margin: "auto", color: "var(--tg-text-secondary)", fontSize: 13 }}>
          Загрузка сообщений...
        </div>
      </div>
    );
  }

  if (!loading && messages.length === 0) {
    return (
      <div className="inbox-messages" ref={scrollerRef}>
        <div style={{ margin: "auto", color: "var(--tg-text-secondary)", fontSize: 13 }}>
          {emptyMessage ?? "Нет сообщений"}
        </div>
      </div>
    );
  }

  return (
    <>
      {floatingDate && (
        <div className={`inbox-date-floating is-visible`}>{floatingDate}</div>
      )}
      <div className="inbox-messages" ref={scrollerRef} onScroll={onScroll}>
        <div className="inbox-messages-inner">
          {messages.map((m, i) => {
            const prev = i > 0 ? messages[i - 1] : null;
            const next = i < messages.length - 1 ? messages[i + 1] : null;
            const sameSenderAsPrev = prev && isOwn(prev) === isOwn(m);
            const sameSenderAsNext = next && isOwn(next) === isOwn(m);
            const closeToPrev = prev && Math.abs(m.unix - prev.unix) < 5 * 60;
            const closeToNext = next && Math.abs(next.unix - m.unix) < 5 * 60;
            const isFirstOfGroup = !prev || !sameSenderAsPrev || !closeToPrev;
            const isLastOfGroup = !next || !sameSenderAsNext || !closeToNext;
            const needsDateSep = !prev || !isSameDay(prev.unix, m.unix);
            return (
              <div key={m.id} data-msg-unix={m.unix}>
                {needsDateSep && <DateSeparator unix={m.unix} />}
                <div className={isFirstOfGroup ? "first-of-group" : ""}>
                  {renderMessage(m, { isFirstOfGroup, isLastOfGroup, prev, next })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

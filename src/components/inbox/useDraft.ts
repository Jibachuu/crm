"use client";

import { useEffect, useState } from "react";

// Хранилка черновиков в localStorage. Ключ — идентификатор чата
// (peer для TG, chatId для MAX). Когда менеджер набирает ответ,
// переключается на другой чат, потом возвращается — текст на месте.
// Пустой draft (после очистки) удаляется из хранилища, чтобы не
// плодить мусор.

const STORAGE_PREFIX = "inbox:draft:";

function safeGet(key: string): string {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(STORAGE_PREFIX + key) ?? ""; } catch { return ""; }
}

function safeSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(STORAGE_PREFIX + key, value);
    else window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch { /* quota / private mode — тихо забиваем */ }
}

export function useDraft(chatKey: string): [string, (v: string) => void, () => void] {
  const [text, setText] = useState<string>(() => safeGet(chatKey));

  // Смена чата — подгружаем свой draft
  useEffect(() => { setText(safeGet(chatKey)); }, [chatKey]);

  // Debounce записи, чтобы не долбить localStorage на каждый символ
  useEffect(() => {
    const t = setTimeout(() => safeSet(chatKey, text), 250);
    return () => clearTimeout(t);
  }, [chatKey, text]);

  function clear() {
    setText("");
    safeSet(chatKey, "");
  }

  return [text, setText, clear];
}

// Быстрая проверка «есть ли draft для чата» — для отображения
// «Черновик: …» в списке чатов. Возвращает первые N символов.
export function peekDraft(chatKey: string, maxLen = 40): string {
  const v = safeGet(chatKey);
  if (!v) return "";
  return v.length > maxLen ? v.slice(0, maxLen) + "…" : v;
}

"use client";

import { useEffect, useRef } from "react";

// Рисует цифру непрочитанных прямо на favicon. При count=0 возвращаем
// оригинальную иконку. Использует canvas, чтобы не таскать 10 разных
// PNG-иконок с цифрами.

let baseHref: string | null = null;

function ensureBase() {
  if (baseHref) return baseHref;
  if (typeof document === "undefined") return null;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  baseHref = link?.href ?? "/favicon.ico";
  return baseHref;
}

function setFaviconDataUrl(dataUrl: string) {
  if (typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/png";
  link.href = dataUrl;
}

function resetFavicon() {
  const base = ensureBase();
  if (!base) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = base;
}

function drawFaviconWithCount(count: number) {
  if (typeof document === "undefined" || count <= 0) return null;
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Фон — тёмный кружок как у TG
  ctx.fillStyle = "#17212b";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Цифра. Если >99, показываем «99+»
  const label = count > 99 ? "99+" : String(count);
  ctx.fillStyle = "#6ab7ff";
  ctx.font = `bold ${label.length >= 3 ? 12 : 18}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, size / 2, size / 2 + 1);

  return canvas.toDataURL("image/png");
}

export function useTabBadge(unreadCount: number, baseTitle = "Inbox") {
  const prevRef = useRef(0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (unreadCount === prevRef.current) return;
    prevRef.current = unreadCount;

    // Favicon
    if (unreadCount > 0) {
      const url = drawFaviconWithCount(unreadCount);
      if (url) setFaviconDataUrl(url);
    } else {
      resetFavicon();
    }

    // Заголовок вкладки
    const suffix = " — CRM Артево";
    if (unreadCount > 0) {
      document.title = `(${unreadCount > 99 ? "99+" : unreadCount}) ${baseTitle}${suffix}`;
    } else {
      document.title = `${baseTitle}${suffix}`;
    }
  }, [unreadCount, baseTitle]);

  // На unmount возвращаем исходное состояние
  useEffect(() => {
    return () => {
      resetFavicon();
      if (typeof document !== "undefined") document.title = "CRM Артево";
    };
  }, []);
}

import React from "react";
import emojiRegex from "emoji-regex";

// Заменяем нативные emoji-глифы (у клиента Windows это Segoe UI Emoji,
// на Linux — Noto) на PNG-эмодзи Apple, которые уже используются в TG
// и iOS-сообщениях. Раздаём с jsdelivr-CDN — не тащим 100МБ картинок
// в бандл. Один запрос на emoji, дальше в браузерном кеше.
//
// Codepoint-строка = hex-коды каждого codepoint через "-".
// Например 👨‍👩‍👧 = 1f468-200d-1f469-200d-1f467.
// Специально для Apple используем формат emoji-datasource-apple:
// https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15/img/apple/64/<codepoints>.png
//
// Кэшируем регексп/матч на компонент через useMemo не надо — тут вызов
// per-message, не тяжелая работа.

// Self-hosted: PNG-эмодзи копируются в public/apple-emoji/ через
// scripts/copy-emojis.js в postinstall — раздаются с нашего домена
// (jsdelivr иногда режется российскими провайдерами → падало на
// native Segoe UI Emoji).
const BASE = "/apple-emoji";

function codepointsFull(str: string): string {
  const cps: string[] = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    cps.push(cp.toString(16));
  }
  return cps.join("-");
}

function codepointsStripFE0F(str: string): string {
  const cps: string[] = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp === 0xfe0f) continue;
    cps.push(cp.toString(16));
  }
  return cps.join("-");
}

export function emojify(text: string): React.ReactNode[] {
  if (!text) return [];
  const regex = emojiRegex();
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const glyph = match[0];
    const withFE0F = codepointsFull(glyph);
    const withoutFE0F = codepointsStripFE0F(glyph);
    if (withFE0F) {
      nodes.push(
        <img
          key={`e${match.index}`}
          src={`${BASE}/${withFE0F}.png`}
          alt={glyph}
          draggable={false}
          data-fallback={withoutFE0F !== withFE0F ? withoutFE0F : ""}
          style={{
            display: "inline-block",
            width: "1.2em",
            height: "1.2em",
            verticalAlign: "-0.2em",
            objectFit: "contain",
          }}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            const fallback = img.dataset.fallback;
            if (fallback && !img.dataset.retried) {
              img.dataset.retried = "1";
              img.src = `${BASE}/${fallback}.png`;
              return;
            }
            const parent = img.parentNode;
            if (parent) parent.replaceChild(document.createTextNode(glyph), img);
          }}
        />
      );
    } else {
      nodes.push(glyph);
    }
    lastIndex = match.index + glyph.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

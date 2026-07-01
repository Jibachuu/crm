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

const CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15/img/apple/64";

function toCodePointsHex(str: string): string {
  const cps: string[] = [];
  for (const ch of str) {
    // Apple sprite не содержит variation selector (fe0f) — убираем,
    // иначе URL не находит спрайт. TG делает то же самое.
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp === 0xfe0f) continue;
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
    const codepoint = toCodePointsHex(glyph);
    if (codepoint) {
      nodes.push(
        <img
          key={`e${match.index}`}
          src={`${CDN}/${codepoint}.png`}
          alt={glyph}
          draggable={false}
          style={{
            display: "inline-block",
            width: "1.2em",
            height: "1.2em",
            verticalAlign: "-0.2em",
            objectFit: "contain",
          }}
          onError={(e) => {
            // Если Apple-сетка не содержит этот emoji — fallback на native
            const img = e.currentTarget;
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

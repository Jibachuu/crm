import React from "react";
import { emojify } from "./emojify";

// Простой markdown-подобный парсер сообщений — bold/italic/code/strike
// плюс URL-ссылки. Достаточно для «дорогого» ощущения без грузных
// либ вроде marked/remark в бандле.
//
// Правила (совпадают с TG):
//   **жирный**      → <b>
//   __курсив__      → <i>
//   `код`           → <code>
//   ~~зачёркнутый~~ → <s>
//   ||спойлер||     → <span class=spoiler>
//   http(s)://…     → <a target=_blank>
//
// Парсинг однопроходный: сначала находим все ссылки, потом форматирование
// в остальных сегментах. Ссылки не пересекаются с ** — если URL внутри
// **bold**, `**` обломается на границе URL и не превратится в жирный
// (маловероятно, поэтому не паримся).

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

interface Segment {
  kind: "text" | "url";
  value: string;
}

function splitByUrls(input: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(input)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: input.slice(last, m.index) });
    out.push({ kind: "url", value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ kind: "text", value: input.slice(last) });
  return out;
}

// Обрабатывает одну текстовую пачку — разбирает жирный/курсив/код/зачёркн/спойлер
function renderFormatted(text: string, keyPrefix: string): React.ReactNode[] {
  // Порядок: сначала markdown-разметка, потом эмодзи. Emoji-parser
  // работает над плоскими текстовыми пачками — html-разметку не трогает.
  const rules: { re: RegExp; wrap: (inner: React.ReactNode, k: string) => React.ReactNode }[] = [
    { re: /\*\*([^*][^*]*)\*\*/, wrap: (inner, k) => <b key={k}>{inner}</b> },
    { re: /__([^_][^_]*)__/, wrap: (inner, k) => <i key={k}>{inner}</i> },
    { re: /`([^`]+)`/, wrap: (inner, k) => <code key={k} style={{ background: "rgba(255,255,255,0.08)", padding: "0 4px", borderRadius: 3, fontFamily: "SFMono-Regular, Consolas, monospace", fontSize: "0.92em" }}>{inner}</code> },
    { re: /~~([^~]+)~~/, wrap: (inner, k) => <s key={k}>{inner}</s> },
    { re: /\|\|([^|]+)\|\|/, wrap: (inner, k) => <span key={k} className="tg-spoiler" style={{ background: "rgba(255,255,255,0.12)", borderRadius: 4, padding: "0 4px", cursor: "pointer" }}>{inner}</span> },
  ];

  function inner(str: string, k: string): React.ReactNode[] {
    for (let i = 0; i < rules.length; i++) {
      const { re, wrap } = rules[i];
      const m = re.exec(str);
      if (m) {
        const before = str.slice(0, m.index);
        const inside = m[1];
        const after = str.slice(m.index + m[0].length);
        return [
          ...(before ? inner(before, k + "b") : []),
          wrap(inner(inside, k + "w"), k + "w"),
          ...(after ? inner(after, k + "a") : []),
        ];
      }
    }
    // Финальная фаза — заменяем нативные emoji на Apple-PNG
    return emojify(str);
  }

  return inner(text, keyPrefix);
}

export function formatMessageText(text: string): React.ReactNode[] {
  if (!text) return [];
  const parts = splitByUrls(text);
  return parts.map((p, i) => {
    if (p.kind === "url") {
      return (
        <a
          key={`u${i}`}
          href={p.value}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--tg-text-link)", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {p.value}
        </a>
      );
    }
    return <React.Fragment key={`t${i}`}>{renderFormatted(p.value, `t${i}`)}</React.Fragment>;
  });
}

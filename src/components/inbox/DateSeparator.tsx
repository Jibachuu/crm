"use client";

interface Props {
  unix: number; // seconds
}

export function formatDateSep(unix: number) {
  const d = new Date(unix * 1000);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";

  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
  });
}

export function isSameDay(a: number, b: number) {
  const da = new Date(a * 1000);
  const db = new Date(b * 1000);
  return da.toDateString() === db.toDateString();
}

export default function DateSeparator({ unix }: Props) {
  return <div className="inbox-date-sticker">{formatDateSep(unix)}</div>;
}

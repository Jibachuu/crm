"use client";

import { useState, useEffect } from "react";

const REGION_TZ: Record<string, string> = {
  "москва": "Europe/Moscow", "санкт-петербург": "Europe/Moscow", "спб": "Europe/Moscow",
  "казань": "Europe/Moscow", "нижний новгород": "Europe/Moscow", "самара": "Europe/Samara",
  "уфа": "Asia/Yekaterinburg", "екатеринбург": "Asia/Yekaterinburg", "челябинск": "Asia/Yekaterinburg",
  "пермь": "Asia/Yekaterinburg", "тюмень": "Asia/Yekaterinburg",
  "омск": "Asia/Omsk", "новосибирск": "Asia/Novosibirsk", "барнаул": "Asia/Barnaul",
  "красноярск": "Asia/Krasnoyarsk", "иркутск": "Asia/Irkutsk",
  "якутск": "Asia/Yakutsk", "владивосток": "Asia/Vladivostok",
  "хабаровск": "Asia/Vladivostok", "южно-сахалинск": "Asia/Sakhalin",
  "петропавловск-камчатский": "Asia/Kamchatka",
  "калининград": "Europe/Kaliningrad", "сочи": "Europe/Moscow", "краснодар": "Europe/Moscow",
  "ростов-на-дону": "Europe/Moscow", "воронеж": "Europe/Moscow", "волгоград": "Europe/Volgograd",
  "саратов": "Europe/Saratov",
};

export function getTimezoneFromRegion(region: string): string | null {
  if (!region) return null;
  const lower = region.toLowerCase().trim();
  for (const [key, tz] of Object.entries(REGION_TZ)) {
    if (lower.includes(key)) return tz;
  }
  return "Europe/Moscow"; // default
}

export default function ClientTimeIndicator({ timezone, region }: { timezone?: string; region?: string }) {
  const tz = timezone || getTimezoneFromRegion(region ?? "");
  const [time, setTime] = useState("");
  const [color, setColor] = useState("#888");
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (!tz) return;
    function update() {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("ru-RU", { timeZone: tz!, hour: "2-digit", minute: "2-digit" });
      const timeStr = formatter.format(now);
      setTime(timeStr);

      const hourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: tz!, hour: "numeric", hour12: false });
      const hour = parseInt(hourFormatter.format(now));

      if (hour >= 9 && hour < 18) { setColor("#2e7d32"); setHint("Можно писать"); }
      else if ((hour >= 8 && hour < 9) || (hour >= 18 && hour < 20)) { setColor("#e65c00"); setHint("Лучше позже"); }
      else { setColor("#c62828"); setHint("Не беспокоить"); }
    }
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [tz]);

  if (!tz || !time) return null;

  // Calculate offset from Moscow
  const mskOffset = 3;
  const now = new Date();
  const clientHour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now));
  const mskHour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", hour: "numeric", hour12: false }).format(now));
  const diff = clientHour - mskHour;
  const offsetStr = diff === 0 ? "МСК" : `МСК${diff > 0 ? "+" : ""}${diff}`;

  return (
    <div className="flex items-center gap-2 text-xs" title={hint}>
      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span style={{ color: "#666" }}>У клиента: <strong style={{ color }}>{time}</strong> ({offsetStr})</span>
    </div>
  );
}

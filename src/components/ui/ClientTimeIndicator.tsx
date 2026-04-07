"use client";

import { useState, useEffect } from "react";

const REGION_TZ: Record<string, string> = {
  // МСК (UTC+3)
  "москва": "Europe/Moscow", "санкт-петербург": "Europe/Moscow", "спб": "Europe/Moscow", "петербург": "Europe/Moscow",
  "казань": "Europe/Moscow", "нижний новгород": "Europe/Moscow", "нижегородск": "Europe/Moscow",
  "сочи": "Europe/Moscow", "краснодар": "Europe/Moscow", "ростов": "Europe/Moscow",
  "воронеж": "Europe/Moscow", "тула": "Europe/Moscow", "рязань": "Europe/Moscow",
  "ярославль": "Europe/Moscow", "тверь": "Europe/Moscow", "иваново": "Europe/Moscow",
  "кострома": "Europe/Moscow", "владимир": "Europe/Moscow", "смоленск": "Europe/Moscow",
  "брянск": "Europe/Moscow", "курск": "Europe/Moscow", "орёл": "Europe/Moscow", "орел": "Europe/Moscow",
  "белгород": "Europe/Moscow", "тамбов": "Europe/Moscow", "пенза": "Europe/Moscow",
  "липецк": "Europe/Moscow", "архангельск": "Europe/Moscow", "вологда": "Europe/Moscow",
  "мурманск": "Europe/Moscow", "петрозаводск": "Europe/Moscow", "сыктывкар": "Europe/Moscow",
  "псков": "Europe/Moscow", "великий новгород": "Europe/Moscow", "новгород": "Europe/Moscow",
  "чебоксары": "Europe/Moscow", "йошкар-ола": "Europe/Moscow", "саранск": "Europe/Moscow",
  "ульяновск": "Europe/Moscow", "киров": "Europe/Moscow", "махачкала": "Europe/Moscow",
  "грозный": "Europe/Moscow", "ставрополь": "Europe/Moscow", "пятигорск": "Europe/Moscow",
  // Калининград (UTC+2)
  "калининград": "Europe/Kaliningrad",
  // Самара (UTC+4)
  "самара": "Europe/Samara", "ижевск": "Europe/Samara", "оренбург": "Europe/Samara",
  // Волгоград / Саратов (UTC+3 / +4)
  "волгоград": "Europe/Volgograd", "саратов": "Europe/Saratov", "астрахань": "Europe/Astrakhan",
  // Екатеринбург (UTC+5)
  "екатеринбург": "Asia/Yekaterinburg", "челябинск": "Asia/Yekaterinburg",
  "уфа": "Asia/Yekaterinburg", "пермь": "Asia/Yekaterinburg", "тюмень": "Asia/Yekaterinburg",
  "курган": "Asia/Yekaterinburg", "магнитогорск": "Asia/Yekaterinburg",
  // Омск (UTC+6)
  "омск": "Asia/Omsk",
  // Новосибирск/Барнаул (UTC+7)
  "новосибирск": "Asia/Novosibirsk", "барнаул": "Asia/Barnaul", "томск": "Asia/Tomsk",
  "кемерово": "Asia/Novokuznetsk", "новокузнецк": "Asia/Novokuznetsk",
  // Красноярск (UTC+7)
  "красноярск": "Asia/Krasnoyarsk", "абакан": "Asia/Krasnoyarsk", "норильск": "Asia/Krasnoyarsk",
  // Иркутск (UTC+8)
  "иркутск": "Asia/Irkutsk", "улан-удэ": "Asia/Irkutsk", "чита": "Asia/Chita",
  // Якутск (UTC+9)
  "якутск": "Asia/Yakutsk", "благовещенск": "Asia/Yakutsk",
  // Владивосток (UTC+10)
  "владивосток": "Asia/Vladivostok", "хабаровск": "Asia/Vladivostok",
  "южно-сахалинск": "Asia/Sakhalin", "сахалин": "Asia/Sakhalin",
  // Камчатка (UTC+12)
  "петропавловск-камчатский": "Asia/Kamchatka", "камчатка": "Asia/Kamchatka",
};

export function getTimezoneFromRegion(region: string): string | null {
  if (!region) return null;
  const lower = region.toLowerCase().trim();
  for (const [key, tz] of Object.entries(REGION_TZ)) {
    if (lower.includes(key)) return tz;
  }
  return "Europe/Moscow"; // default
}

export default function ClientTimeIndicator({ timezone, region, address }: { timezone?: string; region?: string; address?: string }) {
  const tz = timezone || getTimezoneFromRegion(region ?? "") || getTimezoneFromRegion(address ?? "");
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

"use client";

import { useState, useEffect } from "react";

// Lookup by city OR region (subject of federation). The key is matched as a
// substring of the input, so "Республика Алтай" matches the "алтай" key
// even when only the region (not the city/village) is filled in. Crucial
// for сёла that aren't in the dictionary — Рустем's case 24.04 was
// "Айзынкое (Республика Алтай)" silently falling back to МСК.
const REGION_TZ: Record<string, string> = {
  // МСК (UTC+3) — cities
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
  // МСК — regions (subjects)
  "адыгея": "Europe/Moscow", "карелия": "Europe/Moscow", "коми": "Europe/Moscow",
  "марий эл": "Europe/Moscow", "мордовия": "Europe/Moscow", "татарстан": "Europe/Moscow",
  "чувашия": "Europe/Moscow", "дагестан": "Europe/Moscow", "ингушетия": "Europe/Moscow",
  "кабардино-балкар": "Europe/Moscow", "карачаево-черкес": "Europe/Moscow",
  "северная осетия": "Europe/Moscow", "алания": "Europe/Moscow", "чеченск": "Europe/Moscow",
  "крым": "Europe/Moscow", "севастополь": "Europe/Moscow",
  // Калининград (UTC+2)
  "калининград": "Europe/Kaliningrad",
  // Самара (UTC+4)
  "самара": "Europe/Samara", "ижевск": "Europe/Samara", "оренбург": "Europe/Samara",
  "удмурт": "Europe/Samara", "самарск": "Europe/Samara",
  // Волгоград / Саратов (UTC+3 / +4)
  "волгоград": "Europe/Volgograd", "саратов": "Europe/Saratov", "астрахань": "Europe/Astrakhan",
  // Екатеринбург (UTC+5)
  "екатеринбург": "Asia/Yekaterinburg", "челябинск": "Asia/Yekaterinburg",
  "уфа": "Asia/Yekaterinburg", "пермь": "Asia/Yekaterinburg", "тюмень": "Asia/Yekaterinburg",
  "курган": "Asia/Yekaterinburg", "магнитогорск": "Asia/Yekaterinburg",
  "башкортостан": "Asia/Yekaterinburg", "пермский": "Asia/Yekaterinburg",
  "свердлов": "Asia/Yekaterinburg", "ханты-мансийск": "Asia/Yekaterinburg",
  "ямало-ненец": "Asia/Yekaterinburg", "югра": "Asia/Yekaterinburg",
  // Омск (UTC+6)
  "омск": "Asia/Omsk", "омская": "Asia/Omsk",
  // Новосибирск (UTC+7)
  "новосибирск": "Asia/Novosibirsk", "барнаул": "Asia/Barnaul", "томск": "Asia/Tomsk",
  "кемерово": "Asia/Novokuznetsk", "новокузнецк": "Asia/Novokuznetsk",
  "горно-алтайск": "Asia/Barnaul", "алтайск": "Asia/Barnaul",
  "алтай": "Asia/Barnaul", "алтайский": "Asia/Barnaul",
  "томская": "Asia/Tomsk", "кемеровск": "Asia/Novokuznetsk", "кузбасс": "Asia/Novokuznetsk",
  // Красноярск (UTC+7)
  "красноярск": "Asia/Krasnoyarsk", "абакан": "Asia/Krasnoyarsk", "норильск": "Asia/Krasnoyarsk",
  "хакас": "Asia/Krasnoyarsk", "тыва": "Asia/Krasnoyarsk", "тува": "Asia/Krasnoyarsk", "кызыл": "Asia/Krasnoyarsk",
  // Иркутск (UTC+8)
  "иркутск": "Asia/Irkutsk", "улан-удэ": "Asia/Irkutsk", "чита": "Asia/Chita",
  "бурят": "Asia/Irkutsk", "забайкальск": "Asia/Chita",
  // Якутск (UTC+9)
  "якутск": "Asia/Yakutsk", "благовещенск": "Asia/Yakutsk",
  "якут": "Asia/Yakutsk", "саха": "Asia/Yakutsk", "амурская": "Asia/Yakutsk",
  // Владивосток (UTC+10)
  "владивосток": "Asia/Vladivostok", "хабаровск": "Asia/Vladivostok",
  "приморск": "Asia/Vladivostok",
  "южно-сахалинск": "Asia/Sakhalin", "сахалин": "Asia/Sakhalin",
  // Магадан (UTC+11)
  "магадан": "Asia/Magadan",
  // Камчатка (UTC+12)
  "петропавловск-камчатский": "Asia/Kamchatka", "камчатка": "Asia/Kamchatka",
  "анадырь": "Asia/Anadyr", "чукот": "Asia/Anadyr",
};

// Manual timezone choices for companies — populates the EditCompanyModal
// dropdown. Order matches Russian Federation time-zone offsets west to east.
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Europe/Kaliningrad", label: "МСК−1 (Калининград)" },
  { value: "Europe/Moscow", label: "МСК (Москва)" },
  { value: "Europe/Samara", label: "МСК+1 (Самара)" },
  { value: "Asia/Yekaterinburg", label: "МСК+2 (Екатеринбург)" },
  { value: "Asia/Omsk", label: "МСК+3 (Омск)" },
  { value: "Asia/Novosibirsk", label: "МСК+4 (Новосибирск)" },
  { value: "Asia/Krasnoyarsk", label: "МСК+4 (Красноярск)" },
  { value: "Asia/Irkutsk", label: "МСК+5 (Иркутск)" },
  { value: "Asia/Yakutsk", label: "МСК+6 (Якутск)" },
  { value: "Asia/Vladivostok", label: "МСК+7 (Владивосток)" },
  { value: "Asia/Magadan", label: "МСК+8 (Магадан)" },
  { value: "Asia/Kamchatka", label: "МСК+9 (Камчатка)" },
];

export function getTimezoneFromRegion(region: string): string | null {
  if (!region) return null;
  const lower = region.toLowerCase().trim();
  // Sort longest keys first so "новокузнецк" beats "кузбасс" and
  // "горно-алтайск" beats "алтай" — substring fallbacks shouldn't shadow
  // a more specific match.
  const sortedKeys = Object.keys(REGION_TZ).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) return REGION_TZ[key];
  }
  return "Europe/Moscow"; // default for unknown locations
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

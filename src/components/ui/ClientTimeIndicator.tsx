"use client";

import { useState, useEffect } from "react";
import { getTimezoneFromRegion, TIMEZONE_OPTIONS } from "@/lib/timezone";

// Re-export so existing imports `from "@/components/ui/ClientTimeIndicator"`
// keep working. New code should import from "@/lib/timezone" directly —
// using this module from a Server Component would crash because of the
// "use client" directive above.
export { getTimezoneFromRegion, TIMEZONE_OPTIONS };

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

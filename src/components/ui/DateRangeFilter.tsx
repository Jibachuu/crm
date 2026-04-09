"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";

interface DateRangeFilterProps {
  onChange: (from: string | null, to: string | null) => void;
}

const PRESETS = [
  { label: "Сегодня", days: 0 },
  { label: "7 дней", days: 7 },
  { label: "30 дней", days: 30 },
  { label: "90 дней", days: 90 },
];

export default function DateRangeFilter({ onChange }: DateRangeFilterProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState(false);

  function apply(f: string, t: string) {
    setFrom(f);
    setTo(t);
    onChange(f || null, t || null);
  }

  function applyPreset(days: number) {
    const now = new Date();
    const t = now.toISOString().slice(0, 10);
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);
    const f = fromDate.toISOString().slice(0, 10);
    apply(f, t);
    setOpen(false);
  }

  function clear() {
    apply("", "");
    setOpen(false);
  }

  const hasFilter = from || to;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors"
        style={{
          border: `1px solid ${hasFilter ? "#0067a5" : "#d0d0d0"}`,
          background: hasFilter ? "#e8f4fd" : "#fff",
          color: hasFilter ? "#0067a5" : "#555",
        }}
      >
        <Calendar size={13} />
        {hasFilter ? `${from || "..."} — ${to || "..."}` : "Период"}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg z-50 p-3 space-y-3"
          style={{ border: "1px solid #e0e0e0", minWidth: 260 }}
        >
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => applyPreset(p.days)}
                className="text-xs px-2.5 py-1 rounded-full hover:bg-blue-50 transition-colors"
                style={{ border: "1px solid #e0e0e0", color: "#555" }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 mb-0.5 block">От</label>
              <input
                type="date"
                value={from}
                onChange={(e) => apply(e.target.value, to)}
                className="w-full text-sm px-2 py-1 rounded focus:outline-none"
                style={{ border: "1px solid #ddd" }}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-0.5 block">До</label>
              <input
                type="date"
                value={to}
                onChange={(e) => apply(from, e.target.value)}
                className="w-full text-sm px-2 py-1 rounded focus:outline-none"
                style={{ border: "1px solid #ddd" }}
              />
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={clear} className="text-xs text-red-500 hover:underline">Сбросить</button>
            <button onClick={() => setOpen(false)} className="text-xs text-blue-600 hover:underline">Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}

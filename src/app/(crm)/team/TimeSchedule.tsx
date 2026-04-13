"use client";

import { useState, useEffect } from "react";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";

interface TimeEntry {
  id: string;
  user_id: string;
  check_in: string;
  check_out: string | null;
  duration_minutes: number | null;
  users?: { full_name: string };
}

interface User {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(minutes: number | null) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}ч ${m}м`;
}

export default function TimeSchedule({ users }: { users: User[] }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekView, setWeekView] = useState(false);

  async function loadEntries(d: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/time-tracking?action=list&date=${d}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch { /* */ }
    setLoading(false);
  }

  useEffect(() => { loadEntries(date); }, [date]);

  function shiftDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  // Build per-user summary
  const activeUsers = users.filter((u) => u.is_active);
  const userEntries = activeUsers.map((user) => {
    const ue = entries.filter((e) => e.user_id === user.id);
    const totalMinutes = ue.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
    const firstIn = ue.length > 0 ? ue.reduce((min, e) => e.check_in < min ? e.check_in : min, ue[0].check_in) : null;
    const lastOut = ue.filter((e) => e.check_out).length > 0
      ? ue.filter((e) => e.check_out).reduce((max, e) => (e.check_out! > max ? e.check_out! : max), "")
      : null;
    const isActive = ue.some((e) => !e.check_out);
    return { user, entries: ue, totalMinutes, firstIn, lastOut, isActive };
  });

  const dayLabel = new Date(date).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Clock size={20} style={{ color: "#0067a5" }} />
        <h2 className="text-lg font-semibold" style={{ color: "#333" }}>Расписание</h2>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => shiftDate(-1)} className="p-1.5 rounded hover:bg-gray-100">
          <ChevronLeft size={16} style={{ color: "#555" }} />
        </button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="text-sm px-3 py-1.5 rounded focus:outline-none"
          style={{ border: "1px solid #d0d0d0" }} />
        <button onClick={() => shiftDate(1)} className="p-1.5 rounded hover:bg-gray-100">
          <ChevronRight size={16} style={{ color: "#555" }} />
        </button>
        <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
          className="text-xs px-2 py-1 rounded hover:bg-blue-50" style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}>
          Сегодня
        </button>
        <span className="text-sm capitalize" style={{ color: "#888" }}>{dayLabel}</span>
      </div>

      {loading ? (
        <p className="text-sm text-center py-8" style={{ color: "#aaa" }}>Загрузка...</p>
      ) : (
        <div className="bg-white rounded-lg overflow-hidden" style={{ border: "1px solid #e4e4e4" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e4" }}>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: "#888" }}>Сотрудник</th>
                <th className="text-center px-3 py-3 text-xs font-semibold" style={{ color: "#888" }}>Статус</th>
                <th className="text-center px-3 py-3 text-xs font-semibold" style={{ color: "#888" }}>Начало</th>
                <th className="text-center px-3 py-3 text-xs font-semibold" style={{ color: "#888" }}>Конец</th>
                <th className="text-center px-3 py-3 text-xs font-semibold" style={{ color: "#888" }}>Часов</th>
                <th className="text-left px-3 py-3 text-xs font-semibold" style={{ color: "#888" }}>Сессии</th>
              </tr>
            </thead>
            <tbody>
              {userEntries.map(({ user, entries: ue, totalMinutes, firstIn, lastOut, isActive }) => (
                <tr key={user.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td className="px-4 py-3 font-medium" style={{ color: "#333" }}>{user.full_name}</td>
                  <td className="text-center px-3 py-3">
                    {ue.length === 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f5f5f5", color: "#aaa" }}>Не отмечался</span>
                    ) : isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#e8f5e9", color: "#2e7d32" }}>На работе</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fff3e0", color: "#e65c00" }}>Ушёл</span>
                    )}
                  </td>
                  <td className="text-center px-3 py-3 text-xs" style={{ color: "#555" }}>
                    {firstIn ? formatTime(firstIn) : "—"}
                  </td>
                  <td className="text-center px-3 py-3 text-xs" style={{ color: "#555" }}>
                    {lastOut ? formatTime(lastOut) : isActive ? <span style={{ color: "#2e7d32" }}>сейчас</span> : "—"}
                  </td>
                  <td className="text-center px-3 py-3 text-xs font-medium" style={{ color: totalMinutes >= 480 ? "#2e7d32" : totalMinutes > 0 ? "#e65c00" : "#aaa" }}>
                    {formatDuration(totalMinutes)}
                  </td>
                  <td className="px-3 py-3">
                    {ue.length === 0 ? (
                      <span className="text-xs" style={{ color: "#ccc" }}>—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {ue.map((e) => (
                          <span key={e.id} className="text-xs px-1.5 py-0.5 rounded" style={{ background: e.check_out ? "#f0f7ff" : "#e8f5e9", color: e.check_out ? "#0067a5" : "#2e7d32", border: "1px solid #e4e4e4" }}>
                            {formatTime(e.check_in)}{e.check_out ? ` — ${formatTime(e.check_out)}` : " →"}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {userEntries.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "#aaa" }}>Нет сотрудников</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

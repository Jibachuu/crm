"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Phone, PhoneIncoming, PhoneOutgoing, Search, Download } from "lucide-react";
import PhoneLink from "@/components/ui/PhoneLink";
import { formatDateTime } from "@/lib/utils";

const DISPOSITION_LABELS: Record<string, { label: string; color: string }> = {
  answered: { label: "Отвечен", color: "#2e7d32" },
  busy: { label: "Занято", color: "#e65c00" },
  cancel: { label: "Отменён", color: "#888" },
  "no answer": { label: "Нет ответа", color: "#c62828" },
  failed: { label: "Ошибка", color: "#c62828" },
};

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CallsClient({ calls, users }: { calls: any[]; users: { id: string; full_name: string }[] }) {
  const [search, setSearch] = useState("");
  const [dirFilter, setDirFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showCount, setShowCount] = useState(100);

  const filtered = useMemo(() => calls.filter((c) => {
    if (dirFilter !== "all" && c.direction !== dirFilter) return false;
    if (userFilter !== "all") {
      if (c.created_by !== userFilter) return false;
    }
    if (dateFrom) {
      if (!c.created_at || c.created_at < dateFrom) return false;
    }
    if (dateTo) {
      // dateTo is inclusive — compare against end-of-day
      const endOfDay = dateTo + "T23:59:59.999Z";
      if (!c.created_at || c.created_at > endOfDay) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.from_address?.includes(q)) ||
      (c.to_address?.includes(q)) ||
      (c.sender_name?.toLowerCase().includes(q)) ||
      (c.contacts?.full_name?.toLowerCase().includes(q)) ||
      (c.contacts?.companies?.name?.toLowerCase().includes(q));
  }), [calls, search, dirFilter, userFilter, dateFrom, dateTo]);

  const visible = filtered.slice(0, showCount);

  // Dialled / answered counters — Рустем asked for "сколько дозвонов" in
  // analytics: split outbound attempts vs successful answers.
  const stats = useMemo(() => {
    let outAttempts = 0, outAnswered = 0, inAttempts = 0, inAnswered = 0;
    for (const c of filtered) {
      const disp = c.body?.match(/\(([^)]+)\)/)?.[1] || "";
      const answered = disp === "answered" || (c.duration_seconds ?? 0) > 0;
      if (c.direction === "outbound") {
        outAttempts++;
        if (answered) outAnswered++;
      } else if (c.direction === "inbound") {
        inAttempts++;
        if (answered) inAnswered++;
      }
    }
    return { outAttempts, outAnswered, inAttempts, inAnswered };
  }, [filtered]);

  function exportCsv() {
    const header = ["Направление", "Номер", "Контакт", "Компания", "Сотрудник", "Статус", "Длительность (с)", "Дата"];
    const rows = filtered.map((c) => {
      const isInbound = c.direction === "inbound";
      const phone = isInbound ? c.from_address : c.to_address;
      const disp = c.body?.match(/\(([^)]+)\)/)?.[1] || "";
      return [
        isInbound ? "входящий" : "исходящий",
        phone || "",
        c.contacts?.full_name || c.sender_name || "",
        c.contacts?.companies?.name || "",
        c.users?.full_name || "",
        DISPOSITION_LABELS[disp]?.label || disp,
        c.duration_seconds ?? "",
        c.created_at,
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    // BOM so Excel detects UTF-8 cyrillic correctly.
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Backlog v6 §1.5: VPN cheatsheet. Inline so the operator doesn't
          have to ask Жибу each time SIP refuses to register. */}
      <details className="mb-3 rounded-lg" style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "8px 12px" }}>
        <summary style={{ color: "#b45309", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          ❓ Помощь с подключением (VPN, hosts, SIP)
        </summary>
        <div style={{ marginTop: 8, fontSize: 12, color: "#7c2d12", lineHeight: 1.5 }}>
          <p style={{ marginBottom: 6 }}>Если звонки не работают или «соединение» висит, проверь, что эти хосты идут <b>в обход VPN</b> (Amnezia / split tunneling) и/или прописаны в <code>%WinDir%\System32\drivers\etc\hosts</code>:</p>
          <ul style={{ marginLeft: 16, marginBottom: 6, listStyle: "disc" }}>
            <li><code>sip.novofon.ru</code></li>
            <li><code>stun.novofon.ru</code></li>
            <li><code>37.139.38.218</code>, <code>37.139.38.219</code>, <code>37.139.38.222</code> (SIP / RTP сервера Novofon)</li>
          </ul>
          <p style={{ marginBottom: 6 }}>Также RTP-порты <code>10000–20000/udp</code> должны быть открыты.</p>
          <p style={{ color: "#a16207", fontSize: 11 }}>Признак того что VPN режет аудио: соединение идёт, длительность считается, но собеседника не слышно и записи нет.</p>
        </div>
      </details>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по номеру, имени..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <div className="flex gap-1">
          {([
            { key: "all", label: "Все" },
            { key: "inbound", label: "Входящие" },
            { key: "outbound", label: "Исходящие" },
          ] as const).map((f) => (
            <button key={f.key} onClick={() => setDirFilter(f.key)}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{
                background: dirFilter === f.key ? "#0067a5" : "#f5f5f5",
                color: dirFilter === f.key ? "#fff" : "#888",
                border: `1px solid ${dirFilter === f.key ? "#0067a5" : "#e0e0e0"}`,
              }}>
              {f.label}
            </button>
          ))}
        </div>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-full focus:outline-none"
          style={{ border: "1px solid #e0e0e0", background: "#f5f5f5", color: "#555" }}>
          <option value="all">Все сотрудники</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="С"
          className="text-xs px-2 py-1.5 rounded-full focus:outline-none"
          style={{ border: "1px solid #e0e0e0", background: "#f5f5f5", color: "#555" }} />
        <span className="text-xs" style={{ color: "#aaa" }}>—</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="По"
          className="text-xs px-2 py-1.5 rounded-full focus:outline-none"
          style={{ border: "1px solid #e0e0e0", background: "#f5f5f5", color: "#555" }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs" style={{ color: "#888" }}>сбросить</button>
        )}
        <button onClick={exportCsv} className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1"
          style={{ border: "1px solid #d0e8f5", color: "#0067a5", background: "#fff" }}>
          <Download size={11} /> Excel
        </button>
        <span className="text-xs ml-auto" style={{ color: "#aaa" }}>{filtered.length} звонков</span>
      </div>

      {/* Stats: dialed/answered ratio */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs">
        <span style={{ color: "#666" }}>
          Исходящих: <b>{stats.outAttempts}</b>
          <span style={{ color: "#888" }}> · дозвонились: </span>
          <b style={{ color: "#2e7d32" }}>{stats.outAnswered}</b>
          {stats.outAttempts > 0 && <span style={{ color: "#888" }}> ({Math.round(stats.outAnswered / stats.outAttempts * 100)}%)</span>}
        </span>
        <span style={{ color: "#666" }}>
          Входящих: <b>{stats.inAttempts}</b>
          <span style={{ color: "#888" }}> · ответили: </span>
          <b style={{ color: "#2e7d32" }}>{stats.inAnswered}</b>
          {stats.inAttempts > 0 && <span style={{ color: "#888" }}> ({Math.round(stats.inAnswered / stats.inAttempts * 100)}%)</span>}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {visible.length === 0 ? (
          <div className="text-center py-12">
            <Phone size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Нет звонков</p>
          </div>
        ) : (
          <table className="w-full text-sm" style={{ tableLayout: "auto" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                {["", "Номер", "Контакт", "Компания", "Сотрудник", "Статус", "Длит.", "Запись", "Дата"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: "#888" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((call) => {
                const isInbound = call.direction === "inbound";
                const phone = isInbound ? call.from_address : call.to_address;
                const contactName = call.contacts?.full_name;
                const companyName = call.contacts?.companies?.name;
                const userName = call.users?.full_name;
                const disposition = call.body?.match(/\(([^)]+)\)/)?.[1] || "";
                const dispInfo = DISPOSITION_LABELS[disposition] || { label: disposition || "—", color: "#888" };
                const duration = call.duration_seconds;
                const recording = call.recording_url && !call.recording_url.startsWith("pending:");

                return (
                  <tr key={call.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      {isInbound ? <PhoneIncoming size={14} style={{ color: "#2e7d32" }} /> : <PhoneOutgoing size={14} style={{ color: "#0067a5" }} />}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap" style={{ color: "#333" }}>
                      {phone ? <PhoneLink phone={phone} showIcon={false}>{phone}</PhoneLink> : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {contactName ? (
                        <Link href={`/contacts/${call.contact_id}`} className="text-sm hover:underline" style={{ color: "#0067a5" }}>{contactName}</Link>
                      ) : (
                        <span className="text-xs" style={{ color: "#aaa" }}>Неизвестный</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{companyName || "—"}</td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: "#666" }}>{userName || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium" style={{ color: dispInfo.color }}>{dispInfo.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: "#666" }}>
                      {formatDuration(duration)}
                    </td>
                    <td className="px-4 py-2.5">
                      {recording ? (
                        <div className="flex items-center gap-2">
                          <audio controls preload="none" className="h-8" style={{ minWidth: 280 }}>
                            <source src={call.recording_url} />
                          </audio>
                          <button
                            onClick={async (e) => {
                              const btn = e.currentTarget;
                              btn.disabled = true;
                              btn.textContent = "...";
                              const res = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ communicationId: call.id, recordingUrl: call.recording_url }) });
                              const data = await res.json();
                              if (data.transcript) {
                                btn.textContent = "OK";
                                const row = btn.closest("tr");
                                if (row) {
                                  const td = document.createElement("div");
                                  td.className = "text-xs mt-1 p-2 rounded";
                                  td.style.cssText = "background:#f5f5f5;color:#333;max-width:300px;white-space:pre-wrap";
                                  td.textContent = data.transcript;
                                  btn.parentElement?.appendChild(td);
                                }
                              } else {
                                btn.textContent = "Err";
                                alert(data.error || "Ошибка транскрипции");
                              }
                              setTimeout(() => { btn.disabled = false; btn.textContent = "STT"; }, 3000);
                            }}
                            className="text-xs px-1.5 py-0.5 rounded hover:bg-blue-50 shrink-0"
                            style={{ color: "#0067a5", border: "1px solid #b3d9f2" }}
                            title="Транскрибировать (Whisper)"
                          >STT</button>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: "#ccc" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: "#aaa" }}>{formatDateTime(call.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCount < filtered.length && (
        <div className="flex justify-center mt-3">
          <button onClick={() => setShowCount((c) => c + 100)}
            className="text-sm px-4 py-1.5 rounded" style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}>
            Показать ещё {Math.min(100, filtered.length - showCount)}
          </button>
        </div>
      )}
    </div>
  );
}

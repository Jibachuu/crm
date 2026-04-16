"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, PhoneIncoming, PhoneOutgoing, Search, Play } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

const DISPOSITION_LABELS: Record<string, { label: string; color: string }> = {
  answered: { label: "Отвечен", color: "#2e7d32" },
  busy: { label: "Занято", color: "#e65c00" },
  cancel: { label: "Отменён", color: "#888" },
  "no answer": { label: "Нет ответа", color: "#c62828" },
  failed: { label: "Ошибка", color: "#c62828" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CallsClient({ calls }: { calls: any[] }) {
  const [search, setSearch] = useState("");
  const [dirFilter, setDirFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [showCount, setShowCount] = useState(100);

  const filtered = calls.filter((c) => {
    if (dirFilter !== "all" && c.direction !== dirFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.from_address?.includes(q)) ||
      (c.to_address?.includes(q)) ||
      (c.sender_name?.toLowerCase().includes(q)) ||
      (c.contacts?.full_name?.toLowerCase().includes(q)) ||
      (c.contacts?.companies?.name?.toLowerCase().includes(q));
  });

  const visible = filtered.slice(0, showCount);

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
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
        <span className="text-xs" style={{ color: "#aaa" }}>{filtered.length} звонков</span>
      </div>

      {/* Table */}
      <div className="bg-white" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {visible.length === 0 ? (
          <div className="text-center py-12">
            <Phone size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Нет звонков</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                {["", "Номер", "Контакт", "Компания", "Статус", "Длительность", "Запись", "Дата"].map((h) => (
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
                const disposition = call.body?.match(/\(([^)]+)\)/)?.[1] || "";
                const dispInfo = DISPOSITION_LABELS[disposition] || { label: disposition || "—", color: "#888" };
                const duration = call.duration_seconds;
                const recording = call.recording_url && !call.recording_url.startsWith("pending:");

                return (
                  <tr key={call.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      {isInbound ? (
                        <PhoneIncoming size={14} style={{ color: "#2e7d32" }} />
                      ) : (
                        <PhoneOutgoing size={14} style={{ color: "#0067a5" }} />
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "#333" }}>{phone || "—"}</td>
                    <td className="px-4 py-2.5">
                      {contactName ? (
                        <Link href={`/contacts/${call.contact_id}`} className="text-sm hover:underline" style={{ color: "#0067a5" }}>{contactName}</Link>
                      ) : (
                        <span className="text-xs" style={{ color: "#aaa" }}>Неизвестный</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{companyName || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium" style={{ color: dispInfo.color }}>{dispInfo.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>
                      {duration ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {recording ? (
                        <audio controls preload="none" className="h-7" style={{ maxWidth: 180 }}>
                          <source src={call.recording_url} />
                        </audio>
                      ) : (
                        <span className="text-xs" style={{ color: "#ccc" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#aaa" }}>{formatDateTime(call.created_at)}</td>
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

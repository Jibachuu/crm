"use client";

import { useState } from "react";
import { Mail, MessageSquare, Phone, CircleDot, StickyNote, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface Communication {
  id: string;
  channel: string;
  direction: string;
  subject?: string;
  body?: string;
  sender_name?: string;
  from_address?: string;
  created_at: string;
  users?: { full_name: string };
}

const CHANNEL_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  email: { icon: Mail, label: "Email", color: "#0067a5" },
  telegram: { icon: MessageSquare, label: "Telegram", color: "#0088cc" },
  phone: { icon: Phone, label: "Звонок", color: "#2e7d32" },
  maks: { icon: CircleDot, label: "МАКС", color: "#7b1fa2" },
  note: { icon: StickyNote, label: "Заметка", color: "#e65c00" },
  internal: { icon: MessageSquare, label: "Внутреннее", color: "#888" },
};

export default function CommunicationsTimeline({ communications }: { communications: Communication[] }) {
  const [channelFilter, setChannelFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const filtered = communications.filter((c) => {
    if (channelFilter && c.channel !== channelFilter) return false;
    if (directionFilter && c.direction !== directionFilter) return false;
    return true;
  });

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-gray-100" style={{ color: "#888" }}>
          <Filter size={12} /> Фильтры
        </button>
        <span className="text-xs" style={{ color: "#aaa" }}>{filtered.length} сообщений</span>
      </div>

      {showFilters && (
        <div className="flex gap-2 mb-3">
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
            className="text-xs px-2 py-1 rounded outline-none" style={{ border: "1px solid #d0d0d0" }}>
            <option value="">Все каналы</option>
            {Object.entries(CHANNEL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}
            className="text-xs px-2 py-1 rounded outline-none" style={{ border: "1px solid #d0d0d0" }}>
            <option value="">Все направления</option>
            <option value="inbound">Входящие</option>
            <option value="outbound">Исходящие</option>
          </select>
        </div>
      )}

      {/* Timeline */}
      {filtered.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: "#aaa" }}>Нет сообщений</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((comm) => {
            const config = CHANNEL_CONFIG[comm.channel] ?? CHANNEL_CONFIG.note;
            const Icon = config.icon;
            const text = comm.body ?? "";
            const isLong = text.length > 200;
            const isExpanded = expandedIds.has(comm.id);
            const senderName = comm.sender_name ?? comm.users?.full_name ?? comm.from_address ?? "";

            return (
              <div key={comm.id} className="flex gap-3 px-3 py-2.5 rounded hover:bg-gray-50 transition-colors"
                style={{ border: "1px solid #f0f0f0" }}>
                {/* Channel icon */}
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${config.color}15` }}>
                  <Icon size={13} style={{ color: config.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium" style={{ color: config.color }}>{config.label}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{
                      background: comm.direction === "inbound" ? "#e8f4fd" : "#e8f5e9",
                      color: comm.direction === "inbound" ? "#0067a5" : "#2e7d32",
                      fontSize: 10,
                    }}>
                      {comm.direction === "inbound" ? "Входящее" : "Исходящее"}
                    </span>
                    {senderName && <span className="text-xs" style={{ color: "#888" }}>{senderName}</span>}
                    <span className="text-xs ml-auto flex-shrink-0" style={{ color: "#aaa" }}>{formatDateTime(comm.created_at)}</span>
                  </div>

                  {comm.subject && <p className="text-xs font-medium mb-0.5" style={{ color: "#333" }}>{comm.subject}</p>}

                  {text && (
                    <div>
                      <p className="text-xs whitespace-pre-wrap" style={{ color: "#555" }}>
                        {isLong && !isExpanded ? text.slice(0, 200) + "..." : text}
                      </p>
                      {isLong && (
                        <button onClick={() => toggleExpand(comm.id)} className="flex items-center gap-0.5 text-xs mt-1 hover:underline" style={{ color: "#0067a5" }}>
                          {isExpanded ? <><ChevronUp size={10} /> Свернуть</> : <><ChevronDown size={10} /> Показать полностью</>}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

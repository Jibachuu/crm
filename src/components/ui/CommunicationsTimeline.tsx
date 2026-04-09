"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Mail, Phone, ArrowLeft, ArrowRight, ChevronDown, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import DateRangeFilter from "./DateRangeFilter";
import { usePagination } from "@/hooks/usePagination";

interface Communication {
  id: string;
  channel: string;
  direction: string;
  body?: string;
  subject?: string;
  sender_name?: string;
  from_address?: string;
  created_at: string;
  users?: { full_name: string };
}

const CHANNEL_CONFIG: Record<string, { icon: typeof MessageSquare; color: string; label: string }> = {
  telegram: { icon: MessageSquare, color: "#0088cc", label: "Telegram" },
  whatsapp: { icon: MessageSquare, color: "#25D366", label: "WhatsApp" },
  maks: { icon: MessageSquare, color: "#0067a5", label: "МАКС" },
  email: { icon: Mail, color: "#888", label: "Email" },
  phone: { icon: Phone, color: "#7b1fa2", label: "Телефон" },
  note: { icon: MessageSquare, color: "#aaa", label: "Заметка" },
  internal: { icon: MessageSquare, color: "#ccc", label: "Внутреннее" },
};

interface Props {
  entityType: string;
  entityId: string;
}

export default function CommunicationsTimeline({ entityType, entityId }: Props) {
  const [comms, setComms] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadComms();
  }, [entityType, entityId]);

  async function loadComms() {
    setLoading(true);
    const supabase = createClient();

    // Load from both entity_type/entity_id AND direct FK columns
    const fkField = entityType === "company" ? "company_id" : entityType === "deal" ? "deal_id" : entityType === "lead" ? "lead_id" : "contact_id";

    const { data } = await supabase.from("communications")
      .select("*, users!communications_created_by_fkey(full_name)")
      .or(`${fkField}.eq.${entityId},and(entity_type.eq.${entityType},entity_id.eq.${entityId})`)
      .order("created_at", { ascending: false })
      .limit(200);

    // Deduplicate by id
    const unique = new Map<string, Communication>();
    for (const c of data ?? []) unique.set(c.id, c);
    setComms(Array.from(unique.values()));
    setLoading(false);
  }

  const filtered = comms.filter((c) => {
    if (channelFilter.size > 0 && !channelFilter.has(c.channel)) return false;
    if (search && !(c.body?.toLowerCase().includes(search.toLowerCase()) || c.subject?.toLowerCase().includes(search.toLowerCase()) || c.sender_name?.toLowerCase().includes(search.toLowerCase()))) return false;
    if (dateFrom && c.created_at < dateFrom) return false;
    if (dateTo && c.created_at > dateTo + "T23:59:59") return false;
    return true;
  });

  const { visible, hasMore, remaining, showMore } = usePagination(filtered, 30);

  function toggleChannel(ch: string) {
    setChannelFilter((prev) => { const s = new Set(prev); s.has(ch) ? s.delete(ch) : s.add(ch); return s; });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const channels = [...new Set(comms.map((c) => c.channel))];

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по тексту..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded focus:outline-none" style={{ border: "1px solid #d0d0d0" }} />
        </div>
        <DateRangeFilter onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <div className="flex gap-1">
          {channels.map((ch) => {
            const cfg = CHANNEL_CONFIG[ch] || CHANNEL_CONFIG.internal;
            const active = channelFilter.size === 0 || channelFilter.has(ch);
            return (
              <button key={ch} onClick={() => toggleChannel(ch)}
                className="text-xs px-2 py-1 rounded-full transition-colors"
                style={{ background: active ? cfg.color + "20" : "#f5f5f5", color: active ? cfg.color : "#ccc", border: `1px solid ${active ? cfg.color + "40" : "#e0e0e0"}` }}>
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs" style={{ color: "#aaa" }}>{filtered.length} сообщений</p>

      {loading ? (
        <p className="text-sm text-center py-8" style={{ color: "#aaa" }}>Загрузка...</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "#aaa" }}>Нет сообщений</p>
      ) : (
        <div className="space-y-2">
          {(visible as Communication[]).map((c) => {
            const cfg = CHANNEL_CONFIG[c.channel] || CHANNEL_CONFIG.internal;
            const Icon = cfg.icon;
            const isInbound = c.direction === "inbound";
            const isLong = (c.body?.length ?? 0) > 300;
            const isExpanded = expandedIds.has(c.id);
            const displayText = isLong && !isExpanded ? c.body?.slice(0, 300) + "..." : c.body;
            const senderName = c.sender_name || c.from_address || c.users?.full_name || "";

            return (
              <div key={c.id} className="flex gap-3 rounded-lg px-4 py-3"
                style={{ background: isInbound ? "#f8f9fa" : "#e8f4fd", border: "1px solid #e4e4e4" }}>
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: cfg.color + "15" }}>
                    <Icon size={14} style={{ color: cfg.color }} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isInbound ? <ArrowLeft size={11} style={{ color: "#888" }} /> : <ArrowRight size={11} style={{ color: "#0067a5" }} />}
                    {senderName && <span className="text-xs font-semibold" style={{ color: "#333" }}>{senderName}</span>}
                    <span className="text-xs" style={{ color: "#aaa" }}>{formatDate(c.created_at)}</span>
                  </div>
                  {c.subject && <p className="text-xs font-medium mb-0.5" style={{ color: "#555" }}>{c.subject}</p>}
                  {displayText && <p className="text-sm whitespace-pre-wrap" style={{ color: "#444" }}>{displayText}</p>}
                  {isLong && (
                    <button onClick={() => toggleExpand(c.id)} className="text-xs mt-1 hover:underline" style={{ color: "#0067a5" }}>
                      {isExpanded ? "Свернуть" : "Показать полностью"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <button onClick={() => showMore()} className="w-full text-sm py-2 rounded hover:bg-blue-50" style={{ color: "#0067a5", border: "1px dashed #d0e8f5" }}>
          <ChevronDown size={14} className="inline mr-1" />Загрузить ещё ({remaining})
        </button>
      )}
    </div>
  );
}

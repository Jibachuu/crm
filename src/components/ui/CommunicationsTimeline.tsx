"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Mail, Phone, ArrowLeft, ArrowRight, ChevronDown, Search, Edit2, Trash2, Check, X, Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { apiPatch, apiDelete } from "@/lib/api/client";
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
  is_pinned?: boolean;
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
  refreshKey?: number;
}

export default function CommunicationsTimeline({ entityType, entityId, refreshKey }: Props) {
  const [comms, setComms] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    loadComms();
  }, [entityType, entityId, refreshKey]);

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

  // Pinned notes first, then by date
  const sorted = [...filtered].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return 0;
  });
  const { visible, hasMore, remaining, showMore } = usePagination(sorted, 30);

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
                style={{ background: c.is_pinned ? "#fffbeb" : isInbound ? "#f8f9fa" : "#e8f4fd", border: c.is_pinned ? "1px solid #fbbf24" : "1px solid #e4e4e4" }}>
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
                    <div className="flex-1" />
                    <button onClick={async () => {
                      const newPinned = !c.is_pinned;
                      // Optimistic; rollback on error.
                      setComms((prev) => prev.map((x) => x.id === c.id ? { ...x, is_pinned: newPinned } : x));
                      const { error } = await apiPatch("/api/communications", { id: c.id, is_pinned: newPinned });
                      if (error) {
                        setComms((prev) => prev.map((x) => x.id === c.id ? { ...x, is_pinned: !newPinned } : x));
                        alert("Не удалось закрепить: " + error);
                      }
                    }} className="p-0.5 rounded hover:bg-yellow-50" title={c.is_pinned ? "Открепить" : "Закрепить"}>
                      <Pin size={11} style={{ color: c.is_pinned ? "#e65c00" : "#ccc" }} />
                    </button>
                    {c.channel === "note" && editingId !== c.id && (
                      <button onClick={() => { setEditingId(c.id); setEditText(c.body ?? ""); }} className="p-0.5 rounded hover:bg-blue-50" title="Редактировать">
                        <Edit2 size={11} style={{ color: "#0067a5" }} />
                      </button>
                    )}
                    <button onClick={async () => {
                      if (!confirm("Удалить запись?")) return;
                      const { error } = await apiDelete("/api/communications", { id: c.id });
                      if (error) { alert("Не удалось удалить: " + error); return; }
                      setComms((prev) => prev.filter((x) => x.id !== c.id));
                    }} className="p-0.5 rounded hover:bg-red-50" title="Удалить">
                      <Trash2 size={11} style={{ color: "#c62828" }} />
                    </button>
                  </div>
                  {c.subject && <p className="text-xs font-medium mb-0.5" style={{ color: "#555" }}>{c.subject}</p>}
                  {editingId === c.id ? (
                    <div className="space-y-1">
                      <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3}
                        className="w-full text-sm px-2 py-1 rounded focus:outline-none" style={{ border: "1px solid #d0d0d0" }} />
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-gray-100"><X size={13} style={{ color: "#888" }} /></button>
                        <button onClick={async () => {
                          const { error } = await apiPatch("/api/communications", { id: c.id, body: editText });
                          if (error) { alert("Не удалось сохранить: " + error); return; }
                          setComms((prev) => prev.map((x) => x.id === c.id ? { ...x, body: editText } : x));
                          setEditingId(null);
                        }} className="p-1 rounded hover:bg-blue-50"><Check size={13} style={{ color: "#0067a5" }} /></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {(displayText || (c.channel === "phone" && c.from_address)) && (
                        <p className="text-sm whitespace-pre-wrap" style={{ color: "#444" }}>
                          {displayText || (c.channel === "phone" ? `${c.direction === "inbound" ? "Входящий звонок" : "Исходящий звонок"} ${c.from_address || ""}` : "")}
                        </p>
                      )}
                      {isLong && (
                        <button onClick={() => toggleExpand(c.id)} className="text-xs mt-1 hover:underline" style={{ color: "#0067a5" }}>
                          {isExpanded ? "Свернуть" : "Показать полностью"}
                        </button>
                      )}
                      {(c as { recording_url?: string }).recording_url && !(c as { recording_url?: string }).recording_url!.startsWith("pending:") && (
                        <div className="mt-2">
                          <audio controls preload="none" className="h-8" style={{ maxWidth: 280 }}>
                            <source src={(c as { recording_url?: string }).recording_url!} />
                          </audio>
                        </div>
                      )}
                      {(c as { attachment_url?: string; attachment_name?: string }).attachment_url && (
                        <a href={(c as { attachment_url?: string }).attachment_url} target="_blank" rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded hover:underline"
                          style={{ background: "#f0f7fb", border: "1px solid #d0e8f5", color: "#0067a5" }}>
                          📎 {(c as { attachment_name?: string }).attachment_name || "Файл"}
                        </a>
                      )}
                      {(c as { duration_seconds?: number }).duration_seconds != null && (
                        <span className="text-xs mt-1 inline-block" style={{ color: "#888" }}>
                          Длительность: {Math.floor(((c as { duration_seconds?: number }).duration_seconds ?? 0) / 60)}:{String(((c as { duration_seconds?: number }).duration_seconds ?? 0) % 60).padStart(2, "0")}
                        </span>
                      )}
                    </>
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

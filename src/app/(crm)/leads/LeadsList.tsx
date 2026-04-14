"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Plus, Search, Filter, Trash2, CheckSquare, List, LayoutGrid } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ExportImportButtons from "@/components/ui/ExportImportButtons";
import BulkTaskModal from "@/components/ui/BulkTaskModal";
import { formatDate, getInitials, formatCurrency } from "@/lib/utils";
import PurgeButton from "@/components/ui/PurgeButton";
import CreateLeadModal from "./CreateLeadModal";
import { createClient } from "@/lib/supabase/client";
import { usePagination } from "@/hooks/usePagination";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import ShowMore from "@/components/ui/ShowMore";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "./[id]/LeadDetail";

const STATUS_VARIANTS: Record<string, "info" | "warning" | "success" | "default" | "danger" | "purple"> = {
  new: "info", callback: "warning", in_progress: "warning", samples: "info",
  samples_shipped: "info", rejected: "danger", converted: "purple",
};

const SOURCE_LABELS: Record<string, string> = {
  website: "Сайт", referral: "Рекомендация", cold_call: "Холодный звонок",
  social: "Соцсети", event: "Мероприятие", other: "Другое",
};

interface FunnelStage { id: string; funnel_id: string; name: string; slug: string; color: string; sort_order: number; is_final: boolean; is_success: boolean; }
interface Funnel { id: string; name: string; type: string; is_default: boolean; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function LeadsList({ initialLeads, users, funnelStages = [], funnels = [] }: { initialLeads: any[]; users: any[]; funnelStages?: FunnelStage[]; funnels?: Funnel[] }) {
  const { user: currentUser, isManager } = useCurrentUser();
  const stageMap = Object.fromEntries(funnelStages.map((s) => [s.id, s]));
  const funnelMap = Object.fromEntries(funnels.map((f) => [f.id, f]));
  const savedL = typeof sessionStorage !== "undefined" ? JSON.parse(sessionStorage.getItem("leads_filters") || "{}") : {};
  const [leads, setLeads] = useState(initialLeads);
  const [search, setSearch] = useState(savedL.search || "");
  const [statusFilter, setStatusFilter] = useState(savedL.statusFilter || "all");
  const [funnelFilter, setFunnelFilter] = useState(savedL.funnelFilter || "all");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">(savedL.viewMode || "list");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [kanbanLimits, setKanbanLimits] = useState<Record<string, number>>({});
  const [dateFrom, setDateFrom] = useState<string | null>(savedL.dateFrom || null);
  const [dateTo, setDateTo] = useState<string | null>(savedL.dateTo || null);

  useEffect(() => {
    try { sessionStorage.setItem("leads_filters", JSON.stringify({ search, statusFilter, funnelFilter, viewMode, dateFrom, dateTo })); } catch {}
  }, [search, statusFilter, funnelFilter, viewMode, dateFrom, dateTo]);

  useEffect(() => {
    const saved = localStorage.getItem("leads_view_mode");
    if (saved === "kanban" || saved === "list") setViewMode(saved);
  }, []);

  function switchView(mode: "list" | "kanban") {
    setViewMode(mode);
    localStorage.setItem("leads_view_mode", mode);
  }

  const filtered = leads.filter((l) => {
    const matchesSearch =
      !search ||
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.contacts?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.companies?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || l.status === statusFilter || (l.stage_id && stageMap[l.stage_id]?.slug === statusFilter);
    const matchesFunnel = funnelFilter === "all" || l.funnel_id === funnelFilter;
    const matchesDate = (!dateFrom || l.created_at >= dateFrom) && (!dateTo || l.created_at <= dateTo + "T23:59:59");
    const matchesOwner = !isManager || !currentUser || l.assigned_to === currentUser.id;
    return matchesSearch && matchesStatus && matchesFunnel && matchesDate && matchesOwner;
  });

  const { visible: paginatedLeads, hasMore, remaining, total: totalFiltered, visibleCount, showMore, showAll } = usePagination(filtered, 40);

  const filteredIds = filtered.map((l) => l.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => { const s = new Set(prev); filteredIds.forEach((id) => s.delete(id)); return s; });
    } else {
      setSelected((prev) => { const s = new Set(prev); filteredIds.forEach((id) => s.add(id)); return s; });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function bulkDelete() {
    if (!confirm(`Удалить ${selected.size} лидов? Это действие нельзя отменить.`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "leads", ids }),
    });
    if (res.ok) {
      setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
      setSelected(new Set());
    } else {
      const d = await res.json();
      alert("Ошибка: " + (d.error ?? "не удалось удалить"));
    }
    setBulkDeleting(false);
  }

  // Drag-and-drop for kanban
  function handleDragStart(e: React.DragEvent, leadId: string) {
    setDraggingId(leadId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, status: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStatus(status);
  }

  function handleDragLeave() {
    setDragOverStatus(null);
  }

  async function handleDrop(e: React.DragEvent, newStatus: string) {
    e.preventDefault();
    setDragOverStatus(null);
    if (!draggingId) return;
    const lead = leads.find((l) => l.id === draggingId);
    if (!lead || lead.status === newStatus) { setDraggingId(null); return; }
    setLeads((prev) => prev.map((l) => l.id === draggingId ? { ...l, status: newStatus } : l));
    setDraggingId(null);
    const supabase = createClient();
    await supabase.from("leads").update({ status: newStatus }).eq("id", draggingId);
  }

  // Funnel-based kanban drag-and-drop
  async function handleFunnelDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault();
    setDragOverStatus(null);
    if (!draggingId) return;
    const lead = leads.find((l) => l.id === draggingId);
    if (!lead || lead.stage_id === stageId) { setDraggingId(null); return; }
    const stage = funnelStages.find((s: FunnelStage) => s.id === stageId);
    if (!stage) { setDraggingId(null); return; }
    const statusMap: Record<string, string> = {
      new_contact: "new", qualification: "in_progress", probniki: "samples",
      sleeping: "rejected", rejected: "rejected", converted: "converted",
    };
    const newStatus = statusMap[stage.slug] ?? lead.status;
    const oldStageId = lead.stage_id;
    setLeads((prev) => prev.map((l) => l.id === draggingId ? { ...l, stage_id: stageId, status: newStatus } : l));
    setDraggingId(null);
    const supabase = createClient();
    await supabase.from("leads").update({ stage_id: stageId, status: newStatus, stage_changed_at: new Date().toISOString() }).eq("id", draggingId);
    fetch("/api/automations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stage_change", entity_type: "lead", entity_id: draggingId, stage_id: stageId, old_stage_id: oldStageId }),
    }).catch(() => {});
  }

  // Determine which funnel stages to show in kanban
  // Filter by selected funnel, or show all lead stages
  const kanbanFunnelId = funnelFilter !== "all" ? funnelFilter : (funnels.find((f: Funnel) => f.is_default)?.id ?? funnels[0]?.id);
  const kanbanStages = funnelStages.filter((s: FunnelStage) => s.funnel_id === kanbanFunnelId);
  const hasFunnelKanban = kanbanStages.length > 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }}
            placeholder="Поиск по названию, контакту, компании..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4 }}
          />
        </div>
        <div className="relative">
          <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-7 pr-3 py-1.5 text-sm focus:outline-none appearance-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4, background: "#fff", color: "#333" }}
          >
            <option value="all">Все статусы</option>
            {LEAD_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <DateRangeFilter onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        {funnels.length > 1 && (
          <select
            value={funnelFilter}
            onChange={(e) => setFunnelFilter(e.target.value)}
            className="px-3 py-1.5 text-sm focus:outline-none appearance-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4, background: "#fff", color: "#333" }}
          >
            <option value="all">Все воронки</option>
            {funnels.map((f) => <option key={f.id} value={f.id}>{f.name.replace(/Воронка [АБ] — /, "")}</option>)}
          </select>
        )}
        <ExportImportButtons entity="leads" onImported={() => window.location.reload()} />
        <PurgeButton table="leads" onPurged={() => window.location.reload()} />
        {/* View toggle */}
        <div className="flex rounded overflow-hidden" style={{ border: "1px solid #d0d0d0" }}>
          <button
            onClick={() => switchView("list")}
            title="Список"
            style={{
              padding: "5px 10px",
              background: viewMode === "list" ? "#0067a5" : "#fff",
              color: viewMode === "list" ? "#fff" : "#666",
              borderRight: "1px solid #d0d0d0",
            }}
          >
            <List size={14} />
          </button>
          <button
            onClick={() => switchView("kanban")}
            title="Канбан"
            style={{
              padding: "5px 10px",
              background: viewMode === "kanban" ? "#0067a5" : "#fff",
              color: viewMode === "kanban" ? "#fff" : "#666",
            }}
          >
            <LayoutGrid size={14} />
          </button>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={13} /> Новый лид
        </Button>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 mb-3 rounded" style={{ background: "#e8f4fd", border: "1px solid #b3d4f0" }}>
          <span className="text-sm font-medium" style={{ color: "#0067a5" }}>Выбрано: {selected.size}</span>
          <button onClick={() => setSelected(new Set())} className="text-xs hover:underline" style={{ color: "#0067a5" }}>Снять выделение</button>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => setBulkTaskOpen(true)}>
            <CheckSquare size={13} /> Создать задачу
          </Button>
          <Button size="sm" variant="danger" onClick={bulkDelete} loading={bulkDeleting}>
            <Trash2 size={13} /> Удалить
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-4 mb-3 text-xs" style={{ color: "#888" }}>
        <span>Всего: <strong style={{ color: "#333" }}>{filtered.length}</strong></span>
        {LEAD_STATUSES.map((s) => {
          const count = filtered.filter((l) => l.status === s.key).length;
          return count > 0 ? <span key={s.key}>{s.label}: <strong style={{ color: "#333" }}>{count}</strong></span> : null;
        })}
      </div>

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <div className="bg-white overflow-hidden" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
          {filtered.length === 0 ? (
            <div className="text-center py-12" style={{ color: "#aaa" }}>
              <p className="text-sm">Лиды не найдены</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>Название</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>Контакт</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>Источник</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>Стадия</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>Ответственный</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLeads.map((lead) => {
                    const isSelected = selected.has(lead.id);
                    return (
                      <tr key={lead.id} style={{ borderBottom: "1px solid #f0f0f0", background: isSelected ? "#f0f7ff" : "transparent" }}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleOne(lead.id)} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/leads/${lead.id}`} className="font-medium hover:underline" style={{ color: "#0067a5" }}>
                            {lead.title}
                          </Link>
                          {lead.companies?.name && <p className="text-xs" style={{ color: "#aaa" }}>{lead.companies.name}</p>}
                        </td>
                        <td className="px-4 py-2.5">
                          {lead.contacts ? (
                            <Link href={`/contacts/${lead.contacts.id}`} className="text-sm hover:underline" style={{ color: "#555" }}>
                              {lead.contacts.full_name}
                            </Link>
                          ) : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-sm" style={{ color: "#666" }}>
                          {SOURCE_LABELS[lead.source] ?? lead.source ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {lead.stage_id && stageMap[lead.stage_id] ? (
                            <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: stageMap[lead.stage_id].color + "20", color: stageMap[lead.stage_id].color }}>
                              {stageMap[lead.stage_id].name}
                            </span>
                          ) : (
                            <Badge variant={STATUS_VARIANTS[lead.status] ?? "default"}>{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {lead.users ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#e8f4fd", color: "#0067a5" }}>
                                {getInitials(lead.users.full_name)}
                              </div>
                              <span className="text-sm" style={{ color: "#555" }}>{lead.users.full_name}</span>
                            </div>
                          ) : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: "#aaa" }}>{formatDate(lead.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {viewMode === "list" && (
        <ShowMore hasMore={hasMore} remaining={remaining} total={totalFiltered} visibleCount={visibleCount} onShowMore={showMore} onShowAll={showAll} />
      )}

      {/* KANBAN VIEW */}
      {viewMode === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ alignItems: "flex-start" }}>
          {(hasFunnelKanban ? kanbanStages : LEAD_STATUSES.map((s) => ({ id: s.key, slug: s.key, name: s.label, color: s.key === "rejected" ? "#E24B4A" : "#378ADD", is_final: s.key === "rejected", sort_order: 0 } as FunnelStage))).map((stage) => {
            const columnLeads = hasFunnelKanban
              ? filtered.filter((l) => l.stage_id === stage.id)
              : filtered.filter((l) => l.status === stage.slug);
            const isDragOver = dragOverStatus === (hasFunnelKanban ? stage.id : stage.slug);
            return (
              <div
                key={stage.id}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverStatus(hasFunnelKanban ? stage.id : stage.slug); }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => hasFunnelKanban ? handleFunnelDrop(e, stage.id) : handleDrop(e, stage.slug)}
                style={{
                  minWidth: 230,
                  maxWidth: 240,
                  flexShrink: 0,
                  background: isDragOver ? "#f0f7ff" : "#f5f5f5",
                  borderRadius: 8,
                  border: isDragOver ? "2px dashed #0067a5" : "2px solid transparent",
                  transition: "border 0.1s, background 0.1s",
                }}
              >
                {/* Column header */}
                <div
                  className="px-3 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: "1px solid #e0e0e0", borderRadius: "8px 8px 0 0", background: stage.color + "15" }}
                >
                  <span className="text-xs font-semibold" style={{ color: stage.color }}>{stage.name}</span>
                  <span className="text-xs rounded-full px-1.5 py-0.5 font-semibold" style={{ background: stage.color, color: "#fff", minWidth: 20, textAlign: "center" }}>
                    {columnLeads.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2" style={{ minHeight: 80, maxHeight: 600, overflowY: "auto" }}>
                  {(() => {
                    const limit = kanbanLimits[stage.id] || 20;
                    const visible = columnLeads.slice(0, limit);
                    const hasMore = columnLeads.length > limit;
                    return (
                      <>
                        {visible.map((lead) => (
                          <KanbanCard
                            key={lead.id}
                            lead={lead}
                            color={stage.color}
                            isDragging={draggingId === lead.id}
                            onDragStart={(e) => handleDragStart(e, lead.id)}
                            onDragEnd={() => setDraggingId(null)}
                          />
                        ))}
                        {hasMore && (
                          <button
                            onClick={() => setKanbanLimits((p) => ({ ...p, [stage.id]: limit + 20 }))}
                            className="w-full text-xs py-2 rounded hover:bg-blue-50"
                            style={{ color: "#0067a5", border: "1px dashed #d0e8f5" }}
                          >
                            Ещё {columnLeads.length - limit}
                          </button>
                        )}
                      </>
                    );
                  })()}
                  {columnLeads.length === 0 && !isDragOver && (
                    <p className="text-xs text-center py-4" style={{ color: "#bbb" }}>Пусто</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateLeadModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        users={users}
        onCreated={(lead) => { setLeads((prev) => [lead, ...prev]); setShowCreate(false); }}
      />
      <BulkTaskModal
        open={bulkTaskOpen}
        onClose={() => setBulkTaskOpen(false)}
        entityType="lead"
        entityIds={Array.from(selected)}
        onCreated={() => setSelected(new Set())}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KanbanCard({ lead, color = "#0067a5", isDragging, onDragStart, onDragEnd }: { lead: any; color?: string; isDragging: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: "#fff",
        borderRadius: 6,
        border: "1px solid #e4e4e4",
        borderLeft: `3px solid ${color}`,
        padding: "10px 12px",
        cursor: "grab",
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isDragging ? "none" : "0 1px 3px rgba(0,0,0,0.06)",
        transition: "opacity 0.1s",
      }}
    >
      <Link
        href={`/leads/${lead.id}`}
        className="block text-sm font-medium hover:underline mb-1.5"
        style={{ color: "#0067a5", lineHeight: 1.3 }}
        onClick={(e) => isDragging && e.preventDefault()}
      >
        {lead.title}
      </Link>
      {lead.companies?.name && (
        <p className="text-xs mb-1" style={{ color: "#888" }}>🏢 {lead.companies.name}</p>
      )}
      {lead.contacts?.full_name && (
        <p className="text-xs mb-1" style={{ color: "#888" }}>👤 {lead.contacts.full_name}</p>
      )}
      {lead.users?.full_name && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#e8f4fd", color: "#0067a5", fontSize: 9 }}>
            {getInitials(lead.users.full_name)}
          </div>
          <span className="text-xs" style={{ color: "#aaa" }}>{lead.users.full_name}</span>
        </div>
      )}
      <p className="text-xs mt-1.5" style={{ color: "#ccc" }}>{formatDate(lead.created_at)}</p>
    </div>
  );
}

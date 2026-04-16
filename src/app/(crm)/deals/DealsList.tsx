"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, Filter, Trash2, CheckSquare } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ExportImportButtons from "@/components/ui/ExportImportButtons";
import BulkTaskModal from "@/components/ui/BulkTaskModal";
import { formatDate, formatCurrency, getInitials } from "@/lib/utils";
import PurgeButton from "@/components/ui/PurgeButton";
import CreateDealModal from "./CreateDealModal";
import { createClient } from "@/lib/supabase/client";
import ShowMore from "@/components/ui/ShowMore";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface FunnelStage { id: string; funnel_id: string; name: string; slug: string; color: string; sort_order: number; is_final: boolean; is_success: boolean; }

// Fallback old stages if no funnel data
const OLD_STAGE_LABELS: Record<string, string> = {
  lead: "Лид", proposal: "Предложение", negotiation: "Переговоры", order_assembly: "Сборка заказа", won: "Выиграна", lost: "Проиграна",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DealsList({ initialDeals, users, funnelStages = [] }: { initialDeals: any[]; users: any[]; funnelStages?: FunnelStage[] }) {
  const { user: currentUser, isManager } = useCurrentUser();
  const stageMap = Object.fromEntries(funnelStages.map((s) => [s.id, s]));
  const hasFunnelStages = funnelStages.length > 0;
  const [deals, setDeals] = useState(initialDeals);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false);
  const [kanbanLimits, setKanbanLimits] = useState<Record<string, number>>({});
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);


  const filtered = deals.filter((d) => {
    const matchesSearch = !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.contacts?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.companies?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStage = stageFilter === "all" || d.stage === stageFilter || d.stage_id === stageFilter;
    const matchesDate = (!dateFrom || d.created_at >= dateFrom) && (!dateTo || d.created_at <= dateTo + "T23:59:59");
    const matchesOwner = !isManager || !currentUser || d.assigned_to === currentUser.id;
    return matchesSearch && matchesStage && matchesDate && matchesOwner;
  });

  const [showCount, setShowCount] = useState(100);
  const paginatedDeals = filtered.slice(0, showCount);
  const hasMore = showCount < filtered.length;
  const remaining = Math.max(0, filtered.length - showCount);
  const totalFiltered = filtered.length;
  const visibleCount = Math.min(showCount, filtered.length);

  const filteredIds = filtered.map((d) => d.id);
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
    if (!confirm(`Удалить ${selected.size} сделок?`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "deals", ids }),
    });
    if (res.ok) { setDeals((prev) => prev.filter((d) => !ids.includes(d.id))); setSelected(new Set()); }
    else { const d = await res.json(); alert("Ошибка: " + (d.error ?? "")); }
    setBulkDeleting(false);
  }

  // Drag & drop for kanban
  async function handleDrop(dealId: string, newStageId: string) {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === newStageId) return;
    const stage = stageMap[newStageId];
    if (!stage) return;
    const slugMap: Record<string, string> = {
      qualified: "lead", kp_sent: "proposal", objections: "negotiation",
      price_calc: "order_assembly", invoice: "order_assembly", won: "won", lost: "lost",
    };
    const newOldStage = slugMap[stage.slug] ?? deal.stage;
    setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage_id: newStageId, stage: newOldStage } : d));
    const supabase = createClient();
    await supabase.from("deals").update({
      stage_id: newStageId,
      stage: newOldStage,
      stage_changed_at: new Date().toISOString(),
      ...(stage.slug === "won" ? { closed_at: new Date().toISOString() } : {}),
    }).eq("id", dealId);
    fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stage_change", entity_type: "deal", entity_id: dealId, stage_id: newStageId, old_stage_id: deal.stage_id }),
    }).catch(() => {});
  }

  function getStageName(deal: { stage_id?: string; stage?: string }) {
    if (deal.stage_id && stageMap[deal.stage_id]) return stageMap[deal.stage_id].name;
    return OLD_STAGE_LABELS[deal.stage ?? ""] ?? deal.stage ?? "—";
  }

  function getStageColor(deal: { stage_id?: string; stage?: string }) {
    if (deal.stage_id && stageMap[deal.stage_id]) return stageMap[deal.stage_id].color;
    return "#888";
  }

  const totalAmount = filtered.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const wonDeals = filtered.filter((d) => {
    if (d.stage_id && stageMap[d.stage_id]) return stageMap[d.stage_id].slug === "won";
    return d.stage === "won";
  });
  const wonAmount = wonDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  // Filter options from funnel stages
  const filterOptions = hasFunnelStages
    ? funnelStages.map((s) => ({ value: s.id, label: s.name }))
    : Object.entries(OLD_STAGE_LABELS).map(([v, l]) => ({ value: v, label: l }));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }}
            placeholder="Поиск по сделке, контакту, компании..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <div className="relative">
          <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
            className="pl-7 pr-3 py-1.5 text-sm focus:outline-none appearance-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4, background: "#fff" }}>
            <option value="all">Все стадии</option>
            {filterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <DateRangeFilter onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <div className="flex overflow-hidden" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }}>
          {(["table", "kanban"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-1.5 text-xs font-medium"
              style={{ background: view === v ? "#0067a5" : "#fff", color: view === v ? "#fff" : "#555" }}>
              {v === "table" ? "Таблица" : "Канбан"}
            </button>
          ))}
        </div>
        <ExportImportButtons entity="deals" onImported={() => window.location.reload()} />
        <PurgeButton table="deals" onPurged={() => window.location.reload()} />
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={13} /> Новая сделка</Button>
      </div>

      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 mb-3 rounded" style={{ background: "#e8f4fd", border: "1px solid #b3d4f0" }}>
          <span className="text-sm font-medium" style={{ color: "#0067a5" }}>Выбрано: {selected.size}</span>
          <button onClick={() => setSelected(new Set())} className="text-xs hover:underline" style={{ color: "#0067a5" }}>Снять</button>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => setBulkTaskOpen(true)}><CheckSquare size={13} /> Задача</Button>
          <Button size="sm" variant="danger" onClick={bulkDelete} loading={bulkDeleting}><Trash2 size={13} /> Удалить</Button>
        </div>
      )}

      <div className="flex gap-4 mb-3 text-xs" style={{ color: "#888" }}>
        <span>Сделок: <strong style={{ color: "#333" }}>{filtered.length}</strong></span>
        <span>Сумма: <strong style={{ color: "#333" }}>{formatCurrency(totalAmount)}</strong></span>
        <span>Выиграно: <strong style={{ color: "#2e7d32" }}>{formatCurrency(wonAmount)}</strong></span>
      </div>

      {view === "table" ? (
        <><div className="bg-white" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: "#aaa" }}>Сделки не найдены</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                    </th>
                    {["Название", "Контакт", "Стадия", "Сумма", "Ответственный", "Дата"].map((h) => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${h === "Сумма" ? "text-right" : "text-left"}`} style={{ color: "#888" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedDeals.map((deal) => {
                    const isSel = selected.has(deal.id);
                    const color = getStageColor(deal);
                    return (
                      <tr key={deal.id} style={{ borderBottom: "1px solid #f0f0f0", background: isSel ? "#f0f7ff" : "transparent" }}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={isSel} onChange={() => toggleOne(deal.id)} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/deals/${deal.id}`} className="font-medium hover:underline" style={{ color: "#0067a5" }}>{deal.title}</Link>
                          {deal.companies?.name && <p className="text-xs" style={{ color: "#aaa" }}>{deal.companies.name}</p>}
                        </td>
                        <td className="px-4 py-2.5">
                          {deal.contacts ? <Link href={`/contacts/${deal.contacts.id}`} className="hover:underline" style={{ color: "#555" }}>{deal.contacts.full_name}</Link> : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: color + "20", color }}>{getStageName(deal)}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium" style={{ color: "#333" }}>{formatCurrency(deal.amount)}</td>
                        <td className="px-4 py-2.5">
                          {deal.users ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "#e8f4fd", color: "#0067a5" }}>{getInitials(deal.users.full_name)}</div>
                              <span style={{ color: "#555" }}>{deal.users.full_name}</span>
                            </div>
                          ) : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: "#aaa" }}>{formatDate(deal.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <ShowMore hasMore={hasMore} remaining={remaining} total={totalFiltered} visibleCount={visibleCount} onShowMore={() => setShowCount((c) => c + 100)} onShowAll={() => setShowCount(999999)} />
        </>
      ) : (
        /* KANBAN VIEW using funnel stages */
        <div className="flex gap-3 overflow-x-auto pb-4">
          {(hasFunnelStages ? funnelStages : Object.entries(OLD_STAGE_LABELS).map(([slug, name]) => ({ id: slug, slug, name, color: "#888", is_final: false } as FunnelStage))).map((stage) => {
            const stageDeals = filtered.filter((d) => {
              if (hasFunnelStages) return d.stage_id === stage.id;
              return d.stage === stage.slug;
            });
            const stageTotal = stageDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
            return (
              <div key={stage.id} className="flex-shrink-0" style={{ minWidth: 220, maxWidth: 240 }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => { e.preventDefault(); const dealId = e.dataTransfer.getData("dealId"); if (dealId && hasFunnelStages) handleDrop(dealId, stage.id); }}
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: stage.color + "20", color: stage.color }}>
                    {stage.name} ({stageDeals.length})
                  </span>
                  <span className="text-xs font-medium" style={{ color: "#888" }}>{formatCurrency(stageTotal)}</span>
                </div>
                <div className="space-y-2" style={{ minHeight: 60, maxHeight: 600, overflowY: "auto" }}>
                  {(() => {
                    const limit = kanbanLimits[stage.id] || 20;
                    const visible = stageDeals.slice(0, limit);
                    const hasMore = stageDeals.length > limit;
                    return (
                      <>
                        {visible.map((deal) => (
                          <Link key={deal.id} href={`/deals/${deal.id}`}>
                            <div
                              draggable={hasFunnelStages}
                              onDragStart={(e) => { e.dataTransfer.setData("dealId", deal.id); e.dataTransfer.effectAllowed = "move"; }}
                              className="bg-white p-3 hover:shadow-sm transition-shadow cursor-pointer"
                              style={{ border: "1px solid #e4e4e4", borderRadius: 6, borderLeft: `3px solid ${stage.color}` }}>
                              <p className="text-sm font-medium mb-0.5" style={{ color: "#333" }}>{deal.title}</p>
                              {deal.contacts && <p className="text-xs" style={{ color: "#888" }}>{deal.contacts.full_name}</p>}
                              {deal.amount > 0 && <p className="text-xs font-semibold mt-1" style={{ color: "#2e7d32" }}>{formatCurrency(deal.amount)}</p>}
                            </div>
                          </Link>
                        ))}
                        {hasMore && (
                          <button
                            onClick={() => setKanbanLimits((p) => ({ ...p, [stage.id]: limit + 20 }))}
                            className="w-full text-xs py-2 rounded hover:bg-blue-50"
                            style={{ color: "#0067a5", border: "1px dashed #d0e8f5" }}
                          >
                            Ещё {stageDeals.length - limit}
                          </button>
                        )}
                      </>
                    );
                  })()}
                  {stageDeals.length === 0 && (
                    <div className="p-4 text-center text-xs" style={{ border: "1px dashed #ddd", borderRadius: 6, color: "#ccc" }}>Нет сделок</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateDealModal open={showCreate} onClose={() => setShowCreate(false)} users={users}
        onCreated={(deal: unknown) => { setDeals((prev) => [deal, ...prev]); setShowCreate(false); }} />
      <BulkTaskModal open={bulkTaskOpen} onClose={() => setBulkTaskOpen(false)}
        entityType="deal" entityIds={Array.from(selected)} onCreated={() => setSelected(new Set())} />
    </div>
  );
}

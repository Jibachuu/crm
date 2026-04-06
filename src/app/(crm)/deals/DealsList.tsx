"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Filter, Trash2, CheckSquare } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ExportImportButtons from "@/components/ui/ExportImportButtons";
import BulkTaskModal from "@/components/ui/BulkTaskModal";
import { formatDate, formatCurrency, getInitials } from "@/lib/utils";
import PurgeButton from "@/components/ui/PurgeButton";
import CreateDealModal from "./CreateDealModal";

const STAGE_LABELS: Record<string, string> = {
  lead: "Лид", proposal: "Предложение", negotiation: "Переговоры", order_assembly: "Сборка заказа", won: "Выиграна", lost: "Проиграна",
};
const STAGE_VARIANTS: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
  lead: "default", proposal: "info", negotiation: "warning", order_assembly: "info", won: "success", lost: "danger",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DealsList({ initialDeals, users }: { initialDeals: any[]; users: any[] }) {
  const [deals, setDeals] = useState(initialDeals);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false);

  const filtered = deals.filter((d) => {
    const matchesSearch = !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.contacts?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.companies?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStage = stageFilter === "all" || d.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

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

  const totalAmount = filtered.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const wonAmount = filtered.filter((d) => d.stage === "won").reduce((sum, d) => sum + (d.amount ?? 0), 0);

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
            {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
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
        <div className="bg-white overflow-hidden" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
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
                  {filtered.map((deal) => {
                    const isSel = selected.has(deal.id);
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
                        <td className="px-4 py-2.5"><Badge variant={STAGE_VARIANTS[deal.stage] ?? "default"}>{STAGE_LABELS[deal.stage]}</Badge></td>
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
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Object.entries(STAGE_LABELS).map(([stage, label]) => {
            const stageDeals = filtered.filter((d) => d.stage === stage);
            const stageTotal = stageDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
            return (
              <div key={stage} className="flex-shrink-0 w-60">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant={STAGE_VARIANTS[stage] ?? "default"}>{label} ({stageDeals.length})</Badge>
                  <span className="text-xs font-medium" style={{ color: "#666" }}>{formatCurrency(stageTotal)}</span>
                </div>
                <div className="space-y-2">
                  {stageDeals.map((deal) => (
                    <Link key={deal.id} href={`/deals/${deal.id}`}>
                      <div className="bg-white p-3 hover:shadow-sm transition-shadow cursor-pointer" style={{ border: "1px solid #e4e4e4", borderRadius: 4 }}>
                        <p className="text-sm font-medium mb-1" style={{ color: "#333" }}>{deal.title}</p>
                        {deal.contacts && <p className="text-xs" style={{ color: "#888" }}>{deal.contacts.full_name}</p>}
                        {deal.amount && <p className="text-xs font-semibold" style={{ color: "#2e7d32" }}>{formatCurrency(deal.amount)}</p>}
                      </div>
                    </Link>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="p-4 text-center text-xs" style={{ border: "1px dashed #ddd", borderRadius: 4, color: "#ccc" }}>Нет сделок</div>
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

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
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "./[id]/LeadDetail";

const STATUS_VARIANTS: Record<string, "info" | "warning" | "success" | "default" | "danger" | "purple"> = {
  new: "info", callback: "warning", in_progress: "warning", samples: "info",
  samples_shipped: "info", invoice: "success", rejected: "danger", converted: "purple",
};

const SOURCE_LABELS: Record<string, string> = {
  website: "Сайт", referral: "Рекомендация", cold_call: "Холодный звонок",
  social: "Соцсети", event: "Мероприятие", other: "Другое",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function LeadsList({ initialLeads, users }: { initialLeads: any[]; users: any[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

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
    const matchesStatus = statusFilter === "all" || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
                  {filtered.map((lead) => {
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
                          <Badge variant={STATUS_VARIANTS[lead.status] ?? "default"}>{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</Badge>
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

      {/* KANBAN VIEW */}
      {viewMode === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ alignItems: "flex-start" }}>
          {LEAD_STATUSES.map((status) => {
            const columnLeads = filtered.filter((l) => l.status === status.key);
            const isRejected = status.key === "rejected";
            const isDragOver = dragOverStatus === status.key;
            return (
              <div
                key={status.key}
                onDragOver={(e) => handleDragOver(e, status.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, status.key)}
                style={{
                  minWidth: 230,
                  maxWidth: 230,
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
                  style={{
                    borderBottom: "1px solid #e0e0e0",
                    borderRadius: "8px 8px 0 0",
                    background: isRejected ? "#fdecea" : "#ebebeb",
                  }}
                >
                  <span className="text-xs font-semibold" style={{ color: isRejected ? "#e74c3c" : "#444" }}>
                    {status.label}
                  </span>
                  <span className="text-xs rounded-full px-1.5 py-0.5 font-semibold" style={{ background: isRejected ? "#e74c3c" : "#0067a5", color: "#fff", minWidth: 20, textAlign: "center" }}>
                    {columnLeads.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2" style={{ minHeight: 80 }}>
                  {columnLeads.map((lead) => (
                    <KanbanCard
                      key={lead.id}
                      lead={lead}
                      isDragging={draggingId === lead.id}
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onDragEnd={() => setDraggingId(null)}
                    />
                  ))}
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
function KanbanCard({ lead, isDragging, onDragStart, onDragEnd }: { lead: any; isDragging: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: "#fff",
        borderRadius: 6,
        border: "1px solid #e4e4e4",
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Building2, Globe, Phone, Mail, Trash2, CheckSquare } from "lucide-react";
import Button from "@/components/ui/Button";
import ExportImportButtons from "@/components/ui/ExportImportButtons";
import BulkTaskModal from "@/components/ui/BulkTaskModal";
import PurgeButton from "@/components/ui/PurgeButton";

import ShowMore from "@/components/ui/ShowMore";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import PhoneLink from "@/components/ui/PhoneLink";
import CreateCompanyModal from "./CreateCompanyModal";

const COMPANY_TYPE_LABELS: Record<string, string> = {
  restaurant: "Ресторан", hotel: "Отель", salon: "Салон",
  retail: "Розница", wholesale: "Опт", other: "Другое",
};
const CONTRACT_LABELS: Record<string, string> = { none: "Нет договора", pending: "На согласовании", signed: "Подписан", terminated: "Расторгнут" };
const CONTRACT_COLORS: Record<string, { bg: string; color: string }> = {
  none: { bg: "#fdecea", color: "#c62828" },
  pending: { bg: "#fff3e0", color: "#e65c00" },
  signed: { bg: "#e8f5e9", color: "#2e7d32" },
  terminated: { bg: "#f5f5f5", color: "#888" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CompaniesList({ initialCompanies, users }: any) {
  const { user: currentUser, isManager } = useCurrentUser();
  const [companies, setCompanies] = useState(initialCompanies);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false);
  const [contractFilter, setContractFilter] = useState("");

  const filtered = companies.filter((c: { name: string; inn?: string; company_type?: string; contract_status?: string; created_at?: string }) => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.inn?.includes(search) ||
      COMPANY_TYPE_LABELS[c.company_type ?? ""]?.toLowerCase().includes(search.toLowerCase());
    const matchContract = !contractFilter || (c.contract_status ?? "none") === contractFilter;
    const matchesDate = (!dateFrom || (c.created_at ?? "") >= dateFrom) && (!dateTo || (c.created_at ?? "") <= dateTo + "T23:59:59");
    const matchesOwner = !isManager || !currentUser || (c as any).assigned_to === currentUser.id;
    return matchSearch && matchContract && matchesDate && matchesOwner;
  });

  const [showCount, setShowCount] = useState(100);
  const paginatedCompanies = filtered.slice(0, showCount);
  const hasMore = showCount < filtered.length;
  const remaining = Math.max(0, filtered.length - showCount);
  const totalFiltered = filtered.length;
  const visibleCount = Math.min(showCount, filtered.length);

  const filteredIds = filtered.map((c: { id: string }) => c.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id: string) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => { const s = new Set(prev); filteredIds.forEach((id: string) => s.delete(id)); return s; });
    } else {
      setSelected((prev) => { const s = new Set(prev); filteredIds.forEach((id: string) => s.add(id)); return s; });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function bulkDelete() {
    if (!confirm(`Удалить ${selected.size} компаний? Это действие нельзя отменить.`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "companies", ids }),
    });
    if (res.ok) { setCompanies((prev: { id: string }[]) => prev.filter((c) => !ids.includes(c.id))); setSelected(new Set()); }
    else { const d = await res.json(); alert("Ошибка: " + (d.error ?? "")); }
    setBulkDeleting(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }}
            placeholder="Поиск по названию, ИНН..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4 }}
          />
        </div>
        <select value={contractFilter} onChange={(e) => setContractFilter(e.target.value)}
          className="text-xs px-2 py-1.5 rounded outline-none"
          style={{ border: "1px solid #d0d0d0", color: contractFilter ? "#333" : "#888" }}>
          <option value="">Все договоры</option>
          {Object.entries(CONTRACT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <DateRangeFilter onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <ExportImportButtons entity="companies" onImported={() => window.location.reload()} />
        <PurgeButton table="companies" onPurged={() => window.location.reload()} />
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={13} /> Новая компания
        </Button>
      </div>

      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 mb-3 rounded" style={{ background: "#e8f4fd", border: "1px solid #b3d4f0" }}>
          <span className="text-sm font-medium" style={{ color: "#0067a5" }}>Выбрано: {selected.size}</span>
          <button onClick={() => setSelected(new Set())} className="text-xs hover:underline" style={{ color: "#0067a5" }}>Снять выделение</button>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => setBulkTaskOpen(true)}><CheckSquare size={13} /> Создать задачу</Button>
          <Button size="sm" variant="danger" onClick={bulkDelete} loading={bulkDeleting}><Trash2 size={13} /> Удалить</Button>
        </div>
      )}

      <div className="flex gap-4 mb-3 text-xs" style={{ color: "#888" }}>
        <span>Компаний: <strong style={{ color: "#333" }}>{filtered.length}</strong></span>
      </div>

      <div className="bg-white overflow-hidden" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#aaa" }}>
            <Building2 size={36} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm">Компании не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                  </th>
                  {["Компания", "ИНН", "Тип", "Договор", "Контакты", "Ответственный"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(paginatedCompanies as any[]).map((company: {
                  id: string; name: string; inn?: string; company_type?: string; contract_status?: string;
                  phone?: string; email?: string; website?: string; users?: { full_name: string };
                }) => {
                  const isSel = selected.has(company.id);
                  return (
                    <tr key={company.id} style={{ borderBottom: "1px solid #f0f0f0", background: isSel ? "#f0f7ff" : "transparent" }}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={isSel} onChange={() => toggleOne(company.id)} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/companies/${company.id}`} className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#f0f0f0" }}>
                            <Building2 size={14} style={{ color: "#888" }} />
                          </div>
                          <span className="font-medium hover:underline" style={{ color: "#0067a5" }}>{company.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{company.inn ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>
                        {COMPANY_TYPE_LABELS[company.company_type ?? ""] ?? company.company_type ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {(() => {
                          const st = company.contract_status ?? "none";
                          const c = CONTRACT_COLORS[st] ?? CONTRACT_COLORS.none;
                          return (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: c.bg, color: c.color }}>
                              {CONTRACT_LABELS[st] ?? st}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-3">
                          {company.phone && (
                            <PhoneLink phone={company.phone} iconSize={13} showIcon={false} className="hover:text-blue-600" >
                              <Phone size={13} style={{ color: "#aaa" }} />
                            </PhoneLink>
                          )}
                          {company.email && (
                            <a href={`mailto:${company.email}`} style={{ color: "#aaa" }} className="hover:text-blue-600">
                              <Mail size={13} />
                            </a>
                          )}
                          {company.website && (
                            <a href={company.website} target="_blank" rel="noopener noreferrer" style={{ color: "#aaa" }} className="hover:text-blue-600">
                              <Globe size={13} />
                            </a>
                          )}
                          {!company.phone && !company.email && !company.website && <span style={{ color: "#ccc" }}>—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#666" }}>{company.users?.full_name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ShowMore hasMore={hasMore} remaining={remaining} total={totalFiltered} visibleCount={visibleCount} onShowMore={() => setShowCount((c) => c + 100)} onShowAll={() => setShowCount(999999)} />

      <CreateCompanyModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        users={users}
        onCreated={(c: unknown) => { setCompanies((p: unknown[]) => [c, ...p]); setShowCreate(false); }}
      />
      <BulkTaskModal
        open={bulkTaskOpen}
        onClose={() => setBulkTaskOpen(false)}
        entityType="company"
        entityIds={Array.from(selected)}
        onCreated={() => setSelected(new Set())}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Phone, Mail, Trash2, CheckSquare } from "lucide-react";
import Button from "@/components/ui/Button";
import ExportImportButtons from "@/components/ui/ExportImportButtons";
import BulkTaskModal from "@/components/ui/BulkTaskModal";
import { formatDate, getInitials } from "@/lib/utils";
import PurgeButton from "@/components/ui/PurgeButton";

import ShowMore from "@/components/ui/ShowMore";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CreateContactModal from "./CreateContactModal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ContactsList({ initialContacts, companies, users }: any) {
  const { user: currentUser, isManager } = useCurrentUser();
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  const filtered = contacts.filter((c: { full_name: string; email?: string; phone?: string; companies?: { name: string }; created_at?: string }) => {
    const matchesSearch = !search ||
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.companies?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesDate = (!dateFrom || (c.created_at ?? "") >= dateFrom) && (!dateTo || (c.created_at ?? "") <= dateTo + "T23:59:59");
    const matchesOwner = !isManager || !currentUser || (c as any).assigned_to === currentUser.id;
    return matchesSearch && matchesDate && matchesOwner;
  });

  const [showCount, setShowCount] = useState(100);
  const paginatedContacts = filtered.slice(0, showCount);
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
    if (!confirm(`Удалить ${selected.size} контактов? Это действие нельзя отменить.`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "contacts", ids }),
    });
    if (res.ok) { setContacts((prev: { id: string }[]) => prev.filter((c) => !ids.includes(c.id))); setSelected(new Set()); }
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
            placeholder="Поиск по имени, email, телефону..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4 }}
          />
        </div>
        <DateRangeFilter onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <ExportImportButtons entity="contacts" onImported={() => window.location.reload()} />
        <PurgeButton table="contacts" onPurged={() => window.location.reload()} />
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={13} /> Новый контакт
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
        <span>Контактов: <strong style={{ color: "#333" }}>{filtered.length}</strong></span>
      </div>

      <div className="bg-white overflow-hidden" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: "#aaa" }}>Контакты не найдены</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                  </th>
                  {["Имя", "Компания", "Телефон", "Email", "Ответственный", "Дата"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(paginatedContacts as any[]).map((contact: {
                  id: string; full_name: string; position?: string; phone?: string; email?: string;
                  telegram_id?: string; created_at: string; companies?: { id: string; name: string }; users?: { full_name: string };
                }) => {
                  const isSel = selected.has(contact.id);
                  return (
                    <tr key={contact.id} style={{ borderBottom: "1px solid #f0f0f0", background: isSel ? "#f0f7ff" : "transparent" }}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={isSel} onChange={() => toggleOne(contact.id)} className="cursor-pointer" style={{ accentColor: "#0067a5" }} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#e8f4fd", color: "#0067a5" }}>
                            {getInitials(contact.full_name)}
                          </div>
                          <div>
                            <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline" style={{ color: "#0067a5" }}>{contact.full_name}</Link>
                            {contact.position && <p className="text-xs" style={{ color: "#aaa" }}>{contact.position}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {contact.companies ? (
                          <Link href={`/companies/${contact.companies.id}`} className="text-xs hover:underline" style={{ color: "#555" }}>{contact.companies.name}</Link>
                        ) : <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`} className="text-xs flex items-center gap-1 hover:underline" style={{ color: "#555" }}>
                            <Phone size={11} style={{ color: "#aaa" }} />{contact.phone}
                          </a>
                        ) : <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="text-xs flex items-center gap-1 hover:underline truncate max-w-[160px]" style={{ color: "#555" }}>
                            <Mail size={11} style={{ color: "#aaa" }} />{contact.email}
                          </a>
                        ) : <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {contact.users ? (
                          <span className="text-xs" style={{ color: "#555" }}>{contact.users.full_name}</span>
                        ) : <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#aaa" }}>{formatDate(contact.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ShowMore hasMore={hasMore} remaining={remaining} total={totalFiltered} visibleCount={visibleCount} onShowMore={() => setShowCount((c) => c + 100)} onShowAll={() => setShowCount(999999)} />

      <CreateContactModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        companies={companies}
        users={users}
        onCreated={(c: unknown) => { setContacts((p: unknown[]) => [c, ...p]); setShowCreate(false); }}
      />
      <BulkTaskModal
        open={bulkTaskOpen}
        onClose={() => setBulkTaskOpen(false)}
        entityType="contact"
        entityIds={Array.from(selected)}
        onCreated={() => setSelected(new Set())}
      />
    </div>
  );
}

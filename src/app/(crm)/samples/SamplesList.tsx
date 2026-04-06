"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, FlaskConical, Trash2, Edit2, Truck } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import ExportImportButtons from "@/components/ui/ExportImportButtons";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const STATUS_LABELS: Record<string, string> = {
  new: "Новый", sent: "Отправлен", in_transit: "В пути", delivered: "Доставлен", refused: "Отказ",
};
const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  new: "default", sent: "warning", in_transit: "warning", delivered: "success", refused: "danger",
};
const DELIVERY_LABELS: Record<string, string> = { pvz: "ПВЗ", door: "До адреса" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SamplesList({ initialSamples, companies, contacts, users }: any) {
  const [samples, setSamples] = useState(initialSamples);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    company_id: "", venue_name: "", contact_id: "", contact_phone: "",
    materials: "", delivery_type: "pvz", delivery_address: "", track_number: "",
    sent_date: "", arrival_date: "", status: "new", comment: "",
    assigned_to: "", logist_id: "",
  });

  function resetForm() {
    setForm({
      company_id: "", venue_name: "", contact_id: "", contact_phone: "",
      materials: "", delivery_type: "pvz", delivery_address: "", track_number: "",
      sent_date: "", arrival_date: "", status: "new", comment: "",
      assigned_to: "", logist_id: "",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function openEdit(s: any) {
    setEditing(s);
    setForm({
      company_id: s.company_id ?? "", venue_name: s.venue_name ?? "",
      contact_id: s.contact_id ?? "", contact_phone: s.contact_phone ?? "",
      materials: s.materials ?? "", delivery_type: s.delivery_type ?? "pvz",
      delivery_address: s.delivery_address ?? "", track_number: s.track_number ?? "",
      sent_date: s.sent_date ?? "", arrival_date: s.arrival_date ?? "",
      status: s.status ?? "new", comment: s.comment ?? "",
      assigned_to: s.assigned_to ?? "", logist_id: s.logist_id ?? "",
    });
    setModalOpen(true);
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      company_id: form.company_id || null,
      venue_name: form.venue_name || null,
      contact_id: form.contact_id || null,
      contact_phone: form.contact_phone || null,
      materials: form.materials || null,
      delivery_type: form.delivery_type || null,
      delivery_address: form.delivery_address || null,
      track_number: form.track_number || null,
      sent_date: form.sent_date || null,
      arrival_date: form.arrival_date || null,
      status: form.status,
      comment: form.comment || null,
      assigned_to: form.assigned_to || null,
      logist_id: form.logist_id || null,
    };

    if (editing) {
      const oldTrack = editing.track_number;
      const { error } = await supabase.from("samples").update(payload).eq("id", editing.id);
      if (error) { alert(error.message); setSaving(false); return; }

      // Workflow: track number added → notify MOP
      if (!oldTrack && payload.track_number && payload.assigned_to) {
        const companyName = companies.find((c: { id: string }) => c.id === payload.company_id)?.name ?? "";
        await supabase.from("tasks").insert({
          title: `Трек-номер добавлен для ${companyName}: ${payload.track_number}. Отправь клиенту!`,
          entity_type: "sample",
          entity_id: editing.id,
          assigned_to: payload.assigned_to,
          created_by: user?.id,
          status: "pending",
          priority: "high",
        });
      }
    } else {
      const { data: created, error } = await supabase.from("samples")
        .insert({ ...payload, created_by: user?.id })
        .select("*")
        .single();
      if (error) { alert(error.message); setSaving(false); return; }

      // Workflow: new sample → create task for logist
      if (payload.logist_id && created) {
        const companyName = companies.find((c: { id: string }) => c.id === payload.company_id)?.name ?? "";
        await supabase.from("tasks").insert({
          title: `Новый пробник: ${companyName}, нужно оформить доставку`,
          entity_type: "sample",
          entity_id: created.id,
          assigned_to: payload.logist_id,
          created_by: user?.id,
          status: "pending",
          priority: "high",
        });
      }
    }

    setSaving(false);
    setModalOpen(false);
    window.location.reload();
  }

  async function bulkDelete() {
    if (!confirm(`Удалить ${selected.size} пробников?`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "samples", ids }),
    });
    if (res.ok) { setSamples((p: { id: string }[]) => p.filter((s) => !ids.includes(s.id))); setSelected(new Set()); }
    else { const d = await res.json(); alert("Ошибка: " + (d.error ?? "")); }
    setBulkDeleting(false);
  }

  async function deleteSample(id: string) {
    if (!confirm("Удалить пробник?")) return;
    const supabase = createClient();
    await supabase.from("samples").delete().eq("id", id);
    setSamples((p: { id: string }[]) => p.filter((s) => s.id !== id));
  }

  async function markClientNotified(id: string) {
    const supabase = createClient();
    await supabase.from("samples").update({ status: "in_transit", client_notified: true }).eq("id", id);
    window.location.reload();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = samples.filter((s: any) => {
    const matchSearch = !search ||
      s.companies?.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.venue_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.contacts?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.track_number?.toLowerCase().includes(search.toLowerCase()) ||
      s.materials?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || s.status === statusFilter;
    const matchAssigned = !assignedFilter || s.assigned_to === assignedFilter;
    return matchSearch && matchStatus && matchAssigned;
  });

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
  const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по компании, контакту, трек-номеру..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs px-2 py-1.5 rounded outline-none" style={{ border: "1px solid #d0d0d0" }}>
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}
          className="text-xs px-2 py-1.5 rounded outline-none" style={{ border: "1px solid #d0d0d0" }}>
          <option value="">Все МОПы</option>
          {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <ExportImportButtons entity="samples" onImported={() => window.location.reload()} />
        <Button onClick={openCreate} size="sm"><Plus size={13} /> Новый пробник</Button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 mb-3 rounded" style={{ background: "#e8f4fd", border: "1px solid #b3d4f0" }}>
          <span className="text-sm font-medium" style={{ color: "#0067a5" }}>Выбрано: {selected.size}</span>
          <button onClick={() => setSelected(new Set())} className="text-xs hover:underline" style={{ color: "#0067a5" }}>Снять</button>
          <div className="flex-1" />
          <Button size="sm" variant="danger" onClick={bulkDelete} loading={bulkDeleting}><Trash2 size={13} /> Удалить</Button>
        </div>
      )}

      <div className="flex gap-4 mb-3 text-xs" style={{ color: "#888" }}>
        <span>Пробников: <strong style={{ color: "#333" }}>{filtered.length}</strong></span>
      </div>

      <div className="bg-white overflow-hidden" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#aaa" }}>
            <FlaskConical size={36} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm">Пробников не найдено</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                  <th className="px-2 py-2 w-8">
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every((s: { id: string }) => selected.has(s.id))}
                      onChange={() => {
                        const ids = filtered.map((s: { id: string }) => s.id);
                        if (ids.every((id: string) => selected.has(id))) {
                          setSelected((p) => { const s = new Set(p); ids.forEach((id: string) => s.delete(id)); return s; });
                        } else {
                          setSelected((p) => { const s = new Set(p); ids.forEach((id: string) => s.add(id)); return s; });
                        }
                      }}
                      style={{ accentColor: "#0067a5" }} />
                  </th>
                  {["Компания", "Заведение", "Контакт", "Материалы", "Доставка", "Трек", "Даты", "Статус", "МОП", "Логист", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wide" style={{ color: "#888", fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {filtered.map((s: any) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #f0f0f0", background: selected.has(s.id) ? "#f0f7ff" : "transparent" }} className="hover:bg-gray-50">
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={selected.has(s.id)}
                        onChange={() => setSelected((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                        style={{ accentColor: "#0067a5" }} />
                    </td>
                    <td className="px-3 py-2">
                      {s.companies ? (
                        <Link href={`/companies/${s.companies.id}`} className="hover:underline" style={{ color: "#0067a5" }}>{s.companies.name}</Link>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "#333" }}>{s.venue_name || "—"}</td>
                    <td className="px-3 py-2">
                      {s.contacts ? (
                        <div>
                          <Link href={`/contacts/${s.contacts.id}`} className="hover:underline" style={{ color: "#0067a5" }}>{s.contacts.full_name}</Link>
                          {s.contact_phone && <p style={{ color: "#888" }}>{s.contact_phone}</p>}
                        </div>
                      ) : s.contact_phone ? <span style={{ color: "#888" }}>{s.contact_phone}</span> : "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "#333", maxWidth: 150 }}>
                      <span className="truncate block">{s.materials || "—"}</span>
                    </td>
                    <td className="px-3 py-2" style={{ color: "#666" }}>
                      {DELIVERY_LABELS[s.delivery_type] ?? "—"}
                      {s.delivery_address && <p className="truncate" style={{ color: "#aaa", maxWidth: 120 }}>{s.delivery_address}</p>}
                    </td>
                    <td className="px-3 py-2 font-mono" style={{ color: s.track_number ? "#0067a5" : "#ccc" }}>
                      {s.track_number || "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "#888" }}>
                      {s.sent_date && <p>Отпр: {formatDate(s.sent_date)}</p>}
                      {s.arrival_date && <p>Приб: {formatDate(s.arrival_date)}</p>}
                      {!s.sent_date && !s.arrival_date && "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANTS[s.status] ?? "default"}>
                        {STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                      {s.status === "sent" && !s.client_notified && (
                        <button onClick={() => markClientNotified(s.id)}
                          className="block mt-1 text-xs hover:underline" style={{ color: "#0067a5" }}>
                          Клиент уведомлён
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: "#666" }}>{s.users?.full_name ?? "—"}</td>
                    <td className="px-3 py-2" style={{ color: "#666" }}>{s.logist?.full_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(s)} className="p-1 rounded hover:bg-blue-50"><Edit2 size={12} style={{ color: "#0067a5" }} /></button>
                        <button onClick={() => deleteSample(s.id)} className="p-1 rounded hover:bg-red-50"><Trash2 size={12} style={{ color: "#c62828" }} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Редактировать пробник" : "Новый пробник"} size="lg">
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={lblStyle}>Компания</label>
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} style={inputStyle}>
                <option value="">Выберите...</option>
                {companies.map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Фактическое название заведения</label>
              <input value={form.venue_name} onChange={(e) => setForm({ ...form, venue_name: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={lblStyle}>Контактное лицо</label>
              <select value={form.contact_id} onChange={(e) => {
                const contact = contacts.find((c: { id: string }) => c.id === e.target.value);
                setForm({ ...form, contact_id: e.target.value, contact_phone: contact?.phone ?? form.contact_phone });
              }} style={inputStyle}>
                <option value="">Выберите...</option>
                {contacts.map((c: { id: string; full_name: string }) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Номер телефона</label>
              <input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={lblStyle}>Материалы (что отправляем)</label>
            <textarea value={form.materials} onChange={(e) => setForm({ ...form, materials: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={lblStyle}>Тип доставки</label>
              <select value={form.delivery_type} onChange={(e) => setForm({ ...form, delivery_type: e.target.value })} style={inputStyle}>
                <option value="pvz">ПВЗ</option>
                <option value="door">До адреса</option>
              </select>
            </div>
            <div className="col-span-2">
              <label style={lblStyle}>Адрес доставки</label>
              <input value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={lblStyle}>Трек-номер</label>
              <input value={form.track_number} onChange={(e) => setForm({ ...form, track_number: e.target.value })} style={inputStyle} placeholder="Заполнит логист" />
            </div>
            <div>
              <label style={lblStyle}>Дата отправки</label>
              <input type="date" value={form.sent_date} onChange={(e) => setForm({ ...form, sent_date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={lblStyle}>Дата прибытия</label>
              <input type="date" value={form.arrival_date} onChange={(e) => setForm({ ...form, arrival_date: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={lblStyle}>Статус</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Ответственный МОП</label>
              <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} style={inputStyle}>
                <option value="">Выберите...</option>
                {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Логист</label>
              <select value={form.logist_id} onChange={(e) => setForm({ ...form, logist_id: e.target.value })} style={inputStyle}>
                <option value="">Выберите...</option>
                {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={lblStyle}>Комментарий</label>
            <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button size="sm" onClick={handleSave} loading={saving}>
              <Truck size={13} /> {editing ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import SelectOrCreate from "@/components/ui/SelectOrCreate";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetchAll";

const STAGE_OPTIONS = [
  { value: "lead", label: "Лид" },
  { value: "proposal", label: "Предложение" },
  { value: "negotiation", label: "Переговоры" },
  { value: "order_assembly", label: "Сборка заказа" },
  { value: "won", label: "Выиграна" },
  { value: "lost", label: "Проиграна" },
];

const SOURCE_OPTIONS = [
  { value: "website", label: "Сайт" },
  { value: "referral", label: "Рекомендация" },
  { value: "cold_call", label: "Холодный звонок" },
  { value: "social", label: "Соцсети" },
  { value: "event", label: "Мероприятие" },
  { value: "other", label: "Другое" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function EditDealModal({ open, onClose, deal, onSaved }: { open: boolean; onClose: () => void; deal: any; onSaved: (deal: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; full_name: string; phone?: string | null; phone_mobile?: string | null; email?: string | null; companies?: { name: string } | { name: string }[] | null }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  // Delivery address picker (backlog v5 §3) — backed by /api/addresses so
  // a new address never overwrites existing company addresses.
  const [companyAddresses, setCompanyAddresses] = useState<{ id: string; address: string; kind: string; is_default: boolean }[]>([]);
  const [deliveryAddressId, setDeliveryAddressId] = useState<string>("");
  const [deliveryAddressText, setDeliveryAddressText] = useState<string>("");
  const [companyIdSelected, setCompanyIdSelected] = useState<string>("");
  // Track when reference data is loaded — Select uses defaultValue which only
  // applies on mount. If we render before users[] arrives, the "Ответственный"
  // dropdown shows "Выберите сотрудника" even though deal.assigned_to is set.
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (!open) { setDataReady(false); return; }
    const supabase = createClient();
    // fetchAll for contacts/companies — production has >1000 rows, default
    // Supabase select() truncates and freshly created entities don't appear.
    Promise.all([
      fetchAll<{ id: string; full_name: string; phone?: string | null; phone_mobile?: string | null; email?: string | null; companies?: { name: string } | { name: string }[] | null }>(
        supabase, "contacts", "id, full_name, phone, phone_mobile, email, companies(name)", { order: { column: "full_name" } }
      ),
      fetchAll<{ id: string; name: string }>(supabase, "companies", "id, name", { order: { column: "name" } }),
      supabase.from("users").select("id, full_name").eq("is_active", true),
    ]).then(([c, co, u]) => {
      setContacts(c);
      setCompanies(co);
      setUsers(u.data ?? []);
      setDataReady(true);
    }).catch(() => setDataReady(true));
    // Seed delivery address state from the deal we're editing.
    setDeliveryAddressId(deal?.delivery_address_id ?? "");
    setDeliveryAddressText(deal?.delivery_address_text ?? "");
    setCompanyIdSelected(deal?.company_id ?? "");
  }, [open, deal]);

  // Whenever the user picks a company, refresh its addresses for the picker.
  useEffect(() => {
    if (!companyIdSelected) { setCompanyAddresses([]); return; }
    fetch(`/api/addresses?company_id=${companyIdSelected}`)
      .then((r) => r.ok ? r.json() : { addresses: [] })
      .then((d) => setCompanyAddresses(d.addresses ?? []))
      .catch(() => setCompanyAddresses([]));
  }, [companyIdSelected]);

  async function addDeliveryAddress(text: string) {
    if (!companyIdSelected || !text.trim()) return;
    const res = await fetch("/api/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: companyIdSelected, address: text.trim(), kind: "delivery" }),
    });
    if (!res.ok) { alert("Не удалось сохранить адрес"); return; }
    const d = await res.json();
    setCompanyAddresses((prev) => [...prev, d.address]);
    setDeliveryAddressId(d.address.id);
    setDeliveryAddressText("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/deals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deal.id,
          title: fd.get("title") as string,
          stage: fd.get("stage") as string,
          source: (fd.get("source") as string) || null,
          amount: fd.get("amount") ? Number(fd.get("amount")) : null,
          contact_id: (fd.get("contact_id") as string) || null,
          company_id: (fd.get("company_id") as string) || null,
          assigned_to: (fd.get("assigned_to") as string) || null,
          description: (fd.get("description") as string) || null,
          objections: (fd.get("objections") as string) || null,
          delivery_address_id: deliveryAddressId || null,
          delivery_address_text: deliveryAddressText || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка"); setLoading(false); return; }

      // Cascade: if assigned_to changed on deal, cascade to company + linked entities
      const newAssignedTo = (fd.get("assigned_to") as string) || null;
      if (newAssignedTo && newAssignedTo !== deal.assigned_to) {
        await fetch("/api/responsible", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cascade_deal", deal_id: deal.id, new_assigned_to: newAssignedTo }),
        }).catch(() => {});
      }

      onSaved(data); onClose();
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Редактировать сделку" size="md">
      {!dataReady ? (
        <div className="p-6 text-center text-sm text-slate-400">Загрузка...</div>
      ) : (
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <Input label="Название сделки" name="title" defaultValue={deal?.title} required />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Стадия" name="stage" options={STAGE_OPTIONS} defaultValue={deal?.stage} />
          <Select label="Источник" name="source" options={SOURCE_OPTIONS} placeholder="Источник" defaultValue={deal?.source ?? ""} />
        </div>
        <Input label="Сумма (₽)" name="amount" type="number" defaultValue={deal?.amount ?? ""} min="0" />
        <div className="grid grid-cols-2 gap-3">
          <SelectOrCreate
            label="Контакт"
            name="contact_id"
            entityType="contact"
            options={contacts.map((c) => {
              const coName = Array.isArray(c.companies) ? c.companies[0]?.name : c.companies?.name;
              const parts: string[] = [c.full_name || "(без имени)"];
              if (coName) parts.push(coName);
              const ph = c.phone_mobile || c.phone;
              if (ph) parts.push(ph);
              if (c.email) parts.push(c.email);
              return { value: c.id, label: parts.join(" · ") };
            })}
            placeholder="Выберите контакт"
            defaultValue={deal?.contact_id ?? ""}
            onCreated={(item) => setContacts((prev) => [...prev, { id: item.id, full_name: item.label }])}
          />
          <SelectOrCreate
            label="Компания"
            name="company_id"
            entityType="company"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Выберите компанию"
            defaultValue={deal?.company_id ?? ""}
            onCreated={(item) => { setCompanies((prev) => [...prev, { id: item.id, name: item.label }]); setCompanyIdSelected(item.id); }}
          />
        </div>
        {/* Delivery address picker. Pulls from company.addresses (M:N).
            Free-text fallback for ad-hoc adresses. */}
        {companyIdSelected && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Адрес доставки</label>
            <select value={deliveryAddressId} onChange={(e) => setDeliveryAddressId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— не выбран —</option>
              {companyAddresses.map((a) => (
                <option key={a.id} value={a.id}>{({ legal: "Юр.", delivery: "Доставка", office: "Офис", other: "Другой" } as Record<string, string>)[a.kind] ?? a.kind} · {a.address}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input value={deliveryAddressText} onChange={(e) => setDeliveryAddressText(e.target.value)}
                placeholder="...или введите новый адрес и нажмите «Сохранить»"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none" />
              <Button type="button" variant="secondary" size="sm" onClick={() => addDeliveryAddress(deliveryAddressText)} disabled={!deliveryAddressText.trim()}>+ Сохранить</Button>
            </div>
            <p className="text-xs" style={{ color: "#888" }}>Новый адрес добавляется в карточку компании, не затирая существующие.</p>
          </div>
        )}
        <Select
          label="Ответственный"
          name="assigned_to"
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          placeholder="Выберите сотрудника"
          defaultValue={deal?.assigned_to ?? ""}
        />
        <Textarea label="Описание" name="description" defaultValue={deal?.description ?? ""} />
        <Textarea label="Возражения" name="objections" defaultValue={deal?.objections ?? ""} placeholder="Что говорил клиент, почему сомневается..." rows={3} />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Сохранить</Button>
        </div>
      </form>
      )}
    </Modal>
  );
}

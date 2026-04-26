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
import { apiPut } from "@/lib/api/client";

const STATUS_OPTIONS = [
  { value: "new", label: "Новая" },
  { value: "callback", label: "Перезвонить/написать" },
  { value: "in_progress", label: "В работе" },
  { value: "samples", label: "Пробники" },
  { value: "samples_shipped", label: "Пробники отгружены" },
  { value: "rejected", label: "Отказ" },
];

const SOURCE_OPTIONS = [
  { value: "website", label: "Сайт" },
  { value: "referral", label: "Рекомендация" },
  { value: "cold_call", label: "Холодный звонок" },
  { value: "social", label: "Соцсети" },
  { value: "event", label: "Мероприятие" },
  { value: "other", label: "Другое" },
];

type ContactRow = { id: string; full_name: string; companies?: { name: string } | { name: string }[] | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function EditLeadModal({ open, onClose, lead, onSaved }: { open: boolean; onClose: () => void; lead: any; onSaved: (lead: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  // See EditDealModal: defaultValue is bound at mount, render after data arrives.
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (!open) { setDataReady(false); return; }
    const supabase = createClient();
    // fetchAll for contacts/companies — there are >1000 rows in production
    // and the default Supabase select() caps at 1000, so freshly created
    // contacts (e.g. "Игорь") never appear in the dropdown otherwise.
    Promise.all([
      fetchAll<ContactRow>(supabase, "contacts", "id, full_name, companies(name)", { order: { column: "full_name" } }),
      fetchAll<{ id: string; name: string }>(supabase, "companies", "id, name", { order: { column: "name" } }),
      supabase.from("users").select("id, full_name").eq("is_active", true),
    ]).then(([c, co, u]) => {
      setContacts(c);
      setCompanies(co);
      setUsers(u.data ?? []);
      setDataReady(true);
    }).catch(() => setDataReady(true));
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const { data, error: err } = await apiPut<typeof lead>("/api/leads", {
      id: lead.id,
      title: fd.get("title") as string,
      status: fd.get("status") as string,
      source: (fd.get("source") as string) || null,
      contact_id: (fd.get("contact_id") as string) || null,
      company_id: (fd.get("company_id") as string) || null,
      assigned_to: (fd.get("assigned_to") as string) || null,
      telegram_username: (fd.get("telegram_username") as string) || null,
      description: (fd.get("description") as string) || null,
    });

    if (err || !data) { setError(err || "Не удалось сохранить"); setLoading(false); return; }
    onSaved(data); onClose();
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Редактировать лид" size="md">
      {!dataReady ? (
        <div className="p-6 text-center text-sm text-slate-400">Загрузка...</div>
      ) : (
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <Input label="Название лида" name="title" defaultValue={lead?.title} required />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Статус" name="status" options={STATUS_OPTIONS} defaultValue={lead?.status} />
          <Select label="Источник" name="source" options={SOURCE_OPTIONS} placeholder="Выберите источник" defaultValue={lead?.source ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectOrCreate
            label="Контакт"
            name="contact_id"
            entityType="contact"
            options={contacts.map((c) => {
              const coName = Array.isArray(c.companies) ? c.companies[0]?.name : c.companies?.name;
              return { value: c.id, label: c.full_name + (coName ? ` · ${coName}` : "") };
            })}
            placeholder="Выберите контакт"
            defaultValue={lead?.contact_id ?? ""}
            onCreated={(item) => setContacts((prev) => [...prev, { id: item.id, full_name: item.label }])}
          />
          <SelectOrCreate
            label="Компания"
            name="company_id"
            entityType="company"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Выберите компанию"
            defaultValue={lead?.company_id ?? ""}
            onCreated={(item) => setCompanies((prev) => [...prev, { id: item.id, name: item.label }])}
          />
        </div>
        <Select
          label="Ответственный"
          name="assigned_to"
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          placeholder="Выберите сотрудника"
          defaultValue={lead?.assigned_to ?? ""}
        />
        <Input label="Telegram контакта" name="telegram_username" defaultValue={lead?.telegram_username ?? ""} placeholder="@username" />
        <Textarea label="Описание" name="description" defaultValue={lead?.description ?? ""} />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Сохранить</Button>
        </div>
      </form>
      )}
    </Modal>
  );
}

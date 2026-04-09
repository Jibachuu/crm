"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import SelectOrCreate from "@/components/ui/SelectOrCreate";
import { createClient } from "@/lib/supabase/client";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function EditLeadModal({ open, onClose, lead, onSaved }: { open: boolean; onClose: () => void; lead: any; onSaved: (lead: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; full_name: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("contacts").select("id, full_name").order("full_name"),
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("users").select("id, full_name").eq("is_active", true),
    ]).then(([c, co, u]) => {
      setContacts(c.data ?? []);
      setCompanies(co.data ?? []);
      setUsers(u.data ?? []);
    });
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data, error: err } = await supabase
      .from("leads")
      .update({
        title: fd.get("title") as string,
        status: fd.get("status") as string,
        source: (fd.get("source") as string) || null,
        contact_id: (fd.get("contact_id") as string) || null,
        company_id: (fd.get("company_id") as string) || null,
        assigned_to: (fd.get("assigned_to") as string) || null,
        telegram_username: (fd.get("telegram_username") as string) || null,
        description: (fd.get("description") as string) || null,
      })
      .eq("id", lead.id)
      .select(`*, contacts(id, full_name, phone, email), companies(id, name), users!leads_assigned_to_fkey(id, full_name)`)
      .single();

    if (err) setError(err.message);
    else { onSaved(data); onClose(); }
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Редактировать лид" size="md">
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
            options={contacts.map((c) => ({ value: c.id, label: c.full_name }))}
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
    </Modal>
  );
}

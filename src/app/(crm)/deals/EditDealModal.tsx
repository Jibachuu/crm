"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import SelectOrCreate from "@/components/ui/SelectOrCreate";
import { createClient } from "@/lib/supabase/client";

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
      .from("deals")
      .update({
        title: fd.get("title") as string,
        stage: fd.get("stage") as string,
        source: (fd.get("source") as string) || null,
        amount: fd.get("amount") ? Number(fd.get("amount")) : null,
        contact_id: (fd.get("contact_id") as string) || null,
        company_id: (fd.get("company_id") as string) || null,
        assigned_to: (fd.get("assigned_to") as string) || null,
        description: (fd.get("description") as string) || null,
        objections: (fd.get("objections") as string) || null,
      })
      .eq("id", deal.id)
      .select(`*, contacts(id, full_name, phone, email), companies(id, name), users!deals_assigned_to_fkey(id, full_name)`)
      .single();

    if (err) setError(err.message);
    else { onSaved(data); onClose(); }
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Редактировать сделку" size="md">
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
            options={contacts.map((c) => ({ value: c.id, label: c.full_name }))}
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
            onCreated={(item) => setCompanies((prev) => [...prev, { id: item.id, name: item.label }])}
          />
        </div>
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
    </Modal>
  );
}

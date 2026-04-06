"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
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
export default function CreateDealModal({ open, onClose, users, onCreated }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      title: fd.get("title") as string,
      source: (fd.get("source") as string) || null,
      stage: (fd.get("stage") as string) || "lead",
      amount: fd.get("amount") ? Number(fd.get("amount")) : null,
      description: (fd.get("description") as string) || null,
      assigned_to: (fd.get("assigned_to") as string) || null,
      created_by: user.id,
    };

    const { data, error: err } = await supabase
      .from("deals")
      .insert(payload)
      .select(`*, contacts(id, full_name), companies(id, name), users!deals_assigned_to_fkey(id, full_name)`)
      .single();

    if (err) setError(err.message);
    else onCreated(data);
    setLoading(false);
  }

  const userOptions = users.map((u: { id: string; full_name?: string; email?: string }) => ({ value: u.id, label: u.full_name ?? u.email }));

  return (
    <Modal open={open} onClose={onClose} title="Новая сделка" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <Input label="Название сделки" name="title" placeholder="Название сделки" required />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Стадия" name="stage" options={STAGE_OPTIONS} />
          <Select label="Источник" name="source" options={SOURCE_OPTIONS} placeholder="Источник" />
        </div>
        <Input label="Сумма (₽)" name="amount" type="number" placeholder="0" min="0" />
        <Select label="Ответственный" name="assigned_to" options={userOptions} placeholder="Выберите сотрудника" />
        <Textarea label="Описание" name="description" placeholder="Дополнительная информация..." />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Создать сделку</Button>
        </div>
      </form>
    </Modal>
  );
}

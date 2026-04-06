"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

const STATUS_OPTIONS = [
  { value: "new", label: "Новая" },
  { value: "callback", label: "Перезвонить/написать" },
  { value: "in_progress", label: "В работе" },
  { value: "samples", label: "Пробники" },
  { value: "samples_shipped", label: "Пробники отгружены" },
  { value: "invoice", label: "Счёт на предоплату" },
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

interface CreateLeadModalProps {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCreated: (lead: any) => void;
}

export default function CreateLeadModal({ open, onClose, users, onCreated }: CreateLeadModalProps) {
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
      status: (fd.get("status") as string) || "new",
      description: (fd.get("description") as string) || null,
      assigned_to: (fd.get("assigned_to") as string) || null,
      created_by: user.id,
    };

    const { data, error: err } = await supabase
      .from("leads")
      .insert(payload)
      .select(`*, contacts(id, full_name), companies(id, name), users!leads_assigned_to_fkey(id, full_name)`)
      .single();

    if (err) {
      setError(err.message);
    } else {
      onCreated(data);
    }
    setLoading(false);
  }

  const userOptions = users.map((u) => ({ value: u.id, label: u.full_name ?? u.email }));

  return (
    <Modal open={open} onClose={onClose} title="Новый лид" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}
        <Input label="Название лида" name="title" placeholder="Например: Запрос на поставку" required />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Статус" name="status" options={STATUS_OPTIONS} />
          <Select label="Источник" name="source" options={SOURCE_OPTIONS} placeholder="Выберите источник" />
        </div>
        <Select
          label="Ответственный"
          name="assigned_to"
          options={userOptions}
          placeholder="Выберите сотрудника"
        />
        <Textarea label="Описание" name="description" placeholder="Дополнительная информация..." />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Создать лид</Button>
        </div>
      </form>
    </Modal>
  );
}

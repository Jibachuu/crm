"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CreateContactModal({ open, onClose, companies, users, onCreated }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fd.get("full_name"),
          position: fd.get("position"),
          phone: fd.get("phone"),
          email: fd.get("email"),
          telegram_id: fd.get("telegram_id"),
          maks_id: fd.get("maks_id"),
          company_id: fd.get("company_id"),
          description: fd.get("description"),
          assigned_to: fd.get("assigned_to"),
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Ошибка");
      else onCreated(data);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }

  const companyOptions = companies.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }));
  const userOptions = users.map((u: { id: string; full_name?: string }) => ({ value: u.id, label: u.full_name }));

  return (
    <Modal open={open} onClose={onClose} title="Новый контакт" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <Input label="Полное имя" name="full_name" placeholder="Иван Иванов" required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Должность" name="position" placeholder="Менеджер" />
          <Select label="Компания" name="company_id" options={companyOptions} placeholder="Выберите компанию" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Телефон" name="phone" type="tel" placeholder="+7 (999) 000-00-00" />
          <Input label="Email" name="email" type="email" placeholder="contact@example.com" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Telegram ID" name="telegram_id" placeholder="username" />
          <Input label="МАКС ID" name="maks_id" placeholder="ID в МАКС" />
        </div>
        <Select label="Ответственный" name="assigned_to" options={userOptions} placeholder="Выберите сотрудника" />
        <Textarea label="Описание" name="description" placeholder="Дополнительная информация..." />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Создать контакт</Button>
        </div>
      </form>
    </Modal>
  );
}

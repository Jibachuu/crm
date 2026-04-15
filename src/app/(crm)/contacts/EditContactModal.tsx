"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function EditContactModal({ open, onClose, contact, onSaved }: { open: boolean; onClose: () => void; contact: any; onSaved: (contact: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (!open) { setDataReady(false); return; }
    const supabase = createClient();
    Promise.all([
      Promise.resolve(supabase.from("companies").select("id, name").order("name").limit(2000)),
      Promise.resolve(supabase.from("users").select("id, full_name").eq("is_active", true)),
    ]).then(([co, u]) => {
      setCompanies(co.data ?? []);
      setUsers(u.data ?? []);
      setDataReady(true);
    }).catch(() => {
      setDataReady(true);
    });
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/contacts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: contact.id,
          full_name: fd.get("full_name"),
          last_name: fd.get("last_name"),
          middle_name: fd.get("middle_name"),
          position: fd.get("position"),
          phone: fd.get("phone"),
          phone_mobile: fd.get("phone_mobile"),
          phone_other: fd.get("phone_other"),
          email: fd.get("email"),
          email_other: fd.get("email_other"),
          telegram_username: fd.get("telegram_username"),
          telegram_id: fd.get("telegram_id"),
          maks_id: fd.get("maks_id"),
          company_id: fd.get("company_id"),
          assigned_to: fd.get("assigned_to"),
          description: fd.get("description"),
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Ошибка");
      else { onSaved(data); onClose(); }
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Редактировать контакт" size="md">
      {!dataReady ? (
        <div className="p-6 text-center text-sm text-slate-400">Загрузка...</div>
      ) : (
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          <Input label="Фамилия" name="last_name" defaultValue={contact?.last_name ?? ""} />
          <Input label="Полное имя *" name="full_name" defaultValue={contact?.full_name} required />
          <Input label="Отчество" name="middle_name" defaultValue={contact?.middle_name ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Должность" name="position" defaultValue={contact?.position ?? ""} />
          <Select
            label="Компания"
            name="company_id"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Выберите компанию"
            defaultValue={contact?.company_id ?? ""}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Телефон рабочий" name="phone" type="tel" defaultValue={contact?.phone ?? ""} />
          <Input label="Телефон мобильный" name="phone_mobile" type="tel" defaultValue={contact?.phone_mobile ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Другой телефон" name="phone_other" type="tel" defaultValue={contact?.phone_other ?? ""} />
          <Input label="Email рабочий" name="email" type="email" defaultValue={contact?.email ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email другой" name="email_other" type="email" defaultValue={contact?.email_other ?? ""} />
          <Input label="Telegram username" name="telegram_username" defaultValue={contact?.telegram_username ?? ""} placeholder="@username" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Telegram ID" name="telegram_id" defaultValue={contact?.telegram_id ?? ""} />
          <Input label="МАКС ID" name="maks_id" defaultValue={contact?.maks_id ?? ""} />
        </div>
        <Select
          label="Ответственный"
          name="assigned_to"
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          placeholder="Выберите сотрудника"
          defaultValue={contact?.assigned_to ?? ""}
        />
        <Textarea label="Описание" name="description" defaultValue={contact?.description ?? ""} />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Сохранить</Button>
        </div>
      </form>
      )}
    </Modal>
  );
}

"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SelectOrCreate from "@/components/ui/SelectOrCreate";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { Check, Loader2, X as XIcon } from "lucide-react";

interface LinkStatus {
  state: "idle" | "searching" | "found" | "not-found" | "error";
  handle?: string;
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CreateContactModal({ open, onClose, companies, users, onCreated }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // R-M1: результат автопривязки к TG/MAX
  const [tgStatus, setTgStatus] = useState<LinkStatus>({ state: "idle" });
  const [maxStatus, setMaxStatus] = useState<LinkStatus>({ state: "idle" });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTgStatus({ state: "idle" });
    setMaxStatus({ state: "idle" });

    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("full_name") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    const tgHandle = String(fd.get("telegram_username") || "").trim().replace(/^@/, "");

    try {
      // 1. Создаём контакт в CRM
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name,
          position: fd.get("position"),
          phone,
          email: fd.get("email"),
          telegram_username: tgHandle || undefined,
          company_id: fd.get("company_id"),
          description: fd.get("description"),
          assigned_to: fd.get("assigned_to"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        setLoading(false);
        return;
      }
      const contactId = data.id;

      // 2. Параллельно ищем в TG и MAX
      const needTg = !!(phone || tgHandle);
      const needMax = !!phone;
      if (needTg) setTgStatus({ state: "searching" });
      if (needMax) setMaxStatus({ state: "searching" });

      const [tgRes, maxRes] = await Promise.all([
        needTg ? searchTelegram({ phone, username: tgHandle, name: full_name }) : Promise.resolve(null),
        needMax ? searchMax({ phone, name: full_name }) : Promise.resolve(null),
      ]);

      // 3. Обновляем контакт найденными идентификаторами
      const updates: Record<string, string> = {};
      if (tgRes?.ok && tgRes.user) {
        setTgStatus({ state: "found", handle: tgRes.user.username || tgRes.user.phone || String(tgRes.user.id) });
        if (tgRes.user.id) updates.telegram_id = String(tgRes.user.id);
        if (tgRes.user.username) updates.telegram_username = String(tgRes.user.username);
      } else if (needTg) {
        setTgStatus({ state: "not-found", error: tgRes?.error || undefined });
      }
      if (maxRes?.ok && maxRes.contact) {
        const maxId = String(maxRes.chatId || maxRes.contact.id || "");
        setMaxStatus({ state: "found", handle: maxRes.contact.name || maxId });
        if (maxId) updates.maks_id = maxId;
      } else if (needMax) {
        setMaxStatus({ state: "not-found", error: maxRes?.error || undefined });
      }

      if (Object.keys(updates).length > 0 && contactId) {
        await fetch("/api/contacts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: contactId, ...updates }),
        }).catch(() => {});
        Object.assign(data, updates);
      }

      // 4. Небольшая пауза чтобы пользователь увидел результат
      await new Promise((r) => setTimeout(r, 700));
      onCreated(data);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  async function searchTelegram({ phone, username, name }: { phone?: string; username?: string; name?: string }) {
    try {
      // Приоритет username, потом phone
      const body: Record<string, string> = {};
      if (username) body.username = username;
      else if (phone) { body.phone = phone; if (name) body.firstName = name; }
      const r = await fetch("/api/telegram/add-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await r.json();
    } catch { return null; }
  }

  async function searchMax({ phone, name }: { phone?: string; name?: string }) {
    if (!phone) return null;
    try {
      const r = await fetch("/api/max", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_contact", phone, firstName: name || "", lastName: "" }),
      });
      return await r.json();
    } catch { return null; }
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
          <SelectOrCreate
            label="Компания"
            name="company_id"
            entityType="company"
            options={companyOptions}
            placeholder="Поиск по названию или ИНН..."
            onCreated={() => {}}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Телефон" name="phone" type="tel" placeholder="+7 (999) 000-00-00" />
          <Input label="Email" name="email" type="email" placeholder="contact@example.com" />
        </div>
        <Input label="Telegram @username" name="telegram_username" placeholder="ivanov (если знаешь — иначе найдётся по номеру)" />
        <Select label="Ответственный" name="assigned_to" options={userOptions} placeholder="Выберите сотрудника" />
        <Textarea label="Описание" name="description" placeholder="Дополнительная информация..." />

        {/* Индикатор автопривязки к мессенджерам */}
        {(tgStatus.state !== "idle" || maxStatus.state !== "idle") && (
          <div className="p-3 rounded-lg text-sm space-y-2" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
            <StatusRow label="Telegram" status={tgStatus} />
            <StatusRow label="МАКС" status={maxStatus} />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={loading}>Создать и найти в TG/MAX</Button>
        </div>
      </form>
    </Modal>
  );
}

function StatusRow({ label, status }: { label: string; status: LinkStatus }) {
  if (status.state === "idle") return null;
  const style = { display: "flex", alignItems: "center", gap: 8, fontSize: 13 } as const;
  if (status.state === "searching") return <div style={style}><Loader2 size={14} className="animate-spin" style={{ color: "#0067a5" }} /> {label}: ищем...</div>;
  if (status.state === "found") return <div style={style}><Check size={14} style={{ color: "#2e7d32" }} /> {label}: найден{status.handle ? ` (${status.handle})` : ""}</div>;
  if (status.state === "not-found") return <div style={style}><XIcon size={14} style={{ color: "#c62828" }} /> {label}: не найден{status.error ? ` — ${status.error}` : ""}</div>;
  return null;
}

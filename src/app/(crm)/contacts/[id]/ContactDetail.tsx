"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Edit2, Trash2, Phone, Mail, Building2, MessageSquare, Plus, CheckSquare } from "lucide-react";
import TaskItem from "@/components/ui/TaskItem";
import TelegramChat from "@/components/ui/TelegramChat";
import MaxChat from "@/components/ui/MaxChat";
import EmailThread from "@/components/ui/EmailThread";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import ClientTimeIndicator from "@/components/ui/ClientTimeIndicator";
import Badge from "@/components/ui/Badge";
import CreateTaskModal from "@/components/ui/CreateTaskModal";
import CustomFieldsSection from "@/components/ui/CustomFieldsSection";
import CommunicationsTimeline from "@/components/ui/CommunicationsTimeline";
import EditContactModal from "../EditContactModal";
import { formatDate, formatDateTime, getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const CHANNEL_ICONS: Record<string, string> = { email: "✉️", telegram: "💬", phone: "📞", maks: "🔵", note: "📝" };
const CHANNEL_LABELS: Record<string, string> = { email: "Email", telegram: "Telegram", phone: "Звонок", maks: "МАКС", note: "Заметка" };
const PRIORITY_LABELS: Record<string, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };
const LEAD_STATUS: Record<string, string> = { new: "Новая", callback: "Перезвонить/написать", in_progress: "В работе", samples: "Пробники", samples_shipped: "Пробники отгружены", invoice: "Счёт на предоплату", rejected: "Отказ", converted: "Конвертирован" };
const DEAL_STAGE: Record<string, string> = { lead: "Лид", proposal: "Предложение", negotiation: "Переговоры", order_assembly: "Сборка заказа", won: "Выиграна", lost: "Проиграна" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ContactDetail({ contact: initialContact, communications: initialComms, tasks: initialTasks, leads, deals }: any) {
  const router = useRouter();
  const [contact, setContact] = useState(initialContact);
  const [communications, setCommunications] = useState(initialComms);
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTab, setActiveTab] = useState<"info" | "communications" | "tasks" | "email" | "telegram" | "maks">("info");
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [calling, setCalling] = useState(false);
  const [linking, setLinking] = useState(false);

  async function callPhone(phone: string) {
    setCalling(true);
    const res = await fetch("/api/zadarma/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (data.status === "calling") {
      alert(`Звонок инициирован на ${phone}. Ответьте на входящий звонок Zadarma.`);
    } else {
      alert(`Ошибка: ${data.error ?? "Не удалось инициировать звонок"}`);
    }
    setCalling(false);
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("communications")
      .insert({ entity_type: "contact", entity_id: contact.id, channel: "note", direction: "outbound", body: noteText.trim(), created_by: user?.id ?? null })
      .select("*, users!communications_created_by_fkey(full_name)")
      .single();
    if (data) { setCommunications((p: unknown[]) => [data, ...p]); setNoteText(""); }
    setNoteLoading(false);
  }

  async function deleteContact() {
    if (!confirm("Удалить контакт? Это действие нельзя отменить.")) return;
    setDeleteLoading(true);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "contacts", ids: [contact.id] }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert("Не удалось удалить: " + (data.error ?? "неизвестная ошибка"));
      setDeleteLoading(false);
      return;
    }
    router.push("/contacts");
  }

  async function linkMessengers() {
    setLinking(true);
    try {
      const res = await fetch("/api/contacts/link-messengers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id }),
      });
      const data = await res.json();
      if (data.ok && data.updates) {
        setContact((prev: Record<string, unknown>) => ({ ...prev, ...data.updates }));
        const parts: string[] = [];
        if (data.linked.telegram) parts.push("Telegram");
        if (data.linked.maks) parts.push("МАКС");
        alert(parts.length ? `Привязано: ${parts.join(", ")}` : "Мессенджеры не найдены по номеру телефона");
      } else {
        alert(data.error || "Не удалось найти контакт в мессенджерах");
      }
    } catch { alert("Ошибка при поиске"); }
    setLinking(false);
  }

  const hasPhone = contact.phone || contact.phone_mobile || contact.phone_other;
  const missingMessenger = !contact.telegram_id || !contact.maks_id;

  const tabs = [
    { id: "info", label: "Информация" },
    { id: "communications", label: `Коммуникации (${communications.length})` },
    { id: "tasks", label: `Задачи (${tasks.length})` },
    ...(contact.email ? [{ id: "email", label: "📧 Почта" }] : []),
    ...(contact.telegram_id ? [{ id: "telegram", label: "💬 Telegram" }] : []),
    ...(contact.maks_id ? [{ id: "maks", label: "🔵 МАКС" }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <Link href="/contacts" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft size={16} /> Все контакты
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 size={14} /> Редактировать
          </Button>
          <Button variant="danger" size="sm" onClick={deleteContact} loading={deleteLoading}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardBody>
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-lg font-bold text-blue-700">
                  {getInitials(contact.full_name)}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{contact.full_name}</h2>
                  {contact.position && <p className="text-sm text-slate-500">{contact.position}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {contact.phone && (
                  <div className="flex items-center gap-1.5">
                    <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                      <Phone size={13} /> {contact.phone}
                    </a>
                    <button onClick={() => callPhone(contact.phone)} disabled={calling}
                      className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-1.5 py-0.5 rounded-full disabled:opacity-50">
                      {calling ? "..." : "📞"}
                    </button>
                  </div>
                )}
                {contact.phone_mobile && (
                  <a href={`tel:${contact.phone_mobile}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                    <Phone size={13} /> {contact.phone_mobile} <span className="text-xs text-slate-400">моб.</span>
                  </a>
                )}
                {contact.phone_other && (
                  <a href={`tel:${contact.phone_other}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                    <Phone size={13} /> {contact.phone_other}
                  </a>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                    <Mail size={13} /> {contact.email}
                  </a>
                )}
                {contact.email_other && (
                  <a href={`mailto:${contact.email_other}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                    <Mail size={13} /> {contact.email_other}
                  </a>
                )}
                {contact.telegram_username && <span className="text-sm text-slate-600">💬 @{contact.telegram_username}</span>}
                {contact.telegram_id && <span className="text-sm text-slate-600">💬 ID: {contact.telegram_id}</span>}
                {contact.maks_id && <span className="text-sm text-slate-600">🔵 МАКС: {contact.maks_id}</span>}
                {hasPhone && missingMessenger && (
                  <button onClick={linkMessengers} disabled={linking}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors hover:bg-blue-50 disabled:opacity-50"
                    style={{ color: "#0067a5", border: "1px solid #b3e0f5" }}>
                    {linking ? "Поиск..." : "Привязать мессенджеры"}
                  </button>
                )}
              </div>
              {(contact.last_name || contact.middle_name) && (
                <p className="mt-2 text-xs text-slate-400">
                  {[contact.last_name, contact.middle_name].filter(Boolean).join(" · ")}
                </p>
              )}
              {contact.description && <p className="mt-3 text-sm text-slate-600">{contact.description}</p>}
            </CardBody>
          </Card>

          <div>
            <div className="flex border-b border-slate-200 mb-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "info" && (
              <div className="space-y-4">
                <div className="text-sm text-slate-600 space-y-2">
                  <p>Создан: {formatDate(contact.created_at)}</p>
                  <p>Обновлён: {formatDate(contact.updated_at)}</p>
                </div>

                {leads?.length > 0 && (
                  <Card>
                    <div className="px-6 py-3 border-b border-slate-100">
                      <h3 className="font-semibold text-slate-900">Лиды ({leads.length})</h3>
                    </div>
                    <CardBody className="p-0">
                      <ul className="divide-y divide-slate-100">
                        {leads.map((lead: { id: string; title: string; status: string }) => (
                          <li key={lead.id}>
                            <Link href={`/leads/${lead.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                              <span className="text-sm text-blue-600 hover:underline">{lead.title}</span>
                              <span className="text-xs text-slate-500">{LEAD_STATUS[lead.status] ?? lead.status}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                )}

                {deals?.length > 0 && (
                  <Card>
                    <div className="px-6 py-3 border-b border-slate-100">
                      <h3 className="font-semibold text-slate-900">Сделки ({deals.length})</h3>
                    </div>
                    <CardBody className="p-0">
                      <ul className="divide-y divide-slate-100">
                        {deals.map((deal: { id: string; title: string; stage: string; amount: number }) => (
                          <li key={deal.id}>
                            <Link href={`/deals/${deal.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                              <span className="text-sm text-blue-600 hover:underline">{deal.title}</span>
                              <span className="text-xs text-slate-500">{DEAL_STAGE[deal.stage] ?? deal.stage}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                )}
              </div>
            )}

            {activeTab === "communications" && (
              <div className="space-y-3">
                <Card>
                  <CardBody>
                    <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Добавить заметку..." rows={2}
                      className="w-full text-sm border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    <div className="flex justify-end mt-2">
                      <Button size="sm" onClick={addNote} loading={noteLoading} disabled={!noteText.trim()}>
                        <MessageSquare size={14} /> Добавить заметку
                      </Button>
                    </div>
                  </CardBody>
                </Card>
                <CommunicationsTimeline entityType="contact" entityId={contact.id} />
              </div>
            )}

            {activeTab === "email" && contact.email && (
              <EmailThread email={contact.email} compact entityType="contact" entityId={contact.id} />
            )}

            {activeTab === "telegram" && contact.telegram_id && (
              <div>
                <p className="text-xs mb-2" style={{ color: "#888" }}>
                  Переписка с <strong>{contact.full_name}</strong>
                  {contact.telegram_id && <> · <span style={{ color: "#0067a5" }}>@{contact.telegram_id}</span></>}
                </p>
                <TelegramChat peer={contact.telegram_id} compact />
              </div>
            )}

            {activeTab === "maks" && contact.maks_id && (
              <div>
                <p className="text-xs mb-2" style={{ color: "#888" }}>
                  Переписка в МАКС с <strong>{contact.full_name}</strong>
                </p>
                <MaxChat chatId={contact.maks_id} compact />
              </div>
            )}

            {activeTab === "tasks" && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setTaskOpen(true)}>
                    <Plus size={14} /> Создать задачу
                  </Button>
                </div>
                {tasks.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Задачи отсутствуют</p>
                ) : (
                  tasks.map((task: { id: string; title: string; status: string; priority: string; due_date?: string; users?: { full_name: string } }) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onUpdated={(t) => setTasks((prev: { id: string }[]) => prev.map((p) => p.id === t.id ? t : p))}
                      onDeleted={(id) => setTasks((prev: { id: string }[]) => prev.filter((p) => p.id !== id))}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Информация</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Создан</span>
                  <span className="text-slate-700">{formatDate(contact.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Обновлён</span>
                  <span className="text-slate-700">{formatDate(contact.updated_at)}</span>
                </div>
              </div>
            </CardBody>
          </Card>

          {contact.companies && (
            <Card>
              <CardBody>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Компания</h3>
                <Link href={`/companies/${contact.companies.id}`} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                  <Building2 size={14} /> {contact.companies.name}
                </Link>
                <div className="mt-2">
                  <ClientTimeIndicator timezone={contact.companies.timezone} region={contact.companies.city || contact.companies.region} address={contact.companies.legal_address} />
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              <CustomFieldsSection entityType="contact" entityId={contact.id} />
            </CardBody>
          </Card>
        </div>
      </div>

      <EditContactModal open={editOpen} onClose={() => setEditOpen(false)} contact={contact} onSaved={setContact} />
      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        entityType="contact"
        entityId={contact.id}
        onCreated={(task) => setTasks((p: unknown[]) => [task, ...p])}
      />
    </div>
  );
}

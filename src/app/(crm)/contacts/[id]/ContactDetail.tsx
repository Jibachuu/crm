"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Edit2, Trash2, Phone, Mail, Building2, MessageSquare, Plus, CheckSquare, Merge, Search, X } from "lucide-react";
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
import { apiPost } from "@/lib/api/client";
import PhoneLink from "@/components/ui/PhoneLink";

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
  const [commsRefreshKey, setCommsRefreshKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [calling, setCalling] = useState(false);
  const [linking, setLinking] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [mergeResults, setMergeResults] = useState<any[]>([]);
  const [mergeSelected, setMergeSelected] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);

  async function callPhone(phone: string) {
    setCalling(true);
    const res = await fetch("/api/novofon/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (data.status === "success") {
      alert(`Звонок инициирован на ${phone}. Ответьте на входящий звонок.`);
    } else {
      alert(`Ошибка: ${data.error ?? data.message ?? "Не удалось инициировать звонок"}`);
    }
    setCalling(false);
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteLoading(true);
    const { data, error } = await apiPost<typeof communications[number]>("/api/communications", {
      entity_type: "contact", entity_id: contact.id, channel: "note", direction: "outbound", body: noteText.trim(),
    });
    if (error || !data) { alert("Не удалось сохранить заметку: " + (error ?? "")); setNoteLoading(false); return; }
    setCommunications((p: unknown[]) => [data, ...p]);
    setNoteText("");
    setCommsRefreshKey((k) => k + 1);
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

  async function searchMerge(q: string) {
    setMergeSearch(q);
    if (q.length < 2) { setMergeResults([]); return; }
    const { data } = await createClient().from("contacts")
      .select("id, full_name, phone, email")
      .neq("id", contact.id)
      .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    setMergeResults(data ?? []);
  }

  async function doMerge() {
    if (mergeSelected.length === 0) return;
    if (!confirm(`Объединить ${mergeSelected.length} контакт(ов) в "${contact.full_name}"? Дубликаты будут удалены.`)) return;
    setMerging(true);
    try {
      const res = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId: contact.id, mergeIds: mergeSelected }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`Объединено: ${data.merged} контакт(ов)`);
        setMergeOpen(false);
        setMergeSelected([]);
        router.refresh();
      } else {
        alert(data.error || "Ошибка объединения");
      }
    } catch { alert("Ошибка"); }
    setMerging(false);
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
          <Button variant="secondary" size="sm" onClick={() => setMergeOpen(true)}>
            <Merge size={14} /> Объединить
          </Button>
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
                  <PhoneLink phone={contact.phone} iconSize={13}>{contact.phone}</PhoneLink>
                )}
                {contact.phone_mobile && (
                  <PhoneLink phone={contact.phone_mobile} iconSize={13}>
                    {contact.phone_mobile} <span className="text-xs text-slate-400">моб.</span>
                  </PhoneLink>
                )}
                {contact.phone_other && (
                  <PhoneLink phone={contact.phone_other} iconSize={13}>{contact.phone_other}</PhoneLink>
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
                      placeholder="Добавить заметку..." rows={4}
                      className="w-full text-sm border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      style={{ minHeight: 100 }} />
                    <div className="flex justify-end mt-2">
                      <Button size="sm" onClick={addNote} loading={noteLoading} disabled={!noteText.trim()}>
                        <MessageSquare size={14} /> Добавить заметку
                      </Button>
                    </div>
                  </CardBody>
                </Card>
                <CommunicationsTimeline entityType="contact" entityId={contact.id} refreshKey={commsRefreshKey} />
              </div>
            )}

            {activeTab === "email" && contact.email && (
              <EmailThread
                email={contact.email}
                compact
                entityType="contact"
                entityId={contact.id}
                extraRecipients={[
                  contact.email_other ? { label: `${contact.email_other} (доп.)`, value: contact.email_other } : null,
                  contact.companies?.email ? { label: `${contact.companies.email} (компания)`, value: contact.companies.email } : null,
                ].filter(Boolean) as { label: string; value: string }[]}
              />
            )}

            {activeTab === "telegram" && contact.telegram_id && (
              <div>
                <p className="text-xs mb-2" style={{ color: "#888" }}>
                  Переписка с <strong>{contact.full_name}</strong>
                  {contact.telegram_username && <> · <span style={{ color: "#0067a5" }}>@{contact.telegram_username}</span></>}
                </p>
                <TelegramChat peer={contact.telegram_username || contact.phone || contact.telegram_id} compact phone={contact.phone || undefined} />
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
        defaultAssignedTo={contact.assigned_to}
        onCreated={(task) => setTasks((p: unknown[]) => [task, ...p])}
      />

      {/* Merge contacts modal */}
      {mergeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Объединить контакты</h3>
              <button onClick={() => { setMergeOpen(false); setMergeSelected([]); setMergeSearch(""); setMergeResults([]); }} className="p-1 rounded hover:bg-slate-100">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-3">
              <p className="text-xs mb-3" style={{ color: "#888" }}>
                Выберите дубликаты для объединения в <strong>{contact.full_name}</strong>. Данные будут перенесены, дубликаты удалены.
              </p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
                <input
                  value={mergeSearch}
                  onChange={(e) => searchMerge(e.target.value)}
                  placeholder="Поиск по имени, телефону, email..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ border: "1px solid #d0d0d0" }}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-3">
              {mergeResults.map((c: { id: string; full_name: string; phone?: string; email?: string }) => {
                const selected = mergeSelected.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setMergeSelected((prev) => selected ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors"
                    style={{ background: selected ? "#e8f4fd" : "transparent", border: selected ? "1px solid #b3d4f0" : "1px solid transparent" }}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${selected ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                      {selected && <CheckSquare size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{c.full_name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[c.phone, c.email].filter(Boolean).join(" · ") || "Нет данных"}
                      </p>
                    </div>
                  </button>
                );
              })}
              {mergeSearch.length >= 2 && mergeResults.length === 0 && (
                <p className="text-sm text-center py-6" style={{ color: "#aaa" }}>Контакты не найдены</p>
              )}
            </div>
            {mergeSelected.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm text-slate-600">Выбрано: {mergeSelected.length}</span>
                <Button onClick={doMerge} loading={merging}>
                  <Merge size={14} /> Объединить
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

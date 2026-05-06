"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Edit2, Trash2, Building2, Phone, Mail, Globe, MapPin, MessageSquare, Plus, CheckSquare, FileText, Download, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import EmailThread from "@/components/ui/EmailThread";
import TelegramChat from "@/components/ui/TelegramChat";
import MaxChat from "@/components/ui/MaxChat";
import CommunicationsTimeline from "@/components/ui/CommunicationsTimeline";
import ExportCommunicationsModal from "@/components/ui/ExportCommunicationsModal";
import AIAnalysis from "@/components/ui/AIAnalysis";
import ClientTimeIndicator from "@/components/ui/ClientTimeIndicator";
import GatherCommunicationsButton from "@/components/ui/GatherCommunicationsButton";
import { Card, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import CreateTaskModal from "@/components/ui/CreateTaskModal";
import CustomFieldsSection from "@/components/ui/CustomFieldsSection";
import ContractsClient from "@/app/(crm)/contracts/ContractsClient";
import EditCompanyModal from "../EditCompanyModal";
import ServerAddressList from "@/components/ui/ServerAddressList";
import { formatDate, formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { apiPost, apiPut } from "@/lib/api/client";
import PhoneLink from "@/components/ui/PhoneLink";

const CHANNEL_ICONS: Record<string, string> = { email: "✉️", telegram: "💬", phone: "📞", maks: "🔵", note: "📝" };
const CHANNEL_LABELS: Record<string, string> = { email: "Email", telegram: "Telegram", phone: "Звонок", maks: "МАКС", note: "Заметка" };
const PRIORITY_LABELS: Record<string, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };
const DEAL_STAGE: Record<string, string> = { lead: "Лид", proposal: "Предложение", negotiation: "Переговоры", order_assembly: "Сборка заказа", won: "Выиграна", lost: "Проиграна" };
const COMPANY_TYPE: Record<string, string> = { restaurant: "Ресторан", hotel: "Отель", salon: "Салон", retail: "Розница", wholesale: "Опт", other: "Другое" };
const CONTRACT_STATUS: Record<string, string> = { none: "Нет договора", pending: "На согласовании", signed: "Подписан", terminated: "Расторгнут" };
const CONTRACT_COLORS: Record<string, string> = { none: "#c62828", pending: "#e65c00", signed: "#2e7d32", terminated: "#888" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LEAD_STATUS: Record<string, string> = { new: "Новая", callback: "Перезвонить/написать", in_progress: "В работе", samples: "Пробники", samples_shipped: "Пробники отгружены", invoice: "Счёт на предоплату", rejected: "Отказ", converted: "Конвертирован" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CompanyDetail({ company: initialCompany, contacts, deals, leads, communications: initialComms, tasks: initialTasks }: any) {
  const router = useRouter();
  const [company, setCompany] = useState(initialCompany);
  const [communications, setCommunications] = useState(initialComms);
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTab, setActiveTab] = useState<"info" | "communications" | "tasks" | "contracts" | "email" | "telegram" | "maks">("info");
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [linkingContact, setLinkingContact] = useState<string | null>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contactResults, setContactResults] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [companyContacts, setCompanyContacts] = useState<any[]>(contacts ?? []);

  async function linkContactMessengers(contactId: string) {
    setLinkingContact(contactId);
    try {
      const res = await fetch("/api/contacts/link-messengers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId }),
      });
      const data = await res.json();
      if (data.ok) {
        const parts: string[] = [];
        if (data.linked.telegram) parts.push("Telegram");
        if (data.linked.maks) parts.push("МАКС");
        alert(parts.length ? `Привязано: ${parts.join(", ")}. Обновите страницу чтобы увидеть вкладки.` : "Мессенджеры не найдены по номеру");
      } else {
        alert(data.error || "Не удалось привязать");
      }
    } catch { alert("Ошибка"); }
    setLinkingContact(null);
  }

  // Contract state
  const [contractStatus, setContractStatus] = useState(company.contract_status ?? "none");
  const [contractSignedAt, setContractSignedAt] = useState(company.contract_signed_at ?? "");
  const [contractComment, setContractComment] = useState(company.contract_comment ?? "");
  const [contractFileUrl, setContractFileUrl] = useState(company.contract_file_url ?? "");
  const [contractFileName, setContractFileName] = useState(company.contract_file_name ?? "");
  const [contractSaving, setContractSaving] = useState(false);
  const [contractUploading, setContractUploading] = useState(false);
  // Multi-file contracts (v76). The legacy single-file state above is
  // still kept so older PDF generators reading company.contract_file_url
  // keep working — it tracks the most-recently-uploaded file.
  const [contractFiles, setContractFiles] = useState<{ url: string; name: string; uploaded_at: string; signed_at?: string; status?: string; comment?: string }[]>(
    Array.isArray(company.contract_files) ? company.contract_files : []
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [commsRefreshKey, setCommsRefreshKey] = useState(0);

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteLoading(true);
    const { data, error } = await apiPost<typeof communications[number]>("/api/communications", {
      entity_type: "company", entity_id: company.id, channel: "note", direction: "outbound", body: noteText.trim(),
    });
    if (error || !data) { alert("Не удалось сохранить заметку: " + (error ?? "")); setNoteLoading(false); return; }
    setCommunications((p: unknown[]) => [data, ...p]);
    setNoteText("");
    setCommsRefreshKey((k) => k + 1);
    setNoteLoading(false);
  }

  async function deleteCompany() {
    if (!confirm("Удалить компанию? Это действие нельзя отменить.")) return;
    setDeleteLoading(true);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "companies", ids: [company.id] }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert("Не удалось удалить: " + (data.error ?? "неизвестная ошибка"));
      setDeleteLoading(false);
      return;
    }
    router.push("/companies");
  }

  async function saveContract() {
    setContractSaving(true);
    const { error } = await apiPut("/api/companies", {
      id: company.id,
      contract_status: contractStatus,
      contract_signed_at: contractStatus === "signed" && contractSignedAt ? contractSignedAt : null,
      contract_comment: contractComment || null,
    });
    if (error) alert("Не удалось сохранить договор: " + error);
    setContractSaving(false);
  }

  async function uploadContractFile(file: File) {
    setContractUploading(true);
    const fd = new FormData();
    fd.append("company_id", company.id);
    fd.append("file", file);
    const res = await fetch("/api/companies/contract", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      // New API returns { file, files }; old returned { url, name }
      if (Array.isArray(data.files)) {
        setContractFiles(data.files);
        const last = data.file;
        if (last) { setContractFileUrl(last.url); setContractFileName(last.name); }
      } else {
        setContractFileUrl(data.url);
        setContractFileName(data.name);
      }
    } else {
      const data = await res.json();
      alert("Ошибка загрузки: " + (data.error ?? ""));
    }
    setContractUploading(false);
  }

  async function deleteContractFile(url: string) {
    if (!confirm("Удалить файл договора?")) return;
    const res = await fetch("/api/companies/contract", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: company.id, url }),
    });
    if (res.ok) {
      const data = await res.json();
      setContractFiles(data.files ?? []);
      const last = data.files?.[data.files.length - 1] ?? null;
      setContractFileUrl(last?.url ?? "");
      setContractFileName(last?.name ?? "");
    } else {
      const data = await res.json().catch(() => ({}));
      alert("Не удалось удалить: " + (data.error ?? ""));
    }
  }

  // Find contacts with telegram/maks for company tabs
  const tgContact = contacts?.find((c: { telegram_id?: string }) => c.telegram_id);
  const maksContact = contacts?.find((c: { maks_id?: string }) => c.maks_id);

  const tabs = [
    { id: "info", label: "Информация" },
    { id: "communications", label: `Коммуникации (${communications.length})` },
    { id: "tasks", label: `Задачи (${tasks.length})` },
    { id: "contracts", label: "Договоры" },
    ...(company.email ? [{ id: "email", label: "📧 Почта" }] : []),
    ...(tgContact ? [{ id: "telegram", label: "💬 Telegram" }] : []),
    ...(maksContact ? [{ id: "maks", label: "🔵 МАКС" }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <Link href="/companies" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft size={16} /> Все компании
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 size={14} /> Редактировать
          </Button>
          <Button variant="danger" size="sm" onClick={deleteCompany} loading={deleteLoading}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardBody>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                  <Building2 size={24} className="text-slate-500" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{company.name}</h2>
                  {company.inn && <p className="text-sm text-slate-500">ИНН: {company.inn}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                {company.phone && (
                  <PhoneLink phone={company.phone} iconSize={14}>{company.phone}</PhoneLink>
                )}
                {company.email && (
                  <a href={`mailto:${company.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <Mail size={14} /> {company.email}
                  </a>
                )}
                {company.website && (
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <Globe size={14} /> {company.website}
                  </a>
                )}
              </div>
              {company.legal_address && (
                <p className="mt-3 text-sm text-slate-600 flex items-start gap-2">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0 text-slate-400" /> <span className="text-xs text-slate-400">Юр.:</span> {company.legal_address}
                </p>
              )}
              {/* Server-backed addresses (M:N). New /api/addresses entries
                  don't overwrite existing rows — backlog v5 §3. The legacy
                  JSONB AddressList on companies.addresses is left in place
                  for older data only and hidden when the new table has any
                  rows for this company. */}
              <div className="mt-2">
                <ServerAddressList companyId={company.id} />
              </div>
              {company.description && <p className="mt-3 text-sm text-slate-600">{company.description}</p>}
            </CardBody>
          </Card>

          {/* Contacts — always visible */}
          <Card>
            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Контакты ({companyContacts?.length ?? 0})</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setAddContactOpen(!addContactOpen)} className="text-xs flex items-center gap-0.5" style={{ color: "#0067a5" }}>
                  <Plus size={12} /> Привязать
                </button>
              </div>
            </div>
            <CardBody className="p-0">
              {addContactOpen && (
                <div className="px-6 py-3" style={{ background: "#f8f9fa", borderBottom: "1px solid #f0f0f0" }}>
                  <input value={contactSearch} onChange={async (e) => {
                    setContactSearch(e.target.value);
                    if (e.target.value.length >= 2) {
                      // Search through admin API — RLS hid contacts
                      // belonging to other managers, and the old query
                      // also excluded anyone who already had a company,
                      // so re-attaching wasn't possible (the Екатерина
                      // case 2026-05-06).
                      const res = await fetch(`/api/contacts?q=${encodeURIComponent(e.target.value)}&limit=15`);
                      const d = await res.json().catch(() => ({ contacts: [] }));
                      setContactResults(d.contacts ?? []);
                    } else setContactResults([]);
                  }} placeholder="Поиск по имени / телефону / email..." className="w-full text-xs px-3 py-1.5 rounded mb-2 focus:outline-none" style={{ border: "1px solid #d0d0d0" }} />
                  {contactResults.length > 0 && contactResults.map((c: { id: string; full_name: string; phone?: string; email?: string; company_id?: string | null; companies?: { name?: string } | null }) => {
                    const alreadyHere = c.company_id === company.id;
                    const linkedElsewhere = !!c.company_id && c.company_id !== company.id;
                    return (
                      <button key={c.id} onClick={async () => {
                        if (alreadyHere) { alert("Контакт уже привязан к этой компании."); return; }
                        if (linkedElsewhere && !confirm(`Контакт уже в компании «${c.companies?.name ?? "(другой)"}». Перенести сюда?`)) return;
                        const { error } = await apiPut("/api/contacts", { id: c.id, company_id: company.id });
                        if (error) { alert("Не удалось привязать контакт: " + error); return; }
                        setCompanyContacts((prev: { id: string }[]) => [...prev, c]);
                        setAddContactOpen(false); setContactSearch(""); setContactResults([]);
                      }} className="w-full text-left text-xs px-3 py-2 rounded hover:bg-blue-50">
                        <span className="text-blue-700 font-medium">{c.full_name}</span>
                        {c.phone && <span className="text-slate-500"> · {c.phone}</span>}
                        {c.email && <span className="text-slate-400"> · {c.email}</span>}
                        {alreadyHere && <span className="text-slate-400 italic"> — уже здесь</span>}
                        {linkedElsewhere && <span style={{ color: "#bf7600" }}> — в «{c.companies?.name ?? "?"}»</span>}
                      </button>
                    );
                  })}
                  {contactSearch.length >= 2 && contactResults.length === 0 && (
                    <p className="text-xs py-2" style={{ color: "#aaa" }}>Ничего не найдено</p>
                  )}
                </div>
              )}
              {companyContacts?.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {companyContacts.map((c: { id: string; full_name: string; position?: string; phone?: string; email?: string; telegram_id?: string; maks_id?: string }) => (
                    <li key={c.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                      <Link href={`/contacts/${c.id}`} className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-600 hover:underline">{c.full_name}</p>
                        {c.position && <p className="text-xs text-slate-400">{c.position}</p>}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
                        {c.phone && <span className="flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
                        {c.telegram_id && <span style={{ color: "#0088cc" }}>TG</span>}
                        {c.maks_id && <span style={{ color: "#0067a5" }}>M</span>}
                        {c.phone && (!c.telegram_id || !c.maks_id) && (
                          <button
                            onClick={(e) => { e.preventDefault(); linkContactMessengers(c.id); }}
                            disabled={linkingContact === c.id}
                            className="px-1.5 py-0.5 rounded hover:bg-blue-50 disabled:opacity-50"
                            style={{ color: "#0067a5", border: "1px solid #d0e8f5", fontSize: 10 }}>
                            {linkingContact === c.id ? "..." : "Мессенджеры"}
                          </button>
                        )}
                        {/* Unlink — keeps the contact, just clears
                            company_id so it stops appearing here.
                            Useful when wrong contact got attached. */}
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            if (!confirm(`Отвязать "${c.full_name}" от этой компании? Сам контакт не удаляется.`)) return;
                            const { error } = await apiPut("/api/contacts", { id: c.id, company_id: null });
                            if (error) { alert("Не удалось отвязать: " + error); return; }
                            setCompanyContacts((prev: { id: string }[]) => prev.filter((x) => x.id !== c.id));
                          }}
                          className="p-1 rounded hover:bg-red-50"
                          title="Отвязать от компании">
                          <Trash2 size={11} style={{ color: "#c62828" }} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : !addContactOpen ? (
                <p className="px-6 py-4 text-sm text-slate-400">Нет привязанных контактов</p>
              ) : null}
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

                {leads?.length > 0 && (
                  <Card>
                    <div className="px-6 py-3 border-b border-slate-100">
                      <h3 className="font-semibold text-slate-900">Лиды ({leads.length})</h3>
                    </div>
                    <CardBody className="p-0">
                      <ul className="divide-y divide-slate-100">
                        {leads.map((l: { id: string; title: string; status: string; source?: string; created_at?: string }) => (
                          <li key={l.id}>
                            <Link href={`/leads/${l.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                              <div>
                                <span className="text-sm text-blue-600 hover:underline">{l.title}</span>
                                {l.created_at && <p className="text-xs text-slate-400">{new Date(l.created_at).toLocaleDateString("ru-RU")}{l.source ? ` · ${l.source}` : ""}</p>}
                              </div>
                              <Badge variant={l.status === "converted" ? "success" : l.status === "rejected" ? "danger" : "default"}>
                                {LEAD_STATUS[l.status] ?? l.status}
                              </Badge>
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
                        {deals.map((d: { id: string; title: string; stage: string; amount: number; created_at?: string }) => (
                          <li key={d.id}>
                            <Link href={`/deals/${d.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                              <div>
                                <span className="text-sm text-blue-600 hover:underline">{d.title}</span>
                                {d.created_at && <p className="text-xs text-slate-400">{new Date(d.created_at).toLocaleDateString("ru-RU")}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                {d.amount > 0 && <span className="text-xs font-medium" style={{ color: "#2e7d32" }}>{Number(d.amount).toLocaleString("ru-RU")} ₽</span>}
                                <Badge variant={d.stage === "won" ? "success" : d.stage === "lost" ? "danger" : "default"}>
                                  {DEAL_STAGE[d.stage] ?? d.stage}
                                </Badge>
                              </div>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <GatherCommunicationsButton companyId={company.id} companyName={company.name} />
                  <AIAnalysis companyId={company.id} type="client" label="Анализ ИИ" />
                  <AIAnalysis companyId={company.id} type="communications" label="Анализ переписок" />
                  <div className="flex-1" />
                  <button onClick={() => setExportOpen(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded hover:bg-blue-50" style={{ border: "1px solid #0067a5", color: "#0067a5" }}>
                    <Download size={12} /> Экспорт .docx
                  </button>
                </div>
                <Card>
                  <CardBody>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Добавить заметку..."
                      rows={4}
                      className="w-full text-sm border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      style={{ minHeight: 100 }}
                    />
                    <div className="flex justify-end mt-2">
                      <Button size="sm" onClick={addNote} loading={noteLoading} disabled={!noteText.trim()}>
                        <MessageSquare size={14} /> Добавить заметку
                      </Button>
                    </div>
                  </CardBody>
                </Card>
                <CommunicationsTimeline entityType="company" entityId={company.id} refreshKey={commsRefreshKey} />
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
                  tasks.map((task: { id: string; title: string; priority: string; due_date?: string; users?: { full_name: string } }) => (
                    <Card key={task.id}>
                      <CardBody className="py-3">
                        <div className="flex items-center gap-3">
                          <CheckSquare size={16} className="text-slate-400 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{task.title}</p>
                            <div className="flex gap-2 mt-0.5">
                              {task.due_date && <span className="text-xs text-slate-400">до {formatDate(task.due_date)}</span>}
                              {task.users && <span className="text-xs text-slate-400">• {task.users.full_name}</span>}
                            </div>
                          </div>
                          <Badge variant={task.priority === "high" ? "danger" : task.priority === "medium" ? "warning" : "default"}>
                            {PRIORITY_LABELS[task.priority]}
                          </Badge>
                        </div>
                      </CardBody>
                    </Card>
                  ))
                )}
              </div>
            )}

            {activeTab === "contracts" && (
              <ContractsClient companyId={company.id} />
            )}

            {activeTab === "email" && company.email && (
              <EmailThread email={company.email} compact entityType="company" entityId={company.id} />
            )}

            {activeTab === "telegram" && tgContact && (
              <div>
                <p className="text-xs mb-2" style={{ color: "#888" }}>
                  Переписка с <strong>{tgContact.full_name}</strong>{tgContact.telegram_username ? ` (@${tgContact.telegram_username})` : ""}
                </p>
                <TelegramChat peer={tgContact.telegram_username || tgContact.phone || tgContact.telegram_id} compact phone={tgContact.phone || undefined} />
              </div>
            )}

            {activeTab === "maks" && maksContact && (
              <div>
                <p className="text-xs mb-2" style={{ color: "#888" }}>
                  МАКС: <strong>{maksContact.full_name}</strong>
                </p>
                <MaxChat chatId={maksContact.maks_id} compact />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Реквизиты</h3>
              {(company.city || company.region || company.timezone) && (
                <div className="mb-3">
                  <ClientTimeIndicator timezone={company.timezone} region={company.city || company.region} address={company.legal_address} />
                </div>
              )}
              <div className="space-y-2 text-sm">
                {company.company_type && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Тип</span>
                    <span className="text-slate-700">{COMPANY_TYPE[company.company_type] ?? company.company_type}</span>
                  </div>
                )}
                {company.inn && <div className="flex justify-between"><span className="text-slate-500">ИНН</span><span className="text-slate-700">{company.inn}</span></div>}
                {company.ogrn && <div className="flex justify-between"><span className="text-slate-500">ОГРН</span><span className="text-slate-700">{company.ogrn}</span></div>}
                {company.kpp && <div className="flex justify-between"><span className="text-slate-500">КПП</span><span className="text-slate-700">{company.kpp}</span></div>}
                {company.director && <div className="flex justify-between"><span className="text-slate-500">Директор</span><span className="text-slate-700">{company.director}</span></div>}
                {company.city && <div className="flex justify-between"><span className="text-slate-500">Город</span><span className="text-slate-700">{company.city}</span></div>}
                {company.region && <div className="flex justify-between"><span className="text-slate-500">Регион</span><span className="text-slate-700">{company.region}</span></div>}
                <div className="flex justify-between">
                  <span className="text-slate-500">Создана</span>
                  <span className="text-slate-700">{formatDate(company.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Контактов</span>
                  <span className="text-slate-700">{contacts?.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Сделок</span>
                  <span className="text-slate-700">{deals?.length ?? 0}</span>
                </div>
              </div>
              {(company.activity || company.need) && (
                <div className="mt-3 pt-3 space-y-2 text-sm" style={{ borderTop: "1px solid #f0f0f0" }}>
                  {company.activity && (
                    <div><p className="text-xs font-semibold text-slate-500 mb-0.5">Деятельность</p><p className="text-slate-700">{company.activity}</p></div>
                  )}
                  {company.need && (
                    <div><p className="text-xs font-semibold text-slate-500 mb-0.5">Потребность</p><p className="text-slate-700">{company.need}</p></div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Contract block */}
          <Card>
            <CardBody>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                <FileText size={14} /> Договор
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Статус</label>
                  <select value={contractStatus}
                    onChange={(e) => { setContractStatus(e.target.value); }}
                    className="w-full text-xs rounded px-2 py-1.5 outline-none"
                    style={{ border: "1px solid #d0d0d0" }}>
                    {Object.entries(CONTRACT_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                {contractStatus === "signed" && (
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Дата подписания</label>
                    <input type="date" value={contractSignedAt}
                      onChange={(e) => setContractSignedAt(e.target.value)}
                      className="w-full text-xs rounded px-2 py-1.5 outline-none"
                      style={{ border: "1px solid #d0d0d0" }} />
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Файлы договоров {contractFiles.length > 0 && <span style={{ color: "#888" }}>({contractFiles.length})</span>}</label>
                  <div className="space-y-1.5">
                    {contractFiles.map((f) => (
                      <div key={f.url} className="flex items-center gap-2">
                        <a href={f.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded hover:bg-blue-50 flex-1 min-w-0"
                          style={{ color: "#0067a5", border: "1px solid #e0e0e0" }}>
                          <Download size={11} className="flex-shrink-0" />
                          <span className="truncate">{f.name || "Скачать"}</span>
                        </a>
                        <button onClick={() => deleteContractFile(f.url)} className="p-1 rounded hover:bg-red-50 flex-shrink-0" title="Удалить файл">
                          <Trash2 size={11} style={{ color: "#c62828" }} />
                        </button>
                      </div>
                    ))}
                    {contractFiles.length === 0 && contractFileUrl && (
                      // Legacy single-file fallback shown only if contract_files
                      // is empty but old contract_file_url is set (migration v76
                      // not run yet). After running v76 it copies into the array.
                      <div className="flex items-center gap-2">
                        <a href={contractFileUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded hover:bg-blue-50 flex-1 min-w-0"
                          style={{ color: "#0067a5", border: "1px solid #e0e0e0" }}>
                          <Download size={11} className="flex-shrink-0" />
                          <span className="truncate">{contractFileName || "Скачать"}</span>
                        </a>
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                      style={{ border: "1px dashed #d0d0d0", color: "#888" }}>
                      <Upload size={13} /> {contractUploading ? "Загрузка..." : (contractFiles.length > 0 ? "+ Ещё договор" : "Загрузить договор")}
                      <input type="file" accept=".pdf,.doc,.docx" className="hidden" disabled={contractUploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadContractFile(f); e.target.value = ""; }} />
                    </label>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Комментарий</label>
                  <textarea value={contractComment}
                    onChange={(e) => setContractComment(e.target.value)}
                    rows={2} className="w-full text-xs rounded px-2 py-1.5 outline-none"
                    style={{ border: "1px solid #d0d0d0", resize: "vertical" }}
                    placeholder="Примечание к договору..." />
                </div>
                <button onClick={saveContract} disabled={contractSaving}
                  className="text-xs px-3 py-1.5 rounded text-white disabled:opacity-50"
                  style={{ background: "#0067a5" }}>
                  {contractSaving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CustomFieldsSection entityType="company" entityId={company.id} />
            </CardBody>
          </Card>
        </div>
      </div>

      <EditCompanyModal open={editOpen} onClose={() => setEditOpen(false)} company={company} onSaved={setCompany} />
      <ExportCommunicationsModal open={exportOpen} onClose={() => setExportOpen(false)} communications={communications} companyName={company.name} />
      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        entityType="company"
        entityId={company.id}
        defaultAssignedTo={company.assigned_to}
        onCreated={(task) => setTasks((p: unknown[]) => [task, ...p])}
      />
    </div>
  );
}

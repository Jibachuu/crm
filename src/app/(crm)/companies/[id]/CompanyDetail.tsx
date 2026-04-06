"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Edit2, Trash2, Building2, Phone, Mail, Globe, MapPin, MessageSquare, Plus, CheckSquare, FileText, Download, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import EmailThread from "@/components/ui/EmailThread";
import TelegramChat from "@/components/ui/TelegramChat";
import CommunicationsTimeline from "@/components/ui/CommunicationsTimeline";
import ExportCommunicationsModal from "@/components/ui/ExportCommunicationsModal";
import AIAnalysis from "@/components/ui/AIAnalysis";
import GatherCommunicationsButton from "@/components/ui/GatherCommunicationsButton";
import { Card, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import CreateTaskModal from "@/components/ui/CreateTaskModal";
import CustomFieldsSection from "@/components/ui/CustomFieldsSection";
import EditCompanyModal from "../EditCompanyModal";
import { formatDate, formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const CHANNEL_ICONS: Record<string, string> = { email: "✉️", telegram: "💬", phone: "📞", maks: "🔵", note: "📝" };
const CHANNEL_LABELS: Record<string, string> = { email: "Email", telegram: "Telegram", phone: "Звонок", maks: "МАКС", note: "Заметка" };
const PRIORITY_LABELS: Record<string, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };
const DEAL_STAGE: Record<string, string> = { lead: "Лид", proposal: "Предложение", negotiation: "Переговоры", order_assembly: "Сборка заказа", won: "Выиграна", lost: "Проиграна" };
const COMPANY_TYPE: Record<string, string> = { restaurant: "Ресторан", hotel: "Отель", salon: "Салон", retail: "Розница", wholesale: "Опт", other: "Другое" };
const CONTRACT_STATUS: Record<string, string> = { none: "Нет договора", pending: "На согласовании", signed: "Подписан", terminated: "Расторгнут" };
const CONTRACT_COLORS: Record<string, string> = { none: "#c62828", pending: "#e65c00", signed: "#2e7d32", terminated: "#888" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CompanyDetail({ company: initialCompany, contacts, deals, communications: initialComms, tasks: initialTasks }: any) {
  const router = useRouter();
  const [company, setCompany] = useState(initialCompany);
  const [communications, setCommunications] = useState(initialComms);
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTab, setActiveTab] = useState<"info" | "communications" | "tasks" | "email" | "telegram">("info");
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Contract state
  const [contractStatus, setContractStatus] = useState(company.contract_status ?? "none");
  const [contractSignedAt, setContractSignedAt] = useState(company.contract_signed_at ?? "");
  const [contractComment, setContractComment] = useState(company.contract_comment ?? "");
  const [contractFileUrl, setContractFileUrl] = useState(company.contract_file_url ?? "");
  const [contractFileName, setContractFileName] = useState(company.contract_file_name ?? "");
  const [contractSaving, setContractSaving] = useState(false);
  const [contractUploading, setContractUploading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("communications")
      .insert({ entity_type: "company", entity_id: company.id, channel: "note", direction: "outbound", body: noteText.trim(), created_by: user?.id ?? null })
      .select("*, users!communications_created_by_fkey(full_name)")
      .single();
    if (data) { setCommunications((p: unknown[]) => [data, ...p]); setNoteText(""); }
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
    const supabase = createClient();
    await supabase.from("companies").update({
      contract_status: contractStatus,
      contract_signed_at: contractStatus === "signed" && contractSignedAt ? contractSignedAt : null,
      contract_comment: contractComment || null,
    }).eq("id", company.id);
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
      setContractFileUrl(data.url);
      setContractFileName(data.name);
    } else {
      const data = await res.json();
      alert("Ошибка загрузки: " + (data.error ?? ""));
    }
    setContractUploading(false);
  }

  // Find contacts with telegram for company telegram tab
  const tgContact = contacts?.find((c: { telegram_id?: string }) => c.telegram_id);

  const tabs = [
    { id: "info", label: "Информация" },
    { id: "communications", label: `Коммуникации (${communications.length})` },
    { id: "tasks", label: `Задачи (${tasks.length})` },
    ...(company.email ? [{ id: "email", label: "📧 Почта" }] : []),
    ...(tgContact ? [{ id: "telegram", label: "💬 Telegram" }] : []),
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
                  <a href={`tel:${company.phone}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <Phone size={14} /> {company.phone}
                  </a>
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
                  <MapPin size={14} className="mt-0.5 flex-shrink-0 text-slate-400" /> {company.legal_address}
                </p>
              )}
              {company.description && <p className="mt-3 text-sm text-slate-600">{company.description}</p>}
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
                {contacts?.length > 0 && (
                  <Card>
                    <div className="px-6 py-3 border-b border-slate-100">
                      <h3 className="font-semibold text-slate-900">Контакты ({contacts.length})</h3>
                    </div>
                    <CardBody className="p-0">
                      <ul className="divide-y divide-slate-100">
                        {contacts.map((c: { id: string; full_name: string; position?: string; phone?: string; email?: string; telegram_id?: string }) => (
                          <li key={c.id}>
                            <Link href={`/contacts/${c.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                              <div>
                                <p className="text-sm font-medium text-blue-600 hover:underline">{c.full_name}</p>
                                {c.position && <p className="text-xs text-slate-400">{c.position}</p>}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                {c.phone && <span className="flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
                                {c.email && <span className="flex items-center gap-1"><Mail size={11} /> {c.email}</span>}
                                {c.telegram_id && <span style={{ color: "#0088cc" }}>TG</span>}
                              </div>
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
                        {deals.map((d: { id: string; title: string; stage: string; amount: number }) => (
                          <li key={d.id}>
                            <Link href={`/deals/${d.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                              <span className="text-sm text-blue-600 hover:underline">{d.title}</span>
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
                      rows={2}
                      className="w-full text-sm border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex justify-end mt-2">
                      <Button size="sm" onClick={addNote} loading={noteLoading} disabled={!noteText.trim()}>
                        <MessageSquare size={14} /> Добавить заметку
                      </Button>
                    </div>
                  </CardBody>
                </Card>
                <CommunicationsTimeline communications={communications} />
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

            {activeTab === "email" && company.email && (
              <EmailThread email={company.email} compact entityType="company" entityId={company.id} />
            )}

            {activeTab === "telegram" && tgContact && (
              <div>
                <p className="text-xs mb-2" style={{ color: "#888" }}>
                  Переписка с <strong>{tgContact.full_name}</strong> (@{tgContact.telegram_id})
                </p>
                <TelegramChat peer={tgContact.telegram_id} compact />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Реквизиты</h3>
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
                  <label className="text-xs text-slate-500 block mb-1">Файл договора</label>
                  {contractFileUrl ? (
                    <div className="flex items-center gap-2">
                      <a href={contractFileUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs px-2 py-1.5 rounded hover:bg-blue-50"
                        style={{ color: "#0067a5", border: "1px solid #e0e0e0" }}>
                        <Download size={11} /> {contractFileName || "Скачать"}
                      </a>
                      <label className="flex items-center gap-1 text-xs px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50"
                        style={{ color: "#888", border: "1px solid #e0e0e0" }}>
                        <Upload size={11} /> Заменить
                        <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadContractFile(f); }} />
                      </label>
                    </div>
                  ) : (
                    <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                      style={{ border: "1px dashed #d0d0d0", color: "#888" }}>
                      <Upload size={13} /> {contractUploading ? "Загрузка..." : "Загрузить PDF"}
                      <input type="file" accept=".pdf,.doc,.docx" className="hidden" disabled={contractUploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadContractFile(f); }} />
                    </label>
                  )}
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
        onCreated={(task) => setTasks((p: unknown[]) => [task, ...p])}
      />
    </div>
  );
}

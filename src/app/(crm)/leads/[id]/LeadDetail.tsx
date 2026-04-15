"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Edit2, Trash2, MessageSquare, CheckSquare, Phone, Mail, Building2, Plus, Package, ArrowRightCircle, Paperclip } from "lucide-react";
import TaskItem from "@/components/ui/TaskItem";
import TelegramChat from "@/components/ui/TelegramChat";
import MaxChat from "@/components/ui/MaxChat";
import EmailThread from "@/components/ui/EmailThread";
import { formatCurrency } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import ClientTimeIndicator from "@/components/ui/ClientTimeIndicator";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import CreateTaskModal from "@/components/ui/CreateTaskModal";
import CustomFieldsSection from "@/components/ui/CustomFieldsSection";
import CommunicationsTimeline from "@/components/ui/CommunicationsTimeline";
import AddProductModal from "@/components/ui/AddProductModal";
import EditLeadModal from "../EditLeadModal";
import { formatDate, formatDateTime, getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export const LEAD_STATUSES = [
  { key: "new", label: "Новая" },
  { key: "callback", label: "Перезвонить/написать" },
  { key: "in_progress", label: "В работе" },
  { key: "samples", label: "Пробники" },
  { key: "samples_shipped", label: "Пробники отгружены" },
  { key: "rejected", label: "Отказ" },
];

export const LEAD_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s.key, s.label])
);
LEAD_STATUS_LABELS["converted"] = "Конвертирован";

interface FunnelStage {
  id: string;
  funnel_id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  is_final: boolean;
  is_success: boolean;
}

interface LeadFunnel {
  id: string;
  name: string;
  type: string;
  is_default: boolean;
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email", telegram: "Telegram", phone: "Звонок", maks: "МАКС", note: "Заметка",
};
const CHANNEL_ICONS: Record<string, string> = {
  email: "✉️", telegram: "💬", phone: "📞", maks: "🔵", note: "📝",
};
const PRIORITY_LABELS: Record<string, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function LeadDetail({ lead: initialLead, communications: initialComms, tasks: initialTasks, leadProducts: initialProducts, funnelStages: initialStages, leadFunnels }: any) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [communications, setCommunications] = useState(initialComms);
  const [tasks, setTasks] = useState(initialTasks);
  const [leadProducts, setLeadProducts] = useState(initialProducts ?? []);
  const [activeTab, setActiveTab] = useState<"info" | "communications" | "tasks" | "products" | "files" | "email" | "telegram" | "maks">("info");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [leadFiles, setLeadFiles] = useState<any[]>([]);
  const [fileUploading, setFileUploading] = useState(false);

  useState(() => {
    fetch(`/api/deals/files?lead_id=${lead.id}`).then((r) => r.json()).then((d) => setLeadFiles(d.files ?? [])).catch(() => {});
  });
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [commsRefreshKey, setCommsRefreshKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [addProductBlock, setAddProductBlock] = useState<"request" | "order" | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>(initialStages ?? []);
  const [funnelSwitching, setFunnelSwitching] = useState(false);

  const requestProducts = leadProducts.filter((p: { product_block: string }) => p.product_block !== "order");
  const orderProducts = leadProducts.filter((p: { product_block: string }) => p.product_block === "order");

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("communications")
      .insert({ entity_type: "lead", entity_id: lead.id, channel: "note", direction: "outbound", body: noteText.trim(), created_by: user?.id ?? null })
      .select("*, users!communications_created_by_fkey(full_name)")
      .single();
    if (data) { setCommunications((prev: unknown[]) => [data, ...prev]); setNoteText(""); setCommsRefreshKey((k) => k + 1); }
    setNoteLoading(false);
  }

  async function updateStatus(status: string) {
    if (lead.status === status || statusSaving) return;
    setStatusSaving(true);
    setLead((prev: typeof lead) => ({ ...prev, status }));
    const supabase = createClient();
    await supabase.from("leads").update({ status }).eq("id", lead.id);
    setStatusSaving(false);
  }

  async function updateStage(stage: FunnelStage) {
    if (lead.stage_id === stage.id || statusSaving) return;
    setStatusSaving(true);
    const oldStageId = lead.stage_id;
    const statusMap: Record<string, string> = {
      new_contact: "new", qualification: "in_progress", probniki: "samples",
      sleeping: "rejected", rejected: "rejected", converted: "converted",
    };
    const newStatus = statusMap[stage.slug] ?? lead.status;
    setLead((prev: typeof lead) => ({ ...prev, stage_id: stage.id, status: newStatus }));
    const supabase = createClient();
    await supabase.from("leads").update({
      stage_id: stage.id,
      status: newStatus,
      stage_changed_at: new Date().toISOString(),
    }).eq("id", lead.id);
    // Trigger automations
    fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stage_change", entity_type: "lead", entity_id: lead.id, stage_id: stage.id, old_stage_id: oldStageId }),
    }).catch(() => {});
    setStatusSaving(false);
  }

  async function switchFunnel(funnelId: string) {
    if (lead.funnel_id === funnelId || funnelSwitching) return;
    if (!confirm("Текущая стадия будет сброшена. Продолжить?")) return;
    setFunnelSwitching(true);
    const supabase = createClient();
    // Load stages for new funnel
    const { data: newStages } = await supabase
      .from("funnel_stages")
      .select("*")
      .eq("funnel_id", funnelId)
      .order("sort_order");
    if (newStages && newStages.length > 0) {
      const firstStage = newStages[0];
      setFunnelStages(newStages);
      setLead((prev: typeof lead) => ({ ...prev, funnel_id: funnelId, stage_id: firstStage.id, status: "new" }));
      await supabase.from("leads").update({
        funnel_id: funnelId,
        stage_id: firstStage.id,
        status: "new",
        stage_changed_at: new Date().toISOString(),
      }).eq("id", lead.id);
    }
    setFunnelSwitching(false);
  }

  async function deleteLead() {
    if (!confirm("Удалить лид? Это действие нельзя отменить.")) return;
    setDeleteLoading(true);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "leads", ids: [lead.id] }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert("Не удалось удалить: " + (data.error ?? "неизвестная ошибка"));
      setDeleteLoading(false);
      return;
    }
    router.push("/leads");
  }

  async function convertToDeal() {
    if (!confirm("Конвертировать лид в сделку?")) return;
    setConvertLoading(true);
    const res = await fetch(`/api/leads/${lead.id}/convert`, { method: "POST" });
    const data = await res.json();
    if (data.dealId) {
      router.push(`/deals/${data.dealId}`);
    } else {
      alert("Ошибка конвертации: " + (data.error ?? "неизвестная ошибка"));
      setConvertLoading(false);
    }
  }

  const totalRequest = requestProducts.reduce((s: number, p: { total_price: number }) => s + (p.total_price ?? 0), 0);
  const totalOrder = orderProducts.reduce((s: number, p: { total_price: number }) => s + (p.total_price ?? 0), 0);

  const tabs = [
    { id: "info", label: "Информация" },
    { id: "communications", label: `Коммуникации (${communications.length})` },
    { id: "tasks", label: `Задачи (${tasks.length})` },
    { id: "products", label: `Товары (${leadProducts.length})` },
    { id: "files", label: `📎 Файлы (${leadFiles.length})` },
    { id: "email", label: "📧 Почта" },
    { id: "telegram", label: "💬 Telegram" },
    { id: "maks", label: "🔵 МАКС" },
  ];

  const isConverted = lead.status === "converted";
  const hasFunnelStages = funnelStages.length > 0;
  const regularStages = funnelStages.filter((s: FunnelStage) => !s.is_final);
  const finalStages = funnelStages.filter((s: FunnelStage) => s.is_final);
  const currentStage = funnelStages.find((s: FunnelStage) => s.id === lead.stage_id);
  const currentFunnel = (leadFunnels ?? []).find((f: LeadFunnel) => f.id === lead.funnel_id);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Nav row */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/leads" className="flex items-center gap-1 text-xs hover:underline" style={{ color: "#666" }}>
          <ChevronLeft size={14} /> Все лиды
        </Link>
        <div className="flex items-center gap-2">
          {!isConverted && (
            <Button variant="secondary" size="sm" onClick={convertToDeal} loading={convertLoading}>
              <ArrowRightCircle size={13} /> В сделку
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 size={13} /> Редактировать
          </Button>
          <Button variant="danger" size="sm" onClick={deleteLead} loading={deleteLoading}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Funnel selector */}
      {hasFunnelStages && !isConverted && (leadFunnels ?? []).length > 1 && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs" style={{ color: "#888" }}>Воронка:</span>
          {(leadFunnels ?? []).map((f: LeadFunnel) => (
            <button
              key={f.id}
              onClick={() => switchFunnel(f.id)}
              disabled={funnelSwitching}
              className="text-xs px-2.5 py-1 rounded-full transition-colors"
              style={{
                background: f.id === lead.funnel_id ? "#0067a5" : "#f0f0f0",
                color: f.id === lead.funnel_id ? "#fff" : "#666",
                fontWeight: f.id === lead.funnel_id ? 600 : 400,
              }}
            >
              {f.name.replace(/Воронка [АБ] — /, "")}
            </button>
          ))}
        </div>
      )}

      {/* Stage bar - funnel stages */}
      {hasFunnelStages ? (
        <div className="mb-4 flex gap-1.5">
          {/* Regular (non-final) stages as pipeline */}
          <div className="flex-1 rounded overflow-hidden flex" style={{ border: "1px solid #e0e0e0" }}>
            {regularStages.map((s: FunnelStage, idx: number) => {
              const isActive = lead.stage_id === s.id;
              const activeIdx = regularStages.findIndex((st: FunnelStage) => st.id === lead.stage_id);
              const isPast = activeIdx >= 0 && idx < activeIdx;
              return (
                <button
                  key={s.id}
                  onClick={() => updateStage(s)}
                  style={{
                    flex: 1,
                    padding: "9px 6px",
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 400,
                    background: isActive ? s.color : isPast ? "#e8f4fd" : "#f8f8f8",
                    color: isActive ? "#fff" : isPast ? "#0067a5" : "#555",
                    borderRight: idx < regularStages.length - 1 ? "1px solid #e0e0e0" : "none",
                    cursor: "pointer",
                    transition: "background 0.12s",
                    textAlign: "center",
                    lineHeight: 1.3,
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#ebebeb"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = isPast ? "#e8f4fd" : "#f8f8f8"; }}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          {/* Final stages as separate buttons */}
          {finalStages.map((s: FunnelStage) => {
            const isActive = lead.stage_id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => updateStage(s)}
                disabled={s.slug === "converted"}
                className="rounded px-3 text-xs font-medium transition-colors"
                style={{
                  background: isActive ? s.color : "#f8f8f8",
                  color: isActive ? "#fff" : s.color,
                  border: `1px solid ${isActive ? s.color : "#e0e0e0"}`,
                  cursor: s.slug === "converted" ? "default" : "pointer",
                  fontSize: 11,
                  padding: "9px 10px",
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                }}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      ) : (
        /* Fallback: old status bar */
        <div className="mb-4 rounded overflow-hidden" style={{ border: "1px solid #e0e0e0", display: "flex" }}>
          {(isConverted ? [{ key: "converted", label: "Конвертирован" }] : LEAD_STATUSES).map((s, idx) => {
            const isActive = lead.status === s.key;
            const isRejected = s.key === "rejected";
            const isConvertedStage = s.key === "converted";
            const activeColor = isRejected || isConvertedStage ? "#e74c3c" : "#0067a5";
            return (
              <button
                key={s.key}
                onClick={() => updateStatus(s.key)}
                disabled={isConvertedStage}
                style={{
                  flex: 1, padding: "9px 6px", fontSize: 11,
                  fontWeight: isActive ? 700 : 400,
                  background: isActive ? activeColor : "#f8f8f8",
                  color: isActive ? "#fff" : isRejected ? "#e74c3c" : "#555",
                  borderRight: idx < LEAD_STATUSES.length - 1 ? "1px solid #e0e0e0" : "none",
                  cursor: isConvertedStage ? "default" : "pointer",
                  transition: "background 0.12s", textAlign: "center", lineHeight: 1.3,
                }}
                onMouseEnter={(e) => { if (!isActive && !isConvertedStage) (e.currentTarget as HTMLButtonElement).style.background = "#ebebeb"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#f8f8f8"; }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardBody>
              <h2 className="text-base font-semibold mb-1" style={{ color: "#333" }}>{lead.title}</h2>
              {lead.description && <p className="text-sm" style={{ color: "#666" }}>{lead.description}</p>}
            </CardBody>
          </Card>

          {/* Tabs */}
          <div>
            <div className="flex overflow-x-auto whitespace-nowrap" style={{ borderBottom: "1px solid #e4e4e4", marginBottom: 16, scrollbarWidth: "thin" }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className="px-4 py-2 text-sm font-medium transition-colors flex-shrink-0"
                  style={{
                    borderBottom: activeTab === tab.id ? "2px solid #0067a5" : "2px solid transparent",
                    color: activeTab === tab.id ? "#0067a5" : "#666",
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "info" && (
              <div className="text-sm space-y-2" style={{ color: "#555" }}>
                <p>Создан: {formatDateTime(lead.created_at)}</p>
                <p>Обновлён: {formatDateTime(lead.updated_at)}</p>
                {lead.source && <p>Источник: {lead.source}</p>}
                {lead.telegram_username && (
                  <p>💬 Telegram: <span style={{ color: "#0067a5" }}>@{lead.telegram_username}</span></p>
                )}
                {lead.had_call && (
                  <p>📞 Был ли звонок: <strong>{lead.had_call}</strong></p>
                )}
              </div>
            )}

            {activeTab === "communications" && (
              <div className="space-y-3">
                <Card>
                  <CardBody>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Добавить заметку..."
                      rows={4}
                      className="w-full text-sm p-3 resize-none focus:outline-none"
                      style={{ border: "1px solid #ddd", borderRadius: 4, minHeight: 100 }}
                    />
                    <div className="flex justify-end mt-2">
                      <Button size="sm" onClick={addNote} loading={noteLoading} disabled={!noteText.trim()}>
                        <MessageSquare size={13} /> Добавить заметку
                      </Button>
                    </div>
                  </CardBody>
                </Card>
                <CommunicationsTimeline entityType="lead" entityId={lead.id} refreshKey={commsRefreshKey} />
              </div>
            )}

            {activeTab === "tasks" && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setTaskOpen(true)}>
                    <Plus size={13} /> Создать задачу
                  </Button>
                </div>
                {tasks.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: "#aaa" }}>Задачи отсутствуют</p>
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

            {activeTab === "products" && (
              <div className="space-y-5">
                <ProductBlock
                  title="Запрос"
                  description="С чем пришёл клиент"
                  items={requestProducts}
                  total={totalRequest}
                  onAdd={() => setAddProductBlock("request")}
                />
                <ProductBlock
                  title="Заказ"
                  description="Что реально купил"
                  items={orderProducts}
                  total={totalOrder}
                  onAdd={() => setAddProductBlock("order")}
                />
              </div>
            )}

            {activeTab === "files" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={fileUploading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded cursor-pointer hover:bg-blue-50"
                    style={{ color: "#0067a5", border: "1px solid #b3e0f5" }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.multiple = true;
                      input.onchange = async () => {
                        const files = input.files;
                        if (!files) return;
                        setFileUploading(true);
                        for (let i = 0; i < files.length; i++) {
                          const fd = new FormData();
                          fd.append("file", files[i]);
                          fd.append("lead_id", lead.id);
                          const res = await fetch("/api/deals/files", { method: "POST", body: fd });
                          if (res.ok) {
                            const f = await res.json();
                            setLeadFiles((prev) => [f, ...prev]);
                          }
                        }
                        setFileUploading(false);
                      };
                      input.click();
                    }}
                  >
                    <Paperclip size={14} /> {fileUploading ? "Загрузка..." : "Загрузить файл"}
                  </button>
                </div>
                {leadFiles.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: "#aaa" }}>Нет файлов</p>
                ) : (
                  <div className="space-y-1">
                    {leadFiles.map((f: { id: string; file_name: string; file_url: string; file_size?: number; created_at: string }) => (
                      <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50" style={{ border: "1px solid #f0f0f0" }}>
                        <Paperclip size={14} className="flex-shrink-0 text-slate-400" />
                        <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-blue-600 hover:underline truncate">{f.file_name}</a>
                        <span className="text-xs text-slate-400">{f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ""}</span>
                        <button onClick={async () => {
                          if (!confirm("Удалить файл?")) return;
                          await fetch("/api/deals/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id }) });
                          setLeadFiles((prev) => prev.filter((x: { id: string }) => x.id !== f.id));
                        }} className="p-1 rounded hover:bg-red-50"><Trash2 size={12} className="text-red-400" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "email" && (
              lead.contacts?.email ? (
                <EmailThread email={lead.contacts.email} compact entityType="lead" entityId={lead.id} />
              ) : (
                <div className="text-center py-8">
                  <Mail size={24} className="mx-auto mb-2" style={{ color: "#ddd" }} />
                  <p className="text-sm" style={{ color: "#aaa" }}>{lead.contacts ? "У контакта не указан email" : "Привяжите контакт с email"}</p>
                </div>
              )
            )}

            {activeTab === "telegram" && (
              lead.contacts?.telegram_id ? (
                <div>
                  <p className="text-xs mb-2" style={{ color: "#888" }}>
                    Переписка с <strong>{lead.contacts.full_name}</strong>
                    {lead.contacts.telegram_username && <> · <span style={{ color: "#0067a5" }}>@{lead.contacts.telegram_username}</span></>}
                  </p>
                  <TelegramChat peer={lead.contacts.telegram_username || lead.contacts.phone || lead.contacts.telegram_id} compact entityType="lead" entityId={lead.id} phone={lead.contacts.phone || undefined} />
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageSquare size={24} className="mx-auto mb-2" style={{ color: "#ddd" }} />
                  <p className="text-sm" style={{ color: "#aaa" }}>{lead.contacts ? "У контакта не указан Telegram" : "Привяжите контакт с Telegram"}</p>
                </div>
              )
            )}

            {activeTab === "maks" && (
              lead.contacts?.maks_id ? (
                <div>
                  <p className="text-xs mb-2" style={{ color: "#888" }}>
                    МАКС: <strong>{lead.contacts.full_name}</strong>
                  </p>
                  <MaxChat chatId={lead.contacts.maks_id} compact entityType="lead" entityId={lead.id} />
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageSquare size={24} className="mx-auto mb-2" style={{ color: "#ddd" }} />
                  <p className="text-sm" style={{ color: "#aaa" }}>{lead.contacts ? "У контакта не указан МАКС" : "Привяжите контакт с МАКС"}</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {lead.contacts && (
            <Card>
              <CardBody>
                <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: "#888", letterSpacing: "0.05em" }}>Контакт</h3>
                <Link href={`/contacts/${lead.contacts.id}`} className="flex items-center gap-3 hover:opacity-80">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#e8f4fd", color: "#0067a5" }}>
                    {getInitials(lead.contacts.full_name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#333" }}>{lead.contacts.full_name}</p>
                    {lead.contacts.phone && <p className="text-xs flex items-center gap-1" style={{ color: "#888" }}><Phone size={10} /> {lead.contacts.phone}</p>}
                    {lead.contacts.email && <p className="text-xs flex items-center gap-1" style={{ color: "#888" }}><Mail size={10} /> {lead.contacts.email}</p>}
                  </div>
                </Link>
              </CardBody>
            </Card>
          )}

          {lead.companies && (
            <Card>
              <CardBody>
                <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: "#888", letterSpacing: "0.05em" }}>Компания</h3>
                <Link href={`/companies/${lead.companies.id}`} className="flex items-center gap-2 text-sm hover:underline" style={{ color: "#0067a5" }}>
                  <Building2 size={13} /> {lead.companies.name}
                </Link>
                <div className="mt-2">
                  <ClientTimeIndicator timezone={lead.companies.timezone} region={lead.companies.city || lead.companies.region} address={lead.companies.legal_address} />
                </div>
              </CardBody>
            </Card>
          )}

          {lead.users && (
            <Card>
              <CardBody>
                <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: "#888", letterSpacing: "0.05em" }}>Ответственный</h3>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "#e8f4fd", color: "#0067a5" }}>
                    {getInitials(lead.users.full_name)}
                  </div>
                  <span className="text-sm" style={{ color: "#333" }}>{lead.users.full_name}</span>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              <CustomFieldsSection entityType="lead" entityId={lead.id} />
            </CardBody>
          </Card>
        </div>
      </div>

      <EditLeadModal open={editOpen} onClose={() => setEditOpen(false)} lead={lead} onSaved={setLead} />
      <AddProductModal
        open={addProductBlock !== null}
        onClose={() => setAddProductBlock(null)}
        entityType="lead"
        entityId={lead.id}
        productBlock={addProductBlock ?? "request"}
        onAdded={(item) => setLeadProducts((p: unknown[]) => [...p, item])}
      />
      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        entityType="lead"
        entityId={lead.id}
        onCreated={(task) => setTasks((p: unknown[]) => [task, ...p])}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProductBlock({ title, description, items, total, onAdd }: { title: string; description: string; items: any[]; total: number; onAdd: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#333" }}>{title}</h3>
          <p className="text-xs" style={{ color: "#999" }}>{description}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onAdd}>
          <Plus size={12} /> Добавить
        </Button>
      </div>
      <Card>
        {items.length === 0 ? (
          <CardBody>
            <p className="text-sm text-center py-4" style={{ color: "#aaa" }}>
              <Package size={20} className="mx-auto mb-2 opacity-40" />
              Товары не добавлены
            </p>
          </CardBody>
        ) : (
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                  <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: "#888" }}>Товар</th>
                  <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: "#888" }}>Кол-во</th>
                  <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: "#888" }}>Баз. цена</th>
                  <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: "#888" }}>Цена продажи</th>
                  <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: "#888" }}>Скидка</th>
                  <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: "#888" }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: { id: string; products: { name: string; sku: string }; base_price?: number; category?: string; subcategory?: string; volume_ml?: number; flavor?: string; quantity: number; unit_price: number; discount_percent: number; total_price: number }) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td className="px-4 py-2">
                      <p className="font-medium" style={{ color: "#333" }}>
                        {item.products?.name}
                        {item.volume_ml && <span className="text-xs font-normal ml-1" style={{ color: "#888" }}>{item.volume_ml} мл</span>}
                      </p>
                      <p className="text-xs" style={{ color: "#aaa" }}>Арт. {item.products?.sku}</p>
                      {item.flavor && <p className="text-xs" style={{ color: "#7b1fa2" }}>{item.flavor}</p>}
                      {(item.category || item.subcategory) && (
                        <p className="text-xs" style={{ color: "#0067a5" }}>{[item.category, item.subcategory].filter(Boolean).join(" → ")}</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right" style={{ color: "#555" }}>{item.quantity} шт.</td>
                    <td className="px-4 py-2 text-right" style={{ color: "#aaa" }}>{item.base_price ? formatCurrency(item.base_price) : "—"}</td>
                    <td className="px-4 py-2 text-right" style={{ color: "#555" }}>{formatCurrency(item.unit_price)}</td>
                    <td className="px-4 py-2 text-right" style={{ color: item.discount_percent > 0 ? "#d32f2f" : "#aaa" }}>
                      {item.discount_percent > 0 ? `-${item.discount_percent}%` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold" style={{ color: "#333" }}>{formatCurrency(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid #e4e4e4", background: "#fafafa" }}>
                  <td colSpan={5} className="px-4 py-2 text-sm font-semibold text-right" style={{ color: "#555" }}>Итого:</td>
                  <td className="px-4 py-2 text-right font-bold" style={{ color: "#333" }}>{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

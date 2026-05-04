"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Edit2, Trash2, Phone, Mail, Building2, Package, Plus, CheckSquare, MessageSquare, Send, Paperclip, FileDown, Receipt, X } from "lucide-react";
import TaskItem from "@/components/ui/TaskItem";
import TelegramChat from "@/components/ui/TelegramChat";
import MaxChat from "@/components/ui/MaxChat";
import EmailThread from "@/components/ui/EmailThread";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ClientTimeIndicator from "@/components/ui/ClientTimeIndicator";
import { Card, CardBody } from "@/components/ui/Card";
import CreateTaskModal from "@/components/ui/CreateTaskModal";
import CustomFieldsSection from "@/components/ui/CustomFieldsSection";
import CommunicationsTimeline from "@/components/ui/CommunicationsTimeline";
import AddProductModal from "@/components/ui/AddProductModal";
import EditProductModal from "@/components/ui/EditProductModal";
import ContractsClient from "@/app/(crm)/contracts/ContractsClient";
import EditDealModal from "../EditDealModal";
import AddressList from "@/components/ui/AddressList";
import { formatDate, formatDateTime, formatCurrency, getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { apiPost, apiPut, apiDelete } from "@/lib/api/client";

const STAGES = [
  { key: "lead", label: "Лид" },
  { key: "proposal", label: "Предложение" },
  { key: "negotiation", label: "Переговоры" },
  { key: "order_assembly", label: "Сборка заказа" },
  { key: "won", label: "Выиграна" },
  { key: "lost", label: "Проиграна" },
];

const STAGE_COLORS: Record<string, string> = {
  lead: "#888", proposal: "#0067a5", negotiation: "#e65c00", order_assembly: "#7b1fa2", won: "#2e7d32", lost: "#c62828",
};

const PRIORITY_LABELS: Record<string, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };
const CHANNEL_ICONS: Record<string, string> = { email: "✉️", telegram: "💬", phone: "📞", maks: "🔵", note: "📝" };
const CHANNEL_LABELS: Record<string, string> = { email: "Email", telegram: "Telegram", phone: "Звонок", maks: "МАКС", note: "Заметка" };

interface FunnelStage { id: string; funnel_id: string; name: string; slug: string; color: string; sort_order: number; is_final: boolean; is_success: boolean; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DealDetail({ deal: initialDeal, communications: initialComms, tasks: initialTasks, dealProducts: initialDealProducts, funnelStages: initialFunnelStages }: any) {
  const router = useRouter();
  const [deal, setDeal] = useState(initialDeal);
  const [communications, setCommunications] = useState(initialComms);
  const [tasks, setTasks] = useState(initialTasks);
  const [dealProducts, setDealProducts] = useState(initialDealProducts ?? []);
  const [activeTab, setActiveTab] = useState<"info" | "communications" | "tasks" | "products" | "email" | "telegram" | "maks" | "quotes" | "production" | "files" | "invoices" | "contracts">("info");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dealFiles, setDealFiles] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dealInvoices, setDealInvoices] = useState<any[]>([]);
  const [fileUploading, setFileUploading] = useState(false);

  useEffect(() => {
    // Load files and invoices
    fetch(`/api/deals/files?deal_id=${deal.id}`).then((r) => r.json()).then((d) => setDealFiles(d.files ?? [])).catch(() => {});
    createClient().from("invoices").select("id, invoice_number, invoice_date, total_amount, status, buyer_name").eq("deal_id", deal.id).order("created_at", { ascending: false }).then(({ data }) => setDealInvoices(data ?? []));
  }, [deal.id]);
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteAttachment, setNoteAttachment] = useState<{ url: string; name: string; size?: number; type?: string } | null>(null);
  const [noteUploading, setNoteUploading] = useState(false);
  const [commsRefreshKey, setCommsRefreshKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [addProductBlock, setAddProductBlock] = useState<"request" | "order" | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [extraContacts, setExtraContacts] = useState<any[]>([]);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contactResults, setContactResults] = useState<any[]>([]);

  // Load additional contacts from junction table.
  // SELECT can stay on RLS — managers are allowed to read, only writes were
  // blocked. Writes now go through /api/deals/contacts.
  useEffect(() => {
    createClient().from("deal_contacts")
      .select("id, contact_id, is_primary, contacts(id, full_name, phone, email, telegram_id, maks_id)")
      .eq("deal_id", deal.id)
      .order("is_primary", { ascending: false })
      .then(({ data }) => {
        const extra = (data ?? []).filter((dc: { contact_id: string }) => dc.contact_id !== deal.contact_id);
        setExtraContacts(extra);
      });
  }, [deal.id, deal.contact_id]);
  const funnelStages: FunnelStage[] = initialFunnelStages ?? [];
  const hasFunnelStages = funnelStages.length > 0;
  const regularStages = funnelStages.filter((s) => !s.is_final);
  const finalStages = funnelStages.filter((s) => s.is_final);
  const currentFunnelStage = funnelStages.find((s) => s.id === deal.stage_id);

  const requestProducts = dealProducts.filter((p: { product_block: string }) => p.product_block !== "order");
  const orderProducts = dealProducts.filter((p: { product_block: string }) => p.product_block === "order");

  async function addNote() {
    if (!noteText.trim() && !noteAttachment) return;
    setNoteLoading(true);
    const { data, error } = await apiPost<typeof communications[number]>("/api/communications", {
      entity_type: "deal", entity_id: deal.id, channel: "note", direction: "outbound",
      body: noteText.trim() || (noteAttachment ? `📎 ${noteAttachment.name}` : ""),
      attachment_url: noteAttachment?.url ?? null,
      attachment_name: noteAttachment?.name ?? null,
      attachment_size: noteAttachment?.size ?? null,
      attachment_type: noteAttachment?.type ?? null,
    });
    if (error || !data) { alert("Не удалось сохранить заметку: " + (error ?? "")); setNoteLoading(false); return; }
    setCommunications((p: unknown[]) => [data, ...p]);
    setNoteText("");
    setNoteAttachment(null);
    setCommsRefreshKey((k) => k + 1);
    setNoteLoading(false);
  }

  async function attachToNote(file: File) {
    setNoteUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { alert("Не удалось загрузить файл: " + (d.error || res.status)); return; }
      setNoteAttachment({ url: d.url, name: d.name, size: d.size, type: d.type });
    } finally {
      setNoteUploading(false);
    }
  }

  // Stock adjustments still use the supabase client because product_variants
  // is admin-managed; menus only update on stage transitions which managers
  // perform on their own deals (RLS allows update for own/assigned deals on
  // product_variants — see schema). If that ever breaks we'll move it under
  // /api/deals as well.
  async function adjustStockForStage(targetIsWon: boolean, prevWasWon: boolean) {
    const supabase = createClient();
    const orderProds = dealProducts.filter((p: { product_block: string }) => p.product_block === "order");
    if (targetIsWon && !prevWasWon && orderProds.length > 0) {
      const warnings: string[] = [];
      for (const dp of orderProds) {
        if (!dp.product_id) continue;
        const { data: variants } = await supabase.from("product_variants").select("id, stock").eq("product_id", dp.product_id).limit(1);
        if (variants?.[0]) {
          const newStock = variants[0].stock - (dp.quantity ?? 0);
          if (newStock < 0) warnings.push(`${dp.products?.name}: не хватает ${Math.abs(newStock)} шт.`);
          await supabase.from("product_variants").update({ stock: Math.max(0, newStock) }).eq("id", variants[0].id);
        }
      }
      if (warnings.length) alert("⚠️ Недостаточно остатков:\n" + warnings.join("\n"));
    }
    if (!targetIsWon && prevWasWon && orderProds.length > 0) {
      for (const dp of orderProds) {
        if (!dp.product_id) continue;
        const { data: variants } = await supabase.from("product_variants").select("id, stock").eq("product_id", dp.product_id).limit(1);
        if (variants?.[0]) {
          await supabase.from("product_variants").update({ stock: variants[0].stock + (dp.quantity ?? 0) }).eq("id", variants[0].id);
        }
      }
    }
  }

  async function updateStage(newStage: string) {
    const oldStage = deal.stage;
    setDeal((p: typeof deal) => ({ ...p, stage: newStage }));
    const { error } = await apiPut("/api/deals", {
      id: deal.id,
      stage: newStage,
      ...(newStage === "won" ? { closed_at: new Date().toISOString() } : {}),
    });
    if (error) {
      setDeal((p: typeof deal) => ({ ...p, stage: oldStage }));
      alert("Не удалось изменить стадию: " + error);
      return;
    }
    await adjustStockForStage(newStage === "won", oldStage === "won");
  }

  async function updateFunnelStage(stage: FunnelStage) {
    if (deal.stage_id === stage.id) return;
    const oldStageId = deal.stage_id;
    const oldStage = deal.stage;
    const oldStageSlug = currentFunnelStage?.slug;
    const slugMap: Record<string, string> = {
      qualified: "lead", kp_sent: "proposal", objections: "negotiation",
      price_calc: "order_assembly", invoice: "order_assembly", won: "won", lost: "lost",
    };
    const newOldStage = slugMap[stage.slug] ?? deal.stage;

    setDeal((p: typeof deal) => ({ ...p, stage: newOldStage, stage_id: stage.id }));
    const { error } = await apiPut("/api/deals", {
      id: deal.id,
      stage: newOldStage,
      stage_id: stage.id,
      stage_changed_at: new Date().toISOString(),
      ...(stage.slug === "won" ? { closed_at: new Date().toISOString() } : {}),
    });
    if (error) {
      setDeal((p: typeof deal) => ({ ...p, stage: oldStage, stage_id: oldStageId }));
      alert("Не удалось изменить стадию: " + error);
      return;
    }
    await adjustStockForStage(stage.slug === "won", oldStageSlug === "won");
  }

  async function deleteDeal() {
    if (!confirm("Удалить сделку? Это действие нельзя отменить.")) return;
    setDeleteLoading(true);
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "deals", ids: [deal.id] }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert("Не удалось удалить: " + (data.error ?? "неизвестная ошибка"));
      setDeleteLoading(false);
      return;
    }
    router.push("/deals");
  }

  const totalRequest = requestProducts.reduce((s: number, p: { total_price: number }) => s + (p.total_price ?? 0), 0);
  const totalOrder = orderProducts.reduce((s: number, p: { total_price: number }) => s + (p.total_price ?? 0), 0);
  const stageIndex = STAGES.findIndex((s) => s.key === deal.stage);

  // Recalculate deal.amount from products. Only "order" rows count — "request"
  // rows are what the client originally asked for, not what's being sold.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function recalcDealAmount(products: any[]) {
    const total = products
      .filter((p: { product_block?: string }) => p.product_block === "order")
      .reduce((s: number, p: { total_price: number }) => s + (p.total_price ?? 0), 0);
    if (total === deal.amount) return;
    setDeal((prev: typeof deal) => ({ ...prev, amount: total }));
    fetch("/api/deals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deal.id, title: deal.title, stage: deal.stage, amount: total }),
    }).catch(() => {});
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/deals" className="flex items-center gap-1 text-xs hover:underline" style={{ color: "#666" }}>
          <ChevronLeft size={14} /> Все сделки
        </Link>
        <div className="flex items-center gap-2">
          {deal.amount && <span className="text-sm font-semibold" style={{ color: "#2e7d32" }}>{formatCurrency(deal.amount)}</span>}
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 size={13} /> Редактировать
          </Button>
          <Button variant="danger" size="sm" onClick={deleteDeal} loading={deleteLoading}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Stage pipeline - funnel stages */}
      {hasFunnelStages ? (
        <div className="mb-4 flex gap-1.5">
          <div className="flex-1 rounded overflow-hidden flex" style={{ border: "1px solid #e0e0e0" }}>
            {regularStages.map((stage, idx) => {
              const isActive = deal.stage_id === stage.id;
              const activeIdx = regularStages.findIndex((s) => s.id === deal.stage_id);
              const isPast = activeIdx >= 0 && idx < activeIdx;
              return (
                <button
                  key={stage.id}
                  onClick={() => updateFunnelStage(stage)}
                  className="flex-1 text-center py-2.5 text-xs font-medium transition-colors"
                  style={{
                    background: isActive ? stage.color : isPast ? "#e8f4fd" : "#f5f5f5",
                    color: isActive ? "#fff" : isPast ? "#0067a5" : "#888",
                    borderRight: idx < regularStages.length - 1 ? "1px solid #ddd" : "none",
                  }}
                >
                  {stage.name}
                </button>
              );
            })}
          </div>
          {finalStages.map((stage) => {
            const isActive = deal.stage_id === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => updateFunnelStage(stage)}
                className="rounded px-3 text-xs font-medium transition-colors"
                style={{
                  background: isActive ? stage.color : "#f8f8f8",
                  color: isActive ? "#fff" : stage.color,
                  border: `1px solid ${isActive ? stage.color : "#e0e0e0"}`,
                  padding: "9px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                {stage.name}
              </button>
            );
          })}
        </div>
      ) : (
        <Card className="mb-4">
          <div className="px-5 py-3">
            <div className="flex items-center gap-0">
              {STAGES.map((stage, idx) => {
                const isActive = deal.stage === stage.key;
                const isPast = idx < stageIndex;
                const isLost = stage.key === "lost";
                return (
                  <button
                    key={stage.key}
                    onClick={() => updateStage(stage.key)}
                    className="flex-1 text-center py-2 text-xs font-medium transition-colors relative"
                    style={{
                      background: isActive ? STAGE_COLORS[stage.key] : isPast ? "#e8f4fd" : "#f5f5f5",
                      color: isActive ? "#fff" : isPast ? "#0067a5" : "#888",
                      borderRadius: idx === 0 ? "4px 0 0 4px" : idx === STAGES.length - 1 ? "0 4px 4px 0" : 0,
                      borderRight: idx < STAGES.length - 1 ? "1px solid #ddd" : "none",
                      ...(isLost && isActive ? { background: "#c62828" } : {}),
                    }}
                  >
                    {stage.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardBody>
              <h2 className="text-base font-semibold mb-1" style={{ color: "#333" }}>{deal.title}</h2>
              {deal.description && <p className="text-sm" style={{ color: "#666" }}>{deal.description}</p>}
            </CardBody>
          </Card>

          {/* Tabs */}
          <div>
            <div className="flex overflow-x-auto whitespace-nowrap" style={{ borderBottom: "1px solid #e4e4e4", marginBottom: 16, scrollbarWidth: "thin" }}>
              {[
                { id: "info", label: "Информация" },
                { id: "communications", label: `Коммуникации (${communications.length})` },
                { id: "tasks", label: `Задачи (${tasks.length})` },
                { id: "products", label: `Товары (${dealProducts.length})` },
                { id: "files", label: `📎 Файлы (${dealFiles.length})` },
                { id: "invoices", label: `🧾 Счета (${dealInvoices.length})` },
                { id: "contracts", label: "📄 Договоры" },
                { id: "quotes", label: "📋 КП" },
                { id: "production", label: "🏭 Производство" },
                { id: "email", label: "📧 Почта" },
                { id: "telegram", label: "💬 Telegram" },
                { id: "maks", label: "🔵 МАКС" },
              ].map((tab) => (
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
                <p>Создана: {formatDateTime(deal.created_at)}</p>
                <p>Обновлена: {formatDateTime(deal.updated_at)}</p>
                {deal.source && <p>Источник: {deal.source}</p>}
                {deal.closed_at && <p>Закрыта: {formatDate(deal.closed_at)}</p>}
                <div className="mt-2">
                  <p className="text-xs font-semibold mb-1" style={{ color: "#888" }}>Адреса:</p>
                  <AddressList
                    addresses={deal.addresses ?? []}
                    onChange={async (addresses) => {
                      const prev = deal.addresses ?? [];
                      setDeal((p: Record<string, unknown>) => ({ ...p, addresses }));
                      const { error } = await apiPut("/api/deals", { id: deal.id, addresses });
                      if (error) {
                        setDeal((p: Record<string, unknown>) => ({ ...p, addresses: prev }));
                        alert("Не удалось сохранить адреса: " + error);
                      }
                    }}
                  />
                </div>
                {deal.objections && (
                  <div className="mt-3">
                    <p className="font-medium mb-1" style={{ color: "#333" }}>Возражения:</p>
                    <p className="whitespace-pre-wrap" style={{ color: "#555" }}>{deal.objections}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "communications" && (
              <div className="space-y-3">
                <Card>
                  <CardBody>
                    <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Добавить заметку..." rows={4}
                      className="w-full text-sm p-3 resize-none focus:outline-none"
                      style={{ border: "1px solid #ddd", borderRadius: 4, minHeight: 100 }} />
                    {noteAttachment && (
                      <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded text-xs" style={{ background: "#f0f7fb", border: "1px solid #d0e8f5", color: "#0067a5" }}>
                        <Paperclip size={12} />
                        <a href={noteAttachment.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline">{noteAttachment.name}</a>
                        <button onClick={() => setNoteAttachment(null)} className="text-slate-500 hover:text-red-600">×</button>
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-2">
                      <label className="flex items-center gap-1 text-xs cursor-pointer hover:underline" style={{ color: "#0067a5" }}>
                        <Paperclip size={12} />
                        {noteUploading ? "Загрузка..." : "Прикрепить файл"}
                        <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachToNote(f); e.target.value = ""; }} disabled={noteUploading} />
                      </label>
                      <Button size="sm" onClick={addNote} loading={noteLoading} disabled={!noteText.trim() && !noteAttachment}>
                        <MessageSquare size={13} /> Добавить заметку
                      </Button>
                    </div>
                  </CardBody>
                </Card>
                <CommunicationsTimeline entityType="deal" entityId={deal.id} refreshKey={commsRefreshKey} />
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

            {activeTab === "email" && (
              deal.contacts?.email ? (
                <EmailThread
                  email={deal.contacts.email}
                  compact
                  entityType="deal"
                  entityId={deal.id}
                  extraRecipients={[
                    deal.contacts.email_other ? { label: `${deal.contacts.email_other} (доп.)`, value: deal.contacts.email_other } : null,
                    deal.companies?.email ? { label: `${deal.companies.email} (компания)`, value: deal.companies.email } : null,
                  ].filter(Boolean) as { label: string; value: string }[]}
                />
              ) : (
                <div className="text-center py-8"><p className="text-sm" style={{ color: "#aaa" }}>{deal.contacts ? "У контакта не указан email" : "Привяжите контакт с email"}</p></div>
              )
            )}

            {activeTab === "telegram" && (
              deal.contacts?.telegram_id ? (
                <div>
                  <p className="text-xs mb-2" style={{ color: "#888" }}>Переписка с <strong>{deal.contacts.full_name}</strong>{deal.contacts.telegram_username ? ` (@${deal.contacts.telegram_username})` : ""}</p>
                  <TelegramChat peer={deal.contacts.telegram_username || deal.contacts.phone || deal.contacts.telegram_id} compact entityType="deal" entityId={deal.id} phone={deal.contacts.phone || undefined} />
                </div>
              ) : (
                <div className="text-center py-8"><p className="text-sm" style={{ color: "#aaa" }}>{deal.contacts ? "У контакта не указан Telegram" : "Привяжите контакт с Telegram"}</p></div>
              )
            )}

            {activeTab === "maks" && (
              deal.contacts?.maks_id ? (
                <div>
                  <p className="text-xs mb-2" style={{ color: "#888" }}>МАКС: <strong>{deal.contacts.full_name}</strong></p>
                  <MaxChat chatId={deal.contacts.maks_id} compact entityType="deal" entityId={deal.id} />
                </div>
              ) : (
                <div className="text-center py-8"><p className="text-sm" style={{ color: "#aaa" }}>{deal.contacts ? "У контакта не указан МАКС" : "Привяжите контакт с МАКС"}</p></div>
              )
            )}

            {activeTab === "production" && (
              <DealProduction dealId={deal.id} dealStage={deal.stage} />
            )}

            {activeTab === "quotes" && (
              <DealQuotes dealId={deal.id} />
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
                          fd.append("deal_id", deal.id);
                          try {
                            const res = await fetch("/api/deals/files", { method: "POST", body: fd });
                            const data = await res.json().catch(() => ({}));
                            if (res.ok) {
                              setDealFiles((prev) => [data, ...prev]);
                            } else {
                              alert(`Не удалось загрузить ${files[i].name}: ${data.error || `HTTP ${res.status}`}`);
                            }
                          } catch (err) {
                            alert(`Не удалось загрузить ${files[i].name}: ${(err as Error).message}`);
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
                {dealFiles.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: "#aaa" }}>Нет файлов</p>
                ) : (
                  <div className="space-y-1">
                    {dealFiles.map((f: { id: string; file_name: string; file_url: string; file_type?: string; file_size?: number; created_at: string }) => (
                      <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50" style={{ border: "1px solid #f0f0f0" }}>
                        <Paperclip size={14} className="flex-shrink-0 text-slate-400" />
                        <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-blue-600 hover:underline truncate">{f.file_name}</a>
                        <span className="text-xs text-slate-400">{f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ""}</span>
                        <span className="text-xs text-slate-400">{new Date(f.created_at).toLocaleDateString("ru-RU")}</span>
                        <button onClick={async () => {
                          if (!confirm("Удалить файл?")) return;
                          await fetch("/api/deals/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id }) });
                          setDealFiles((prev) => prev.filter((x: { id: string }) => x.id !== f.id));
                        }} className="p-1 rounded hover:bg-red-50"><Trash2 size={12} className="text-red-400" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "invoices" && (
              <div className="space-y-2">
                {dealInvoices.length === 0 ? (
                  <div className="text-center py-8">
                    <Receipt size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm" style={{ color: "#aaa" }}>Нет счетов для этой сделки</p>
                    <Link href="/invoices" className="text-xs text-blue-600 hover:underline mt-1 inline-block">Создать счёт</Link>
                  </div>
                ) : (
                  dealInvoices.map((inv: { id: string; invoice_number: string; invoice_date: string; total_amount: number; status: string; buyer_name: string }) => (
                    <div key={inv.id} className="flex items-center justify-between px-4 py-3 rounded" style={{ border: "1px solid #e4e4e4", background: "#fafafa" }}>
                      <div>
                        <p className="text-sm font-medium">Счёт №{inv.invoice_number}</p>
                        <p className="text-xs text-slate-500">{inv.buyer_name} · {new Date(inv.invoice_date).toLocaleDateString("ru-RU")}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold" style={{ color: "#2e7d32" }}>{formatCurrency(inv.total_amount)}</span>
                        <Link href="/invoices" className="text-xs px-2 py-1 rounded hover:bg-blue-50" style={{ color: "#0067a5", border: "1px solid #b3e0f5" }}>
                          <FileDown size={12} className="inline mr-1" />Открыть
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "contracts" && (
              <ContractsClient dealId={deal.id} />
            )}

            {activeTab === "products" && (
              <div className="space-y-5">
                <DealProductBlock
                  title="Запрос"
                  description="Первичный интерес — с чем пришёл клиент"
                  items={requestProducts}
                  total={totalRequest}
                  onAdd={() => setAddProductBlock("request")}
                  onEdit={(item) => setEditingProduct(item)}
                  onRemove={(id) => { const updated = dealProducts.filter((x: { id: string }) => x.id !== id); setDealProducts(updated); recalcDealAmount(updated); }}
                  onUpdate={(id, fields) => { const updated = dealProducts.map((x: { id: string }) => x.id === id ? { ...x, ...fields } : x); setDealProducts(updated); recalcDealAmount(updated); }}
                />
                <DealProductBlock
                  title="Заказ"
                  description="Фактическая покупка — влияет на остатки"
                  items={orderProducts}
                  total={totalOrder}
                  onAdd={() => setAddProductBlock("order")}
                  block="order"
                  onEdit={(item) => setEditingProduct(item)}
                  onRemove={(id) => { const updated = dealProducts.filter((x: { id: string }) => x.id !== id); setDealProducts(updated); recalcDealAmount(updated); }}
                  onUpdate={(id, fields) => { const updated = dealProducts.map((x: { id: string }) => x.id === id ? { ...x, ...fields } : x); setDealProducts(updated); recalcDealAmount(updated); }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {/* Survey discount badge */}
          {deal.contacts && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none"
              style={{
                background: deal.contacts.survey_discount ? "#e8f5e9" : "#f8f9fa",
                border: `1px solid ${deal.contacts.survey_discount ? "#a5d6a7" : "#e4e4e4"}`,
              }}
              onClick={async () => {
                const newVal = !deal.contacts.survey_discount;
                setDeal({ ...deal, contacts: { ...deal.contacts, survey_discount: newVal } });
                const { error } = await apiPut("/api/contacts", { id: deal.contacts.id, survey_discount: newVal });
                if (error) {
                  setDeal({ ...deal, contacts: { ...deal.contacts, survey_discount: !newVal } });
                  alert("Не удалось сохранить отметку: " + error);
                }
              }}
            >
              <input
                type="checkbox"
                checked={deal.contacts?.survey_discount ?? false}
                readOnly
                style={{ accentColor: "#2e7d32", width: 16, height: 16 }}
              />
              <span className="text-xs font-medium" style={{ color: deal.contacts.survey_discount ? "#2e7d32" : "#888" }}>
                Прошёл опрос — скидка 20% на след. заказ
              </span>
            </div>
          )}

          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase" style={{ color: "#888", letterSpacing: "0.05em" }}>Контакты</h3>
                <button onClick={() => setAddContactOpen(!addContactOpen)} className="text-xs flex items-center gap-0.5" style={{ color: "#0067a5" }}>
                  <Plus size={12} /> Добавить
                </button>
              </div>
              {deal.contacts && (
                <Link href={`/contacts/${deal.contacts.id}`} className="flex items-center gap-3 hover:opacity-80 mb-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#e8f4fd", color: "#0067a5" }}>
                    {getInitials(deal.contacts.full_name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#333" }}>{deal.contacts.full_name}</p>
                    {deal.contacts.phone && <p className="text-xs flex items-center gap-1" style={{ color: "#888" }}><Phone size={10} />{deal.contacts.phone}</p>}
                    {deal.contacts.email && <p className="text-xs flex items-center gap-1" style={{ color: "#888" }}><Mail size={10} />{deal.contacts.email}</p>}
                  </div>
                </Link>
              )}
              {extraContacts.map((dc: { id: string; contacts: { id: string; full_name: string; phone?: string; email?: string } }) => (
                <div key={dc.id} className="flex items-center gap-3 mb-2">
                  <Link href={`/contacts/${dc.contacts.id}`} className="flex items-center gap-3 hover:opacity-80 flex-1">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#f0f0f0", color: "#666" }}>
                      {getInitials(dc.contacts.full_name)}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#333" }}>{dc.contacts.full_name}</p>
                      {dc.contacts.phone && <p className="text-xs" style={{ color: "#888" }}>{dc.contacts.phone}</p>}
                    </div>
                  </Link>
                  <button onClick={async () => {
                    const { error } = await apiDelete("/api/deals/contacts", { id: dc.id });
                    if (error) { alert("Не удалось удалить контакт: " + error); return; }
                    setExtraContacts((prev) => prev.filter((x: { id: string }) => x.id !== dc.id));
                  }} className="p-1 rounded hover:bg-red-50 flex-shrink-0"><Trash2 size={11} className="text-red-400" /></button>
                </div>
              ))}
              {addContactOpen && (
                <div className="mt-2 p-2 rounded" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
                  <input value={contactSearch} onChange={async (e) => {
                    setContactSearch(e.target.value);
                    if (e.target.value.length >= 2) {
                      // Search by name OR phone — needed for splitting/merging duplicates
                      const term = e.target.value;
                      const { data } = await createClient()
                        .from("contacts")
                        .select("id, full_name, phone")
                        .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`)
                        .limit(10);
                      setContactResults(data ?? []);
                    } else setContactResults([]);
                  }} placeholder="Поиск по имени или телефону..." className="w-full text-xs px-2 py-1.5 rounded mb-1 focus:outline-none" style={{ border: "1px solid #d0d0d0" }} />
                  {contactResults.map((c: { id: string; full_name: string; phone?: string }) => (
                    <button key={c.id} onClick={async () => {
                      const { data, error } = await apiPost<{ id: string; contact_id: string; is_primary: boolean; contacts: { id: string; full_name: string; phone?: string; email?: string } }>(
                        "/api/deals/contacts",
                        { deal_id: deal.id, contact_id: c.id, is_primary: false }
                      );
                      if (error || !data) { alert("Не удалось привязать контакт: " + (error ?? "")); return; }
                      // Avoid duplicate row if backend returned an existing record
                      setExtraContacts((prev) => prev.some((x: { id: string }) => x.id === data.id) ? prev : [...prev, data]);
                      setAddContactOpen(false); setContactSearch(""); setContactResults([]);
                    }} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-blue-50">
                      {c.full_name} {c.phone ? `· ${c.phone}` : ""}
                    </button>
                  ))}
                </div>
              )}
              {!deal.contacts && extraContacts.length === 0 && !addContactOpen && (
                <p className="text-xs" style={{ color: "#aaa" }}>Нет контактов</p>
              )}
            </CardBody>
          </Card>

          {deal.companies && (
            <Card>
              <CardBody>
                <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: "#888", letterSpacing: "0.05em" }}>Компания</h3>
                <Link href={`/companies/${deal.companies.id}`} className="flex items-center gap-2 text-sm hover:underline" style={{ color: "#0067a5" }}>
                  <Building2 size={13} />{deal.companies.name}
                </Link>
                <div className="mt-2">
                  <ClientTimeIndicator timezone={deal.companies.timezone} region={deal.companies.city || deal.companies.region} address={deal.companies.legal_address} />
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: "#888", letterSpacing: "0.05em" }}>Ответственный</h3>
              <DealAssignee dealId={deal.id} currentUser={deal.users} onChanged={(u) => setDeal((p: typeof deal) => ({ ...p, users: u, assigned_to: u?.id }))} />
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CustomFieldsSection entityType="deal" entityId={deal.id} />
            </CardBody>
          </Card>
        </div>
      </div>

      <EditDealModal open={editOpen} onClose={() => setEditOpen(false)} deal={deal} onSaved={setDeal} />
      <AddProductModal
        open={addProductBlock !== null}
        onClose={() => setAddProductBlock(null)}
        entityType="deal"
        entityId={deal.id}
        productBlock={addProductBlock ?? "request"}
        onAdded={(item) => {
          const updated = [...dealProducts, item];
          setDealProducts(updated);
          recalcDealAmount(updated);
        }}
      />
      <EditProductModal
        open={editingProduct !== null}
        onClose={() => setEditingProduct(null)}
        entityType="deal"
        item={editingProduct}
        onSaved={(updatedItem) => {
          const updated = dealProducts.map((x: { id: string }) => x.id === updatedItem.id ? updatedItem : x);
          setDealProducts(updated);
          recalcDealAmount(updated);
        }}
      />
      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        entityType="deal"
        entityId={deal.id}
        defaultAssignedTo={deal.assigned_to}
        onCreated={(task) => setTasks((p: unknown[]) => [task, ...p])}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DealProductBlock({ title, description, items, total, onAdd, block = "request", onRemove, onUpdate, onEdit }: { title: string; description: string; items: any[]; total: number; onAdd: () => void; block?: string; onRemove?: (id: string) => void; onUpdate?: (id: string, fields: Record<string, unknown>) => void; onEdit?: (item: any) => void }) {

  async function handleDelete(id: string) {
    if (!confirm("Удалить товар из заказа?")) return;
    const { error } = await createClient().from("deal_products").delete().eq("id", id);
    if (!error) onRemove?.(id);
    else alert("Ошибка: " + error.message);
  }

  async function handleFieldUpdate(id: string, field: string, value: number) {
    const updates: Record<string, unknown> = { [field]: value };
    // Recalculate total_price if quantity or unit_price changed
    const item = items.find((i: { id: string }) => i.id === id);
    if (item) {
      const qty = field === "quantity" ? value : item.quantity;
      const price = field === "unit_price" ? value : item.unit_price;
      updates.total_price = qty * price;
    }
    const { error } = await createClient().from("deal_products").update(updates).eq("id", id);
    if (!error) onUpdate?.(id, updates);
    else alert("Ошибка: " + error.message);
  }

  // Backlog v5 §1.1.3: remove a single variant row inside a product block.
  // total_price is recomputed from the remaining variants (or unit_price *
  // quantity if no variants left).
  async function handleVariantRemove(id: string, varIdx: number) {
    const item = items.find((i: { id: string }) => i.id === id);
    if (!item) return;
    const nextVariants = (item.variants ?? []).filter((_: unknown, i: number) => i !== varIdx);
    const total = nextVariants.length
      ? nextVariants.reduce((s: number, v: { sum?: number; price: number; quantity: number }) => s + (v.sum ?? v.price * v.quantity), 0)
      : (item.unit_price ?? 0) * (item.quantity ?? 1);
    const updates = { variants: nextVariants, total_price: total };
    const { error } = await createClient().from("deal_products").update(updates).eq("id", id);
    if (error) { alert("Ошибка: " + error.message); return; }
    onUpdate?.(id, updates);
  }
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
                  <th className="px-2 py-2 text-xs font-medium" style={{ color: "#888", width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: { id: string; products: { name: string; sku: string; image_url?: string }; base_price?: number; category?: string; subcategory?: string; volume_ml?: number; flavor?: string; lifecycle_days?: number; quantity: number; unit_price: number; discount_percent: number; total_price: number; variants?: { label: string; price: number; quantity: number; sum: number }[] }) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td className="px-4 py-2">
                      <div className="flex items-start gap-3">
                        {item.products?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.products.image_url} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0 border" style={{ borderColor: "#e0e0e0" }} />
                        ) : (
                          <div className="w-12 h-12 rounded flex-shrink-0 flex items-center justify-center" style={{ background: "#f5f5f5", border: "1px solid #e0e0e0" }}>
                            <Package size={18} style={{ color: "#bbb" }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium" style={{ color: "#333" }}>
                            {item.products?.name}
                            {item.volume_ml && <span className="text-xs font-normal ml-1" style={{ color: "#888" }}>{item.volume_ml} мл</span>}
                          </p>
                          <p className="text-xs" style={{ color: "#aaa" }}>Арт. {item.products?.sku}</p>
                          {item.flavor && <p className="text-xs" style={{ color: "#7b1fa2" }}>{item.flavor}</p>}
                          {(item.category || item.subcategory) && (
                            <p className="text-xs" style={{ color: "#0067a5" }}>{[item.category, item.subcategory].filter(Boolean).join(" → ")}</p>
                          )}
                          {item.variants && item.variants.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {item.variants.map((v, i) => (
                                <div key={i} className="flex items-center justify-between gap-2 text-xs" style={{ color: "#e65c00" }}>
                                  <span className="flex-1 min-w-0 break-words">• {v.label}</span>
                                  <span className="whitespace-nowrap" style={{ color: "#bf7600" }}>{v.quantity} × {formatCurrency(v.price)} = {formatCurrency(v.sum)}</span>
                                  <button onClick={() => handleVariantRemove(item.id, i)}
                                    className="text-red-300 hover:text-red-600 flex-shrink-0" title="Удалить вариацию">
                                    <X size={11} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {item.category?.toLowerCase().includes("косметик") && block === "order" && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs" style={{ color: "#e65c00" }}>🔄</span>
                          <input type="number" min="0" placeholder="дн." defaultValue={item.lifecycle_days ?? ""}
                            className="w-12 text-xs px-1 py-0.5 rounded outline-none" style={{ border: "1px solid #ffe0b2", color: "#e65c00" }}
                            onBlur={async (e) => {
                              const val = Number(e.target.value) || null;
                              await createClient().from("deal_products").update({ lifecycle_days: val }).eq("id", item.id);
                            }}
                          />
                          <span className="text-xs" style={{ color: "#bf7600" }}>дн.</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input type="number" min="1" defaultValue={item.quantity}
                        className="w-14 text-sm text-right px-1 py-0.5 rounded focus:outline-none" style={{ border: "1px solid #e0e0e0", color: "#555" }}
                        onBlur={(e) => handleFieldUpdate(item.id, "quantity", Number(e.target.value) || 1)} />
                    </td>
                    <td className="px-4 py-2 text-right" style={{ color: "#aaa" }}>{item.base_price ? formatCurrency(item.base_price) : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <input type="number" min="0" step="0.01" defaultValue={item.unit_price}
                        className="w-20 text-sm text-right px-1 py-0.5 rounded focus:outline-none" style={{ border: "1px solid #e0e0e0", color: "#555" }}
                        onBlur={(e) => handleFieldUpdate(item.id, "unit_price", Number(e.target.value) || 0)} />
                    </td>
                    <td className="px-4 py-2 text-right" style={{ color: item.discount_percent > 0 ? "#d32f2f" : "#aaa" }}>
                      {item.discount_percent > 0 ? `-${item.discount_percent}%` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold" style={{ color: "#333" }}>{formatCurrency(item.total_price)}</td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => onEdit?.(item)} className="p-1 rounded hover:bg-blue-50" title="Редактировать">
                          <Edit2 size={13} style={{ color: "#0067a5" }} />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1 rounded hover:bg-red-50" title="Удалить">
                          <Trash2 size={13} style={{ color: "#c62828" }} />
                        </button>
                      </div>
                    </td>
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


function DealQuotes({ dealId }: { dealId: string }) {
  const [quotes, setQuotes] = useState<{ id: string; quote_number: number; total_amount: number; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createClient().from("quotes").select("id, quote_number, total_amount, status, created_at").eq("deal_id", dealId).order("created_at", { ascending: false })
      .then(({ data }) => { setQuotes(data ?? []); setLoading(false); });
  }, [dealId]);

  const SL: Record<string, string> = { draft: "Черновик", sent: "Отправлено", accepted: "Принято", rejected: "Отклонено" };

  if (loading) return <p className="text-xs text-center py-6" style={{ color: "#aaa" }}>Загрузка...</p>;

  return (
    <div className="space-y-2">
      {quotes.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: "#aaa" }}>Нет КП для этой сделки</p>
      ) : quotes.map((q) => (
        <div key={q.id} className="flex items-center justify-between px-4 py-3 rounded hover:bg-gray-50" style={{ border: "1px solid #f0f0f0" }}>
          <div>
            <span className="text-sm font-medium" style={{ color: "#0067a5" }}>КП #{q.quote_number}</span>
            <span className="text-xs ml-3" style={{ color: "#888" }}>{formatDate(q.created_at)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: "#2e7d32" }}>{formatCurrency(q.total_amount)}</span>
            <Badge variant={q.status === "accepted" ? "success" : q.status === "rejected" ? "danger" : q.status === "sent" ? "warning" : "default"}>
              {SL[q.status] ?? q.status}
            </Badge>
            <a href={"/q/" + q.id} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline" style={{ color: "#0067a5" }}>Открыть</a>
          </div>
        </div>
      ))}
    </div>
  );
}

function DealAssignee({ dealId, currentUser, onChanged }: { dealId: string; currentUser: { id: string; full_name: string } | null; onChanged: (u: { id: string; full_name: string } | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);

  async function loadUsers() {
    const { data } = await createClient().from("users").select("id, full_name").eq("is_active", true).order("full_name");
    setUsers(data ?? []);
    setEditing(true);
  }

  async function change(userId: string) {
    const { error } = await apiPut("/api/deals", { id: dealId, assigned_to: userId || null });
    if (error) { alert("Не удалось сменить ответственного: " + error); setEditing(false); return; }
    const user = users.find((u) => u.id === userId) ?? null;
    onChanged(user);
    setEditing(false);
  }

  if (editing) {
    return (
      <select onChange={(e) => change(e.target.value)} defaultValue={currentUser?.id ?? ""} autoFocus
        className="w-full text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none" onBlur={() => setEditing(false)}>
        <option value="">Не назначен</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
      </select>
    );
  }

  return (
    <button onClick={loadUsers} className="flex items-center gap-2 hover:bg-gray-50 rounded px-1 py-0.5 w-full text-left">
      {currentUser ? (
        <>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "#e8f4fd", color: "#0067a5" }}>
            {getInitials(currentUser.full_name)}
          </div>
          <span className="text-sm" style={{ color: "#333" }}>{currentUser.full_name}</span>
        </>
      ) : (
        <span className="text-sm" style={{ color: "#aaa" }}>Назначить ответственного</span>
      )}
    </button>
  );
}

function DealProduction({ dealId, dealStage }: { dealId: string; dealStage: string }) {
  const [prod, setProd] = useState<{ id: string; stage: string; tracking_number?: string; estimated_arrival?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createClient().from("order_production").select("id, stage, tracking_number, estimated_arrival").eq("deal_id", dealId).limit(1).single()
      .then(({ data }) => { setProd(data); setLoading(false); });
  }, [dealId]);

  async function createProduction() {
    const res = await fetch("/api/production", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", deal_id: dealId }),
    });
    if (res.ok) window.location.reload();
    else { const d = await res.json(); alert(d.error ?? "Ошибка"); }
  }

  const STAGE_LABELS: Record<string, string> = { new: "Передан в работу", in_progress: "В работе", discussion: "Обсуждение", packing: "Упаковка", shipped: "Отправлен", delivered: "Доставлен", review_requested: "Отзыв запрошен" };

  if (loading) return <p className="text-xs text-center py-6" style={{ color: "#aaa" }}>Загрузка...</p>;

  if (!prod) {
    return (
      <div className="text-center py-8">
        <p className="text-xs mb-3" style={{ color: "#aaa" }}>Заказ ещё не передан в производство</p>
        {dealStage === "won" && (
          <button onClick={createProduction} className="text-xs px-3 py-1.5 rounded text-white" style={{ background: "#0067a5" }}>
            Передать в производство
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-4 py-3 rounded" style={{ border: "1px solid #e4e4e4" }}>
        <div>
          <p className="text-sm font-medium" style={{ color: "#333" }}>Этап: {STAGE_LABELS[prod.stage] ?? prod.stage}</p>
          {prod.tracking_number && <p className="text-xs font-mono mt-1" style={{ color: "#7b1fa2" }}>🚚 {prod.tracking_number}</p>}
          {prod.estimated_arrival && <p className="text-xs mt-0.5" style={{ color: "#2e7d32" }}>📦 Прибытие: {formatDate(prod.estimated_arrival)}</p>}
        </div>
        <a href="/production" className="text-xs hover:underline" style={{ color: "#0067a5" }}>Открыть в канбане →</a>
      </div>
    </div>
  );
}

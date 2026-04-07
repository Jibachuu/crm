"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Edit2, Trash2, Phone, Mail, Building2, Package, Plus, CheckSquare, MessageSquare, Send } from "lucide-react";
import TelegramChat from "@/components/ui/TelegramChat";
import EmailThread from "@/components/ui/EmailThread";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ClientTimeIndicator from "@/components/ui/ClientTimeIndicator";
import { Card, CardBody } from "@/components/ui/Card";
import CreateTaskModal from "@/components/ui/CreateTaskModal";
import CustomFieldsSection from "@/components/ui/CustomFieldsSection";
import AddProductModal from "@/components/ui/AddProductModal";
import EditDealModal from "../EditDealModal";
import { formatDate, formatDateTime, formatCurrency, getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DealDetail({ deal: initialDeal, communications: initialComms, tasks: initialTasks, dealProducts: initialDealProducts }: any) {
  const router = useRouter();
  const [deal, setDeal] = useState(initialDeal);
  const [communications, setCommunications] = useState(initialComms);
  const [tasks, setTasks] = useState(initialTasks);
  const [dealProducts, setDealProducts] = useState(initialDealProducts ?? []);
  const [activeTab, setActiveTab] = useState<"info" | "communications" | "tasks" | "products" | "email" | "telegram" | "quotes">("info");
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [addProductBlock, setAddProductBlock] = useState<"request" | "order" | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const requestProducts = dealProducts.filter((p: { product_block: string }) => p.product_block !== "order");
  const orderProducts = dealProducts.filter((p: { product_block: string }) => p.product_block === "order");

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("communications")
      .insert({ entity_type: "deal", entity_id: deal.id, channel: "note", direction: "outbound", body: noteText.trim(), created_by: user?.id ?? null })
      .select("*, users!communications_created_by_fkey(full_name)")
      .single();
    if (data) { setCommunications((p: unknown[]) => [data, ...p]); setNoteText(""); }
    setNoteLoading(false);
  }

  async function updateStage(newStage: string) {
    const supabase = createClient();
    const oldStage = deal.stage;
    await supabase.from("deals").update({ stage: newStage, ...(newStage === "won" ? { closed_at: new Date().toISOString() } : {}) }).eq("id", deal.id);

    // Stock management: deduct on "won", restore if moving back from "won"
    const orderProducts = dealProducts.filter((p: { product_block: string }) => p.product_block === "order");
    if (newStage === "won" && oldStage !== "won" && orderProducts.length > 0) {
      let warnings: string[] = [];
      for (const dp of orderProducts) {
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
    if (oldStage === "won" && newStage !== "won" && orderProducts.length > 0) {
      for (const dp of orderProducts) {
        if (!dp.product_id) continue;
        const { data: variants } = await supabase.from("product_variants").select("id, stock").eq("product_id", dp.product_id).limit(1);
        if (variants?.[0]) {
          await supabase.from("product_variants").update({ stock: variants[0].stock + (dp.quantity ?? 0) }).eq("id", variants[0].id);
        }
      }
    }

    // Trigger automations
    if (newStage === "proposal") {
      fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deal_stage_change", deal_id: deal.id }) });
    }
    if (newStage === "won" && oldStage !== "won") {
      fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deal_won", deal_id: deal.id }) });
    }

    setDeal((p: typeof deal) => ({ ...p, stage: newStage }));
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

      {/* Stage pipeline */}
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
                    background: isActive
                      ? STAGE_COLORS[stage.key]
                      : isPast
                      ? "#e8f4fd"
                      : "#f5f5f5",
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
            <div className="flex" style={{ borderBottom: "1px solid #e4e4e4", marginBottom: 16 }}>
              {[
                { id: "info", label: "Информация" },
                { id: "communications", label: `Коммуникации (${communications.length})` },
                { id: "tasks", label: `Задачи (${tasks.length})` },
                { id: "products", label: `Товары (${dealProducts.length})` },
                { id: "quotes", label: "📋 КП" },
                ...(deal.contacts?.email ? [{ id: "email", label: "📧 Почта" }] : []),
                ...(deal.contacts?.telegram_id ? [{ id: "telegram", label: "💬 Telegram" }] : []),
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className="px-4 py-2 text-sm font-medium transition-colors"
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
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Добавить заметку..."
                      rows={3}
                      className="w-full text-sm p-3 resize-none focus:outline-none"
                      style={{ border: "1px solid #ddd", borderRadius: 4 }}
                    />
                    <div className="flex justify-end mt-2">
                      <Button size="sm" onClick={addNote} loading={noteLoading} disabled={!noteText.trim()}>
                        <MessageSquare size={13} /> Добавить заметку
                      </Button>
                    </div>
                  </CardBody>
                </Card>
                {communications.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: "#aaa" }}>Коммуникации отсутствуют</p>
                ) : (
                  communications.map((comm: { id: string; channel: string; direction: string; body?: string; created_at: string; users?: { full_name: string } }) => (
                    <Card key={comm.id}>
                      <CardBody>
                        <div className="flex justify-between gap-3">
                          <div className="flex gap-3">
                            <span className="text-lg">{CHANNEL_ICONS[comm.channel]}</span>
                            <div>
                              <div className="flex gap-2 text-xs mb-1" style={{ color: "#999" }}>
                                <span className="font-medium">{CHANNEL_LABELS[comm.channel]}</span>
                                <span>{comm.direction === "inbound" ? "Входящее" : "Исходящее"}</span>
                                {comm.users && <span>• {comm.users.full_name}</span>}
                              </div>
                              {comm.body && <p className="text-sm whitespace-pre-wrap" style={{ color: "#555" }}>{comm.body}</p>}
                            </div>
                          </div>
                          <span className="text-xs flex-shrink-0" style={{ color: "#aaa" }}>{formatDateTime(comm.created_at)}</span>
                        </div>
                      </CardBody>
                    </Card>
                  ))
                )}
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
                  tasks.map((task: { id: string; title: string; priority: string; due_date?: string; users?: { full_name: string } }) => (
                    <Card key={task.id}>
                      <CardBody className="py-3">
                        <div className="flex items-center gap-3">
                          <CheckSquare size={15} style={{ color: "#aaa", flexShrink: 0 }} />
                          <div className="flex-1">
                            <p className="text-sm font-medium" style={{ color: "#333" }}>{task.title}</p>
                            <div className="flex gap-2 mt-0.5">
                              {task.due_date && <span className="text-xs" style={{ color: "#999" }}>до {formatDate(task.due_date)}</span>}
                              {task.users && <span className="text-xs" style={{ color: "#999" }}>• {task.users.full_name}</span>}
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

            {activeTab === "email" && deal.contacts?.email && (
              <EmailThread email={deal.contacts.email} compact entityType="deal" entityId={deal.id} />
            )}

            {activeTab === "telegram" && deal.contacts?.telegram_id && (
              <div>
                <p className="text-xs mb-2" style={{ color: "#888" }}>
                  Переписка с <strong>{deal.contacts.full_name}</strong> (@{deal.contacts.telegram_id})
                </p>
                <TelegramChat peer={deal.contacts.telegram_id} compact />
              </div>
            )}

            {activeTab === "quotes" && (
              <DealQuotes dealId={deal.id} />
            )}

            {activeTab === "products" && (
              <div className="space-y-5">
                <DealProductBlock
                  title="Запрос"
                  description="Первичный интерес — с чем пришёл клиент"
                  items={requestProducts}
                  total={totalRequest}
                  onAdd={() => setAddProductBlock("request")}
                />
                <DealProductBlock
                  title="Заказ"
                  description="Фактическая покупка — влияет на остатки"
                  items={orderProducts}
                  total={totalOrder}
                  onAdd={() => setAddProductBlock("order")}
                  block="order"
                />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {deal.contacts && (
            <Card>
              <CardBody>
                <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: "#888", letterSpacing: "0.05em" }}>Контакт</h3>
                <Link href={`/contacts/${deal.contacts.id}`} className="flex items-center gap-3 hover:opacity-80">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#e8f4fd", color: "#0067a5" }}>
                    {getInitials(deal.contacts.full_name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#333" }}>{deal.contacts.full_name}</p>
                    {deal.contacts.phone && <p className="text-xs flex items-center gap-1" style={{ color: "#888" }}><Phone size={10} />{deal.contacts.phone}</p>}
                    {deal.contacts.email && <p className="text-xs flex items-center gap-1" style={{ color: "#888" }}><Mail size={10} />{deal.contacts.email}</p>}
                  </div>
                </Link>
              </CardBody>
            </Card>
          )}

          {deal.companies && (
            <Card>
              <CardBody>
                <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: "#888", letterSpacing: "0.05em" }}>Компания</h3>
                <Link href={`/companies/${deal.companies.id}`} className="flex items-center gap-2 text-sm hover:underline" style={{ color: "#0067a5" }}>
                  <Building2 size={13} />{deal.companies.name}
                </Link>
                <div className="mt-2">
                  <ClientTimeIndicator timezone={deal.companies.timezone} region={deal.companies.city || deal.companies.region} />
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
        onAdded={(item) => setDealProducts((p: unknown[]) => [...p, item])}
      />
      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        entityType="deal"
        entityId={deal.id}
        onCreated={(task) => setTasks((p: unknown[]) => [task, ...p])}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DealProductBlock({ title, description, items, total, onAdd, block = "request" }: { title: string; description: string; items: any[]; total: number; onAdd: () => void; block?: string }) {
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
                {items.map((item: { id: string; products: { name: string; sku: string }; base_price?: number; category?: string; subcategory?: string; lifecycle_days?: number; quantity: number; unit_price: number; discount_percent: number; total_price: number }) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td className="px-4 py-2">
                      <p className="font-medium" style={{ color: "#333" }}>{item.products?.name}</p>
                      <p className="text-xs" style={{ color: "#aaa" }}>Арт. {item.products?.sku}</p>
                      {(item.category || item.subcategory) && (
                        <p className="text-xs" style={{ color: "#0067a5" }}>{[item.category, item.subcategory].filter(Boolean).join(" → ")}</p>
                      )}
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
    const supabase = createClient();
    await supabase.from("deals").update({ assigned_to: userId || null }).eq("id", dealId);
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

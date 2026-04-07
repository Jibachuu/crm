"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Package, Truck, X, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { formatDate } from "@/lib/utils";
import { getInitials } from "@/lib/utils";

const STAGES = [
  { key: "new", label: "Передан в работу", color: "#888" },
  { key: "in_progress", label: "В работе", color: "#0067a5" },
  { key: "discussion", label: "Обсуждение", color: "#e65c00" },
  { key: "packing", label: "Упаковка", color: "#f57c00" },
  { key: "shipped", label: "Отправлен", color: "#7b1fa2" },
  { key: "delivered", label: "Доставлен", color: "#2e7d32" },
  { key: "review_requested", label: "Отзыв запрошен", color: "#00838f" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ProductionKanban({ initialOrders, users, wonDeals, currentUserId, userRole }: any) {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newDealId, setNewDealId] = useState("");
  const [newWorkerId, setNewWorkerId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Modal for tracking number / arrival date
  const [promptModal, setPromptModal] = useState<{ orderId: string; stage: string; type: "tracking" | "arrival" } | null>(null);
  const [promptValue, setPromptValue] = useState("");

  // Detail panel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailComment, setDetailComment] = useState("");

  const isWorkerOrAdmin = userRole !== "manager";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = orders.filter((o: any) => {
    if (search && !o.companies?.name?.toLowerCase().includes(search.toLowerCase()) && !o.tracking_number?.toLowerCase().includes(search.toLowerCase())) return false;
    if (managerFilter && o.manager_id !== managerFilter) return false;
    if (workerFilter && o.worker_id !== workerFilter) return false;
    return true;
  });

  async function createOrder() {
    if (!newDealId) return;
    setSaving(true);
    const res = await fetch("/api/production", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", deal_id: newDealId, worker_id: newWorkerId || null, notes: newNotes || null }),
    });
    if (res.ok) { setCreateOpen(false); window.location.reload(); }
    else { const d = await res.json(); alert(d.error ?? "Ошибка"); }
    setSaving(false);
  }

  async function moveStage(orderId: string, newStage: string) {
    // Check if we need tracking number or arrival date
    if (newStage === "shipped") {
      setPromptModal({ orderId, stage: newStage, type: "tracking" });
      setPromptValue("");
      return;
    }
    if (newStage === "delivered") {
      setPromptModal({ orderId, stage: newStage, type: "arrival" });
      setPromptValue(new Date().toISOString().slice(0, 10));
      return;
    }
    await doMove(orderId, newStage);
  }

  async function doMove(orderId: string, stage: string, extra: Record<string, string> = {}) {
    await fetch("/api/production", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", id: orderId, stage, ...extra }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrders(orders.map((o: any) => o.id === orderId ? { ...o, stage, ...extra, updated_at: new Date().toISOString() } : o));
  }

  async function confirmPrompt() {
    if (!promptModal || !promptValue.trim()) return;
    const extra: Record<string, string> = promptModal.type === "tracking" ? { tracking_number: promptValue } : { estimated_arrival: promptValue };
    await doMove(promptModal.orderId, promptModal.stage, extra);
    setPromptModal(null);
  }

  async function addComment() {
    if (!detailOrder || !detailComment.trim()) return;
    await fetch("/api/production", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "comment", production_id: detailOrder.id, comment: detailComment }),
    });
    setDetailComment("");
  }

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по компании, трек-номеру..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} className="text-xs px-2 py-1.5 rounded outline-none" style={{ border: "1px solid #d0d0d0" }}>
          <option value="">Все МОПы</option>
          {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} className="text-xs px-2 py-1.5 rounded outline-none" style={{ border: "1px solid #d0d0d0" }}>
          <option value="">Все работники</option>
          {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <Button onClick={() => setCreateOpen(true)} size="sm"><Plus size={13} /> Новый заказ</Button>
      </div>

      {/* Kanban */}
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 160px)" }}>
        {STAGES.map((stage) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stageOrders = filtered.filter((o: any) => o.stage === stage.key);
          return (
            <div key={stage.key} className="flex-shrink-0 flex flex-col" style={{ width: 280 }}>
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2 rounded-t-lg" style={{ background: stage.color + "15", borderBottom: `2px solid ${stage.color}` }}>
                <span className="text-xs font-semibold" style={{ color: stage.color }}>{stage.label}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: stage.color + "20", color: stage.color }}>{stageOrders.length}</span>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-2 p-2 rounded-b-lg overflow-y-auto" style={{ background: "#fafafa", minHeight: 200 }}>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {stageOrders.map((order: any) => {
                  const products = (order.deals?.deal_products ?? []).map((dp: { quantity: number; products: { name: string } | { name: string }[] }) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const p = Array.isArray(dp.products) ? dp.products[0] : dp.products as any;
                    return `${p?.name ?? "?"} × ${dp.quantity}`;
                  }).join(", ");

                  return (
                    <div key={order.id} className="rounded-lg p-3 bg-white cursor-pointer hover:shadow-md transition-shadow"
                      style={{ border: "1px solid #e4e4e4" }}
                      onClick={() => setDetailOrder(order)}>
                      <p className="text-sm font-semibold mb-1" style={{ color: "#333" }}>{order.companies?.name ?? "—"}</p>
                      <p className="text-xs mb-1" style={{ color: "#0067a5" }}>{order.deals?.title ?? "—"}</p>
                      {products && <p className="text-xs mb-2 truncate" style={{ color: "#888" }}>{products}</p>}

                      <div className="flex items-center gap-2 text-xs">
                        {order.manager && (
                          <div className="flex items-center gap-1">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: "#0067a5", fontSize: 8 }}>{getInitials(order.manager.full_name)}</div>
                          </div>
                        )}
                        {order.worker && (
                          <div className="flex items-center gap-1">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: "#7b1fa2", fontSize: 8 }}>{getInitials(order.worker.full_name)}</div>
                          </div>
                        )}
                        <span className="ml-auto" style={{ color: "#aaa" }}>{formatDate(order.created_at)}</span>
                      </div>

                      {order.tracking_number && <p className="text-xs mt-1 font-mono" style={{ color: "#7b1fa2" }}>🚚 {order.tracking_number}</p>}
                      {order.estimated_arrival && <p className="text-xs" style={{ color: "#2e7d32" }}>📦 Прибытие: {formatDate(order.estimated_arrival)}</p>}

                      {/* Move buttons for workers/admins */}
                      {isWorkerOrAdmin && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {STAGES.filter((s) => s.key !== order.stage).slice(0, 3).map((s) => (
                            <button key={s.key} onClick={(e) => { e.stopPropagation(); moveStage(order.id, s.key); }}
                              className="text-xs px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
                              style={{ background: s.color + "15", color: s.color, fontSize: 9 }}>
                              → {s.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новый заказ в производство" size="md">
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "#888" }}>Сделка (Выигранная)</label>
            <select value={newDealId} onChange={(e) => setNewDealId(e.target.value)} style={inputStyle}>
              <option value="">Выберите сделку...</option>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {wonDeals.map((d: any) => <option key={d.id} value={d.id}>{d.title} — {(d.companies as unknown as { name: string })?.name ?? ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "#888" }}>Работник производства</label>
            <select value={newWorkerId} onChange={(e) => setNewWorkerId(e.target.value)} style={inputStyle}>
              <option value="">Не назначен</option>
              {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "#888" }}>Комментарий</label>
            <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <Button onClick={createOrder} loading={saving} disabled={!newDealId}><Package size={13} /> Создать</Button>
        </div>
      </Modal>

      {/* Prompt Modal (tracking / arrival) */}
      {promptModal && (
        <Modal open onClose={() => {}} title={promptModal.type === "tracking" ? "Введите трек-номер" : "Введите дату прибытия"} size="sm">
          <div className="p-5 space-y-3">
            <p className="text-xs" style={{ color: "#888" }}>
              {promptModal.type === "tracking" ? "Без трек-номера нельзя перевести в 'Отправлен'" : "Укажите ожидаемую дату прибытия"}
            </p>
            {promptModal.type === "tracking" ? (
              <input value={promptValue} onChange={(e) => setPromptValue(e.target.value)} style={inputStyle} placeholder="ABC123456789" autoFocus />
            ) : (
              <input type="date" value={promptValue} onChange={(e) => setPromptValue(e.target.value)} style={inputStyle} autoFocus />
            )}
            <div className="flex gap-2">
              <Button onClick={confirmPrompt} disabled={!promptValue.trim()}><Check size={13} /> Подтвердить</Button>
              <Button variant="secondary" onClick={() => setPromptModal(null)}>Отмена</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Panel */}
      {detailOrder && (
        <div className="fixed top-0 right-0 z-50 h-full flex flex-col shadow-2xl" style={{ width: 420, background: "#fff", borderLeft: "1px solid #e4e4e4" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #e4e4e4" }}>
            <h3 className="text-sm font-semibold">Заказ: {detailOrder.companies?.name}</h3>
            <button onClick={() => setDetailOrder(null)} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* Info */}
            <div className="space-y-1.5">
              <div className="flex justify-between"><span style={{ color: "#888" }}>Компания</span>
                {detailOrder.companies ? <Link href={`/companies/${detailOrder.companies.id}`} className="hover:underline" style={{ color: "#0067a5" }}>{detailOrder.companies.name}</Link> : "—"}
              </div>
              <div className="flex justify-between"><span style={{ color: "#888" }}>Сделка</span>
                {detailOrder.deals ? <Link href={`/deals/${detailOrder.deals.id}`} className="hover:underline" style={{ color: "#0067a5" }}>{detailOrder.deals.title}</Link> : "—"}
              </div>
              <div className="flex justify-between"><span style={{ color: "#888" }}>МОП</span><span>{detailOrder.manager?.full_name ?? "—"}</span></div>
              <div className="flex justify-between"><span style={{ color: "#888" }}>Работник</span><span>{detailOrder.worker?.full_name ?? "Не назначен"}</span></div>
              <div className="flex justify-between"><span style={{ color: "#888" }}>Этап</span><span style={{ color: STAGES.find((s) => s.key === detailOrder.stage)?.color }}>{STAGES.find((s) => s.key === detailOrder.stage)?.label}</span></div>
            </div>

            {/* Products */}
            <div>
              <h4 className="font-semibold mb-1" style={{ color: "#888" }}>Товары</h4>
              {(detailOrder.deals?.deal_products ?? []).map((dp: { quantity: number; products: { name: string; sku: string } | { name: string; sku: string }[] }, i: number) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const p = Array.isArray(dp.products) ? dp.products[0] : dp.products as any;
                return <p key={i} style={{ color: "#333" }}>{p?.name} (арт. {p?.sku}) × {dp.quantity}</p>;
              })}
            </div>

            {/* Logistics */}
            <div className="space-y-1.5">
              <h4 className="font-semibold" style={{ color: "#888" }}>Логистика</h4>
              <div className="flex justify-between"><span style={{ color: "#888" }}>Трек-номер</span><span className="font-mono" style={{ color: "#7b1fa2" }}>{detailOrder.tracking_number ?? "—"}</span></div>
              <div className="flex justify-between"><span style={{ color: "#888" }}>Отправлен</span><span>{detailOrder.shipped_at ? formatDate(detailOrder.shipped_at) : "—"}</span></div>
              <div className="flex justify-between"><span style={{ color: "#888" }}>Прибытие</span><span>{detailOrder.estimated_arrival ? formatDate(detailOrder.estimated_arrival) : "—"}</span></div>
            </div>

            {/* Notes */}
            {detailOrder.notes && (
              <div><h4 className="font-semibold mb-1" style={{ color: "#888" }}>Примечание</h4><p style={{ color: "#333" }}>{detailOrder.notes}</p></div>
            )}

            {/* Comment */}
            <div>
              <h4 className="font-semibold mb-1" style={{ color: "#888" }}>Комментарий</h4>
              <div className="flex gap-2">
                <input value={detailComment} onChange={(e) => setDetailComment(e.target.value)} placeholder="Добавить комментарий..." className="flex-1 px-2 py-1 text-xs rounded outline-none" style={{ border: "1px solid #d0d0d0" }} />
                <button onClick={addComment} disabled={!detailComment.trim()} className="px-2 py-1 rounded text-white text-xs disabled:opacity-40" style={{ background: "#0067a5" }}>→</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

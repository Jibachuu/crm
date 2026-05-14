"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Package, Truck, X, Check, Trash2 } from "lucide-react";
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

  const isWorkerOrAdmin = true; // All users can move production stages

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
    if (!promptModal) return;
    const extra: Record<string, string> = {};
    if (promptModal.type === "tracking" && promptValue.trim()) extra.tracking_number = promptValue;
    if (promptModal.type === "arrival" && promptValue.trim()) extra.estimated_arrival = promptValue;
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

              {/* Cards — backlog v6 §7.3: drag&drop restored, columns accept
                  dropped cards and trigger moveStage (which still shows the
                  tracking/arrival prompt for `shipped`/`delivered`). */}
              <div
                className="flex-1 space-y-2 p-2 rounded-b-lg overflow-y-auto"
                style={{ background: "#fafafa", minHeight: 200 }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  const orderId = e.dataTransfer.getData("text/order-id");
                  if (!orderId) return;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const o = (orders as any[]).find((x: { id: string }) => x.id === orderId);
                  if (!o || o.stage === stage.key) return;
                  moveStage(orderId, stage.key);
                }}
              >
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {stageOrders.map((order: any) => {
                  const products = (order.deals?.deal_products ?? []).filter((dp: { product_block?: string }) => dp.product_block === "order").map((dp: { quantity: number; products: { name: string } | { name: string }[] }) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const p = Array.isArray(dp.products) ? dp.products[0] : dp.products as any;
                    return `${p?.name ?? "?"} × ${dp.quantity}`;
                  }).join(", ");

                  return (
                    <div key={order.id} className="rounded-lg p-3 bg-white cursor-pointer hover:shadow-md transition-shadow"
                      style={{ border: "1px solid #e4e4e4" }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/order-id", order.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
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
                          {STAGES.filter((s) => s.key !== order.stage).map((s) => (
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
              {promptModal.type === "tracking" ? "Трек-номер (можно пропустить)" : "Ожидаемая дата прибытия (можно пропустить)"}
            </p>
            {promptModal.type === "tracking" ? (
              <input value={promptValue} onChange={(e) => setPromptValue(e.target.value)} style={inputStyle} placeholder="ABC123456789" autoFocus />
            ) : (
              <input type="date" value={promptValue} onChange={(e) => setPromptValue(e.target.value)} style={inputStyle} autoFocus />
            )}
            <div className="flex gap-2">
              <Button onClick={confirmPrompt}><Check size={13} /> Подтвердить</Button>
              <Button variant="secondary" onClick={() => { setPromptModal(null); doMove(promptModal.orderId, promptModal.stage); }}>Пропустить</Button>
              <Button variant="secondary" onClick={() => setPromptModal(null)}>Отмена</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Panel */}
      {detailOrder && (
        <DetailPanel
          order={detailOrder}
          users={users}
          userRole={userRole}
          onClose={() => setDetailOrder(null)}
          onUpdated={(updated) => {
            setOrders(orders.map((o: { id: string }) => o.id === updated.id ? { ...o, ...updated } : o));
            setDetailOrder({ ...detailOrder, ...updated });
          }}
          onDeleted={(id) => { setOrders(orders.filter((o: { id: string }) => o.id !== id)); setDetailOrder(null); }}
        />
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DetailPanel({ order, users, userRole, onClose, onUpdated, onDeleted }: { order: any; users: any[]; userRole: string; onClose: () => void; onUpdated: (u: any) => void; onDeleted: (id: string) => void }) {
  const [comments, setComments] = useState<{ id: string; action: string; comment?: string; from_stage?: string; to_stage?: string; created_at: string; user_id?: string }[]>([]);
  const [newComment, setNewComment] = useState("");
  const [trackEdit, setTrackEdit] = useState(order.tracking_number ?? "");
  const [arrivalEdit, setArrivalEdit] = useState(order.estimated_arrival ?? "");
  const [notesEdit, setNotesEdit] = useState(order.notes ?? "");

  const isAdmin = userRole === "admin" || userRole === "supervisor";
  const canEdit = true; // All authenticated users can edit production orders
  const STAGE_LABELS: Record<string, string> = { new: "Передан", in_progress: "В работе", discussion: "Обсуждение", packing: "Упаковка", shipped: "Отправлен", delivered: "Доставлен", review_requested: "Отзыв" };

  // Load comments/log
  useState(() => {
    fetch("/api/production", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_log", production_id: order.id }) })
      .then((r) => r.json()).then((d) => setComments(d.log ?? [])).catch(() => {});
  });

  async function updateField(field: string, value: string) {
    await fetch("/api/production", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id: order.id, [field]: value || null }) });
    onUpdated({ id: order.id, [field]: value || null });
  }

  async function addComment() {
    if (!newComment.trim()) return;
    await fetch("/api/production", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "comment", production_id: order.id, comment: newComment }) });
    setComments([...comments, { id: Date.now().toString(), action: "comment", comment: newComment, created_at: new Date().toISOString() }]);
    setNewComment("");
  }

  async function deleteOrder() {
    if (!confirm("Удалить заказ из производства?")) return;
    await fetch("/api/production", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: order.id }) });
    onDeleted(order.id);
  }

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "4px 8px", fontSize: 12, width: "100%", outline: "none" };

  return (
    <div className="fixed top-0 right-0 z-50 h-full flex flex-col shadow-2xl" style={{ width: 420, background: "#fff", borderLeft: "1px solid #e4e4e4" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #e4e4e4" }}>
        <h3 className="text-sm font-semibold">{order.companies?.name ?? "Заказ"}</h3>
        <div className="flex items-center gap-1">
          {canEdit && <button onClick={deleteOrder} className="p-1 rounded hover:bg-red-50" title="Удалить"><Trash2 size={14} style={{ color: "#c62828" }} /></button>}
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Info */}
        <div className="space-y-2">
          {order.companies && <div className="flex justify-between"><span style={{ color: "#888" }}>Компания</span><Link href={"/companies/" + order.companies.id} className="hover:underline" style={{ color: "#0067a5" }}>{order.companies.name}</Link></div>}
          {order.deals && <div className="flex justify-between"><span style={{ color: "#888" }}>Сделка</span><Link href={"/deals/" + order.deals.id} className="hover:underline" style={{ color: "#0067a5" }}>{order.deals.title}</Link></div>}

          <div>
            <span className="block mb-1" style={{ color: "#888" }}>МОП</span>
            <select defaultValue={order.manager_id ?? ""} onChange={(e) => updateField("manager_id", e.target.value)} style={inputStyle}>
              <option value="">Не назначен</option>
              {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <span className="block mb-1" style={{ color: "#888" }}>Работник</span>
            <select defaultValue={order.worker_id ?? ""} onChange={(e) => updateField("worker_id", e.target.value)} style={inputStyle}>
              <option value="">Не назначен</option>
              {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
        </div>

        {/* Products */}
        <div>
          <h4 className="font-semibold mb-1" style={{ color: "#888" }}>Товары</h4>
          {(order.deals?.deal_products ?? []).filter((dp: { product_block?: string }) => dp.product_block === "order").map((dp: { quantity: number; products: any }, i: number) => {
            const p = Array.isArray(dp.products) ? dp.products[0] : dp.products;
            return <p key={i} style={{ color: "#333" }}>{p?.name} (арт. {p?.sku}) × {dp.quantity}</p>;
          })}
        </div>

        {/* Logistics — editable for admin */}
        <div className="space-y-2">
          <h4 className="font-semibold" style={{ color: "#888" }}>Логистика</h4>
          <div>
            <span className="block mb-1" style={{ color: "#888" }}>Трек-номер</span>
            <input value={trackEdit} onChange={(e) => setTrackEdit(e.target.value)} onBlur={() => updateField("tracking_number", trackEdit)} style={inputStyle} placeholder="ABC123..." />
          </div>
          <div>
            <span className="block mb-1" style={{ color: "#888" }}>Дата прибытия</span>
            <input type="date" value={arrivalEdit} onChange={(e) => { setArrivalEdit(e.target.value); updateField("estimated_arrival", e.target.value); }} style={inputStyle} />
          </div>
        </div>

        {/* Notes — editable */}
        <div>
          <h4 className="font-semibold mb-1" style={{ color: "#888" }}>Примечание</h4>
          <textarea value={notesEdit} onChange={(e) => setNotesEdit(e.target.value)} onBlur={() => updateField("notes", notesEdit)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </div>

        {/* Comments log */}
        <div>
          <h4 className="font-semibold mb-2" style={{ color: "#888" }}>История и комментарии</h4>
          {comments.length === 0 && <p style={{ color: "#aaa" }}>Нет записей</p>}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="px-2 py-1.5 rounded" style={{ background: c.action === "comment" ? "#f0f7ff" : "#f5f5f5" }}>
                <p style={{ color: "#333" }}>
                  {c.action === "comment" && c.comment}
                  {c.action === "stage_change" && `Этап: ${STAGE_LABELS[c.from_stage ?? ""] ?? c.from_stage} → ${STAGE_LABELS[c.to_stage ?? ""] ?? c.to_stage}`}
                  {c.action === "created" && "Заказ создан"}
                </p>
                <p style={{ color: "#aaa", fontSize: 10 }}>{new Date(c.created_at).toLocaleString("ru-RU")}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addComment(); }}
              placeholder="Добавить комментарий..." className="flex-1 px-2 py-1.5 rounded outline-none" style={{ border: "1px solid #d0d0d0", fontSize: 12 }} />
            <button onClick={addComment} disabled={!newComment.trim()} className="px-3 py-1.5 rounded text-white disabled:opacity-40" style={{ background: "#0067a5", fontSize: 11 }}>→</button>
          </div>
        </div>
      </div>
    </div>
  );
}

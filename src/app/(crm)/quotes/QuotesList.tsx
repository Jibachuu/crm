"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Plus, Search, FileSpreadsheet, Trash2, Eye, Download, Copy, Check, Send, X, ImagePlus } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = { draft: "Черновик", sent: "Отправлено", accepted: "Принято", rejected: "Отклонено" };
const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = { draft: "default", sent: "warning", accepted: "success", rejected: "danger" };

interface QuoteItem {
  product_id: string;
  name: string;
  article: string;
  base_price: number;
  client_price: number;
  discount_pct: number;
  qty: number;
  sum: number;
  image_url: string;
  description: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function QuotesList({ initialQuotes, companies, contacts, products, users, currentUserId }: any) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Editor state
  const [form, setForm] = useState({ company_id: "", contact_id: "", deal_id: "", manager_id: currentUserId, payment_terms: "предоплата", delivery_terms: "", comment: "" });
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadProductIdRef = useRef("");

  function openCreate() {
    setEditing(null);
    setForm({ company_id: "", contact_id: "", deal_id: "", manager_id: currentUserId, payment_terms: "предоплата", delivery_terms: "", comment: "" });
    setItems([]);
    setEditorOpen(true);
  }

  async function openEdit(quoteId: string) {
    setEditing({ id: quoteId });
    const q = quotes.find((qq: { id: string }) => qq.id === quoteId);
    if (q) {
      setForm({ company_id: q.company_id ?? "", contact_id: q.contact_id ?? "", deal_id: q.deal_id ?? "", manager_id: q.manager_id ?? currentUserId, payment_terms: q.payment_terms ?? "предоплата", delivery_terms: q.delivery_terms ?? "", comment: q.comment ?? "" });
    }
    // Load items from DB
    const supabase = (await import("@/lib/supabase/client")).createClient();
    const { data: loadedItems } = await supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("sort_order");
    setItems((loadedItems ?? []).map((i: QuoteItem & { id?: string }) => ({
      product_id: i.product_id ?? "",
      name: i.name,
      article: i.article ?? "",
      base_price: i.base_price,
      client_price: i.client_price,
      discount_pct: i.discount_pct,
      qty: i.qty,
      sum: i.sum,
      image_url: i.image_url ?? "",
      description: i.description ?? "",
    })));
    setEditorOpen(true);
  }

  function addProduct(p: { id: string; name: string; sku: string; base_price: number; category?: string; subcategory?: string; description?: string; image_url?: string }) {
    // Build full name: category + subcategory + name
    const fullName = [p.category, p.subcategory, p.name].filter(Boolean).join(" / ");
    // Extract characteristics from description (lines with ":")
    const chars = (p.description ?? "").split("\n")
      .filter((l) => l.includes(":"))
      .map((l) => l.trim())
      .join("; ");

    setItems([...items, {
      product_id: p.id,
      name: fullName,
      article: p.sku,
      base_price: p.base_price,
      client_price: p.base_price,
      discount_pct: 0,
      qty: 1,
      sum: p.base_price,
      image_url: p.image_url ?? "",
      description: chars || p.description || "",
    }]);
    setProductSearch("");
  }

  function addManualItem() {
    setItems([...items, { product_id: "", name: "", article: "", base_price: 0, client_price: 0, discount_pct: 0, qty: 1, sum: 0, image_url: "", description: "" }]);
  }

  function updateItem(idx: number, field: string, val: string | number) {
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: val };
      if (field === "client_price") {
        const cp = Number(val) || 0;
        updated.discount_pct = updated.base_price > 0 ? Math.round((updated.base_price - cp) / updated.base_price * 1000) / 10 : 0;
        updated.sum = cp * updated.qty;
      } else if (field === "discount_pct") {
        const dp = Number(val) || 0;
        updated.client_price = Math.round(updated.base_price * (1 - dp / 100) * 100) / 100;
        updated.sum = updated.client_price * updated.qty;
      } else if (field === "qty") {
        updated.sum = updated.client_price * (Number(val) || 0);
      }
      return updated;
    }));
  }

  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }

  const totalAmount = items.reduce((s, i) => s + i.sum, 0);
  const avgDiscount = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.discount_pct, 0) / items.length * 10) / 10 : 0;

  async function handleSave(status = "draft") {
    setSaving(true);
    const res = await fetch("/api/quotes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: editing ? "update" : "create", id: editing?.id, ...form, status, items }),
    });
    if (res.ok) {
      const data = await res.json();
      setEditing({ id: data.id ?? editing?.id });
      alert("КП сохранено!");
    } else { const d = await res.json(); alert(d.error ?? "Ошибка"); }
    setSaving(false);
  }

  function copySummary() {
    const contact = contacts.find((c: { id: string }) => c.id === form.contact_id);
    const manager = users.find((u: { id: string }) => u.id === form.manager_id);
    const lines = [`Добрый день${contact ? ", " + contact.full_name : ""}!`, "", "Направляем наше коммерческое предложение от Artevo:", ""];
    for (const item of items) {
      lines.push(`${item.name}${item.article ? ", арт. " + item.article : ""} — ${item.qty} шт. × ${Number(item.client_price).toLocaleString("ru-RU")} ₽ = ${Number(item.sum).toLocaleString("ru-RU")} ₽`);
    }
    lines.push("", `Итого: ${totalAmount.toLocaleString("ru-RU")} ₽`);
    if (form.payment_terms) lines.push(`Условия оплаты: ${form.payment_terms}`);
    if (form.delivery_terms) lines.push(`Срок доставки: ${form.delivery_terms}`);
    lines.push("", `По всем вопросам: ${manager?.full_name ?? ""}${manager?.phone ? ", " + manager.phone : ""}`, "", "С уважением,", "Команда Artevo");
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function uploadProductImage(file: File, productId: string) {
    setUploadingImage(productId);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("product_id", productId);
    const res = await fetch("/api/products/upload-image", { method: "POST", body: fd });
    if (res.ok) {
      const { url } = await res.json();
      setItems(items.map((it) => it.product_id === productId ? { ...it, image_url: url } : it));
    }
    setUploadingImage(null);
  }

  async function deleteQuote(id: string) {
    if (!confirm("Удалить КП?")) return;
    await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    setQuotes(quotes.filter((q: { id: string }) => q.id !== id));
  }

  const filteredProducts = products.filter((p: { name: string; sku: string; category?: string; subcategory?: string; description?: string }) => {
    if (productSearch.length < 2) return false;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.subcategory?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = quotes.filter((q: any) => {
    const matchSearch = !search || q.companies?.name?.toLowerCase().includes(search.toLowerCase()) || q.contacts?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
  const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 };

  const companyContacts = form.company_id ? contacts.filter((c: { company_id: string }) => c.company_id === form.company_id) : contacts;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по компании, контакту..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        {/* filters can be added here */}
        <Button onClick={openCreate} size="sm"><Plus size={13} /> Новое КП</Button>
      </div>

      {/* List */}
      <div className="bg-white overflow-hidden" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#aaa" }}>
            <FileSpreadsheet size={36} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm">КП не найдены</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                {["№", "Компания", "Контакт", "Менеджер", "Сумма", "Дата", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold uppercase" style={{ color: "#888" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {filtered.map((q: any) => (
                <tr key={q.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono" style={{ color: "#0067a5" }}>#{q.quote_number}</td>
                  <td className="px-3 py-2">{q.companies?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "#666" }}>{q.contacts?.full_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "#666" }}>{q.users?.full_name ?? "—"}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: "#2e7d32" }}>{formatCurrency(q.total_amount)}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "#888" }}>{formatDate(q.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(q.id)} className="p-1 rounded hover:bg-blue-50" title="Открыть"><Eye size={12} style={{ color: "#0067a5" }} /></button>
                      <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/q/${q.id}`); }} className="p-1 rounded hover:bg-blue-50" title="Копировать ссылку"><Copy size={12} style={{ color: "#888" }} /></button>
                      <a href={`/q/${q.id}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-blue-50" title="Открыть публичную страницу"><Send size={12} style={{ color: "#2e7d32" }} /></a>
                      <button onClick={() => deleteQuote(q.id)} className="p-1 rounded hover:bg-red-50" title="Удалить"><Trash2 size={12} style={{ color: "#c62828" }} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Editor Modal */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? "Редактировать КП" : "Новое КП"} size="xl">
        <div className="p-5 space-y-4" style={{ maxHeight: "85vh", overflowY: "auto" }}>
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={lblStyle}>Компания</label>
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value, contact_id: "" })} style={inputStyle}>
                <option value="">Выберите...</option>
                {companies.map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Контакт</label>
              <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })} style={inputStyle}>
                <option value="">Выберите...</option>
                {companyContacts.map((c: { id: string; full_name: string }) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={lblStyle}>Менеджер</label>
              <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} style={inputStyle}>
                {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Условия оплаты</label>
              <select value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} style={inputStyle}>
                <option>предоплата</option>
                <option>постоплата</option>
                <option>50/50</option>
                <option>другое</option>
              </select>
            </div>
            <div>
              <label style={lblStyle}>Срок доставки</label>
              <input value={form.delivery_terms} onChange={(e) => setForm({ ...form, delivery_terms: e.target.value })} style={inputStyle} placeholder="3-5 рабочих дней" />
            </div>
          </div>

          {/* Product search */}
          <div>
            <label style={lblStyle}>Добавить товар из каталога</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
              <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Поиск по названию или артикулу..." className="w-full pl-8 pr-3 py-1.5 text-xs focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
            </div>
            {filteredProducts.length > 0 && (
              <div className="mt-1 rounded shadow-lg max-h-40 overflow-y-auto" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
                {filteredProducts.slice(0, 10).map((p: { id: string; name: string; sku: string; base_price: number; category?: string; subcategory?: string; description?: string; image_url?: string }) => (
                  <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between" style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <span>{[p.category, p.name].filter(Boolean).join(" / ")} <span style={{ color: "#aaa" }}>арт. {p.sku}</span></span>
                    <span style={{ color: "#2e7d32" }}>{formatCurrency(p.base_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label style={{ ...lblStyle, marginBottom: 0 }}>Позиции ({items.length})</label>
              <button onClick={addManualItem} className="text-xs px-2 py-1 rounded" style={{ color: "#0067a5", border: "1px solid #0067a5" }}>+ Вручную</button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: "#aaa" }}>Добавьте товары из каталога или вручную</p>
            ) : (
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-3 p-3 rounded" style={{ border: "1px solid #e4e4e4", background: "#fafafa" }}>
                    {/* Photo */}
                    <div className="flex-shrink-0">
                      {item.image_url ? (
                        <div className="relative group">
                          <img src={item.image_url} alt="" className="w-20 h-20 rounded object-cover" style={{ border: "1px solid #e0e0e0" }} />
                          {item.product_id && (
                            <button onClick={() => { uploadProductIdRef.current = item.product_id; fileRef.current?.click(); }}
                              className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <ImagePlus size={16} style={{ color: "#fff" }} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => { if (item.product_id) { uploadProductIdRef.current = item.product_id; fileRef.current?.click(); } }}
                          className="w-20 h-20 rounded flex flex-col items-center justify-center gap-1 transition-colors hover:bg-gray-100"
                          style={{ background: "#f0f0f0", border: "1px dashed #ccc" }}
                          disabled={!item.product_id || uploadingImage === item.product_id}>
                          {uploadingImage === item.product_id ? (
                            <span className="text-xs" style={{ color: "#888" }}>...</span>
                          ) : (
                            <>
                              <ImagePlus size={18} style={{ color: "#aaa" }} />
                              <span style={{ fontSize: 9, color: "#aaa" }}>Фото</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)}
                          className="flex-1 text-xs font-medium px-2 py-1 rounded outline-none" style={{ border: "1px solid #e0e0e0" }}
                          placeholder="Название товара" />
                        <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-red-50 flex-shrink-0"><X size={12} style={{ color: "#c62828" }} /></button>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span style={{ color: "#888" }}>Арт:</span>
                        <input value={item.article} onChange={(e) => updateItem(idx, "article", e.target.value)}
                          className="w-24 px-1 py-0.5 rounded outline-none" style={{ border: "1px solid #e0e0e0", fontSize: 11 }} />
                        {item.description && <span className="truncate" style={{ color: "#888", maxWidth: 200 }} title={item.description}>{item.description}</span>}
                      </div>

                      {/* Description editable */}
                      <textarea value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)}
                        className="w-full text-xs px-2 py-1 rounded outline-none" rows={1}
                        style={{ border: "1px solid #e0e0e0", resize: "vertical", fontSize: 11 }}
                        placeholder="Описание / характеристики товара" />

                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1">
                          <span style={{ color: "#888" }}>Каталог:</span>
                          <span style={{ color: "#aaa", textDecoration: item.discount_pct > 0 ? "line-through" : "none" }}>{formatCurrency(item.base_price)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span style={{ color: "#333" }}>Цена:</span>
                          <input type="number" value={item.client_price} onChange={(e) => updateItem(idx, "client_price", Number(e.target.value))}
                            className="w-20 px-1 py-0.5 rounded outline-none text-right font-medium" style={{ border: "1px solid #d0d0d0", color: "#2e7d32" }} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span style={{ color: "#888" }}>Скидка:</span>
                          <input type="number" value={item.discount_pct} onChange={(e) => updateItem(idx, "discount_pct", Number(e.target.value))}
                            className="w-14 px-1 py-0.5 rounded outline-none text-right" style={{ border: "1px solid #e0e0e0", color: "#e65c00" }} />
                          <span style={{ color: "#e65c00" }}>%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span style={{ color: "#888" }}>Кол-во:</span>
                          <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, "qty", Number(e.target.value))}
                            className="w-14 px-1 py-0.5 rounded outline-none text-right" style={{ border: "1px solid #e0e0e0" }} />
                        </div>
                        <div className="ml-auto font-medium" style={{ color: "#2e7d32" }}>= {formatCurrency(item.sum)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals */}
          {items.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded" style={{ background: "#f5f5f5", border: "1px solid #e4e4e4" }}>
              <div className="text-xs" style={{ color: "#888" }}>
                Средняя скидка: <strong style={{ color: "#e65c00" }}>{avgDiscount}%</strong>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: "#888" }}>Итого:</p>
                <p className="text-lg font-bold" style={{ color: "#2e7d32" }}>{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          )}

          <div>
            <label style={lblStyle}>Комментарий</label>
            <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <Button size="sm" onClick={() => handleSave("draft")} loading={saving}><FileSpreadsheet size={13} /> Сохранить</Button>
            <Button size="sm" variant="secondary" onClick={copySummary}>
              {copied ? <><Check size={13} /> Скопировано!</> : <><Copy size={13} /> Саммари</>}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => {
              const qid = editing?.id;
              if (!qid) { alert("Сначала сохраните КП"); return; }
              window.open(`/q/${qid}`, "_blank");
            }}><Eye size={13} /> Страница КП</Button>
            <Button size="sm" variant="secondary" onClick={() => {
              const qid = editing?.id;
              if (!qid) { alert("Сначала сохраните КП"); return; }
              // Open quote page in print mode for PDF
              const w = window.open(`/q/${qid}`, "_blank");
              if (w) setTimeout(() => w.print(), 2000);
            }}><Download size={13} /> Скачать PDF</Button>
            <Button size="sm" variant="secondary" onClick={() => {
              const qid = editing?.id;
              if (!qid) { alert("Сначала сохраните КП"); return; }
              navigator.clipboard.writeText(`${window.location.origin}/q/${qid}`);
              setCopied(true); setTimeout(() => setCopied(false), 2000);
            }}><Copy size={13} /> Ссылка</Button>
            <div className="flex-1" />
            <Button size="sm" variant="secondary" onClick={() => { setEditorOpen(false); window.location.reload(); }}>Закрыть</Button>
          </div>
        </div>
      </Modal>

      {/* Hidden file input for product images */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f && uploadProductIdRef.current) {
          if (confirm("Фото сохранится для всех КП с этим товаром. Продолжить?")) {
            uploadProductImage(f, uploadProductIdRef.current);
          }
        }
        e.target.value = "";
      }} />
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Search, FileCheck, Trash2, Eye, Save, Upload, X, Copy } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { formatCurrency, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import UpdTemplate from "@/components/ui/UpdTemplate";

const STATUS_LABELS: Record<string, string> = { draft: "Черновик", signed: "Подписан", sent: "Отправлен" };
const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = { draft: "default", signed: "success", sent: "warning" };

interface UpdItem { product_id: string; name: string; quantity: number; unit: string; price: number; total: number }

function SearchableCompanySelect({ companies, value, onChange, inputStyle }: { companies: { id: string; name: string }[]; value: string; onChange: (id: string) => void; inputStyle: React.CSSProperties }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = companies.find((c) => c.id === value);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const filtered = query ? companies.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30) : companies.slice(0, 30);
  return (
    <div ref={ref} className="relative">
      <input value={open ? query : (selected?.name ?? "")} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => { setOpen(true); setQuery(""); }} placeholder="Поиск компании..." style={inputStyle} />
      {value && !open && <button type="button" onClick={() => { onChange(""); setQuery(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#aaa" }}>✕</button>}
      {open && (
        <div className="absolute z-50 w-full mt-1 rounded shadow-lg max-h-48 overflow-y-auto" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
          {filtered.length === 0 && <p className="text-xs px-3 py-2" style={{ color: "#aaa" }}>Не найдено</p>}
          {filtered.map((c) => (
            <button type="button" key={c.id} onClick={() => { onChange(c.id); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50" style={{ borderBottom: "1px solid #f0f0f0", background: c.id === value ? "#e8f4fd" : "transparent" }}>{c.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function UpdClient({ initialUpd, companies, products, supplier, invoices = [] }: any) {
  const [updList, setUpdList] = useState(initialUpd);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewUpd, setPreviewUpd] = useState<any>(null);
  const [previewItems, setPreviewItems] = useState<UpdItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [form, setForm] = useState({ upd_date: new Date().toISOString().slice(0, 10), invoice_id: "", buyer_company_id: "", buyer_name: "", buyer_inn: "", buyer_kpp: "", buyer_address: "", basis: "Основной договор", vat_included: false, comment: "" });
  const [items, setItems] = useState<UpdItem[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
  const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 };

  function openCreate() {
    setEditing(null);
    setForm({ upd_date: new Date().toISOString().slice(0, 10), invoice_id: "", buyer_company_id: "", buyer_name: "", buyer_inn: "", buyer_kpp: "", buyer_address: "", basis: "Основной договор", vat_included: false, comment: "" });
    setItems([]);
    setEditorOpen(true);
  }

  async function openEdit(updId: string) {
    const u = updList.find((x: { id: string }) => x.id === updId);
    if (!u) return;
    setEditing(u);
    setForm({ upd_date: u.upd_date ?? new Date().toISOString().slice(0, 10), invoice_id: u.invoice_id ?? "", buyer_company_id: u.buyer_company_id ?? "", buyer_name: u.buyer_name ?? "", buyer_inn: u.buyer_inn ?? "", buyer_kpp: u.buyer_kpp ?? "", buyer_address: u.buyer_address ?? "", basis: u.basis ?? "Основной договор", vat_included: u.vat_included ?? false, comment: u.comment ?? "" });
    const supabase = createClient();
    const { data } = await supabase.from("upd_items").select("*").eq("upd_id", updId).order("sort_order");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setItems((data ?? []).map((i: any) => ({ product_id: i.product_id ?? "", name: i.name, quantity: i.quantity, unit: i.unit, price: i.price, total: i.total })));
    setEditorOpen(true);
  }

  // Import from invoice
  async function importFromInvoice(invoiceId: string) {
    if (!invoiceId) return;
    const supabase = createClient();
    const { data: inv } = await supabase.from("invoices").select("*, companies:buyer_company_id(id, name, inn, kpp, legal_address)").eq("id", invoiceId).single();
    if (!inv) return;
    // Fill buyer data from invoice
    setForm((prev) => ({
      ...prev,
      invoice_id: invoiceId,
      buyer_company_id: inv.buyer_company_id ?? "",
      buyer_name: inv.buyer_name ?? inv.companies?.name ?? "",
      buyer_inn: inv.buyer_inn ?? inv.companies?.inn ?? "",
      buyer_kpp: inv.buyer_kpp ?? inv.companies?.kpp ?? "",
      buyer_address: inv.buyer_address ?? inv.companies?.legal_address ?? "",
      basis: inv.basis ?? "Основной договор",
      vat_included: inv.vat_included ?? false,
    }));
    // Load invoice items
    const { data: invItems } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId);
    if (invItems?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setItems(invItems.map((i: any) => ({ product_id: i.product_id ?? "", name: i.name, quantity: i.quantity ?? 1, unit: i.unit ?? "шт", price: i.price ?? 0, total: i.total ?? 0 })));
    }
  }

  // Auto-fill buyer from company
  function selectCompany(companyId: string) {
    const c = companies.find((x: { id: string }) => x.id === companyId);
    setForm((prev) => ({
      ...prev,
      buyer_company_id: companyId,
      buyer_name: c?.name ?? prev.buyer_name,
      buyer_inn: c?.inn ?? prev.buyer_inn,
      buyer_kpp: c?.kpp ?? prev.buyer_kpp,
      buyer_address: c?.legal_address ?? prev.buyer_address,
    }));
  }

  // Upload requisites file (reuse contracts parser)
  async function uploadRequisites(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/contracts/parse-requisites", { method: "POST", body: fd });
    if (res.ok) {
      const r = await res.json();
      setForm((prev) => ({
        ...prev,
        buyer_name: r.buyer_name || prev.buyer_name,
        buyer_inn: r.buyer_inn || prev.buyer_inn,
        buyer_kpp: r.buyer_kpp || prev.buyer_kpp,
        buyer_address: r.buyer_address || prev.buyer_address,
      }));
      // Save back to company if linked
      if (form.buyer_company_id) {
        const supabase = createClient();
        const updates: Record<string, string> = {};
        if (r.buyer_kpp) updates.kpp = r.buyer_kpp;
        if (r.buyer_address) updates.legal_address = r.buyer_address;
        if (r.buyer_inn) updates.inn = r.buyer_inn;
        if (Object.keys(updates).length) await supabase.from("companies").update(updates).eq("id", form.buyer_company_id);
      }
    }
    setUploading(false);
  }

  function addProduct(p: { id: string; name: string; sku: string; base_price: number }) {
    setItems([...items, { product_id: p.id, name: p.name, quantity: 1, unit: "шт", price: p.base_price, total: p.base_price }]);
    setProductSearch("");
  }

  function addManualItem() {
    setItems([...items, { product_id: "", name: "", quantity: 1, unit: "шт", price: 0, total: 0 }]);
  }

  function updateItem(idx: number, field: string, val: string | number) {
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: val };
      if (field === "quantity" || field === "price") updated.total = (Number(updated.quantity) || 0) * (Number(updated.price) || 0);
      return updated;
    }));
  }

  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }
  function duplicateItem(idx: number) { setItems([...items.slice(0, idx + 1), { ...items[idx] }, ...items.slice(idx + 1)]); }

  const totalAmount = items.reduce((s, i) => s + i.total, 0);

  async function handleSave(status = "draft") {
    setSaving(true);
    const res = await fetch("/api/upd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: editing ? "update" : "create", id: editing?.id, ...form, status, items }),
    });
    if (res.ok) {
      alert("УПД сохранён!");
      window.location.reload();
    } else {
      const d = await res.json();
      alert(d.error ?? "Ошибка");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить УПД?")) return;
    await fetch("/api/upd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    setUpdList(updList.filter((u: { id: string }) => u.id !== id));
  }

  async function openPreview(updId: string) {
    const supabase = createClient();
    const u = updList.find((x: { id: string }) => x.id === updId);
    setPreviewUpd(u);
    const { data } = await supabase.from("upd_items").select("*").eq("upd_id", updId).order("sort_order");
    setPreviewItems(data ?? []);
  }

  const filteredProducts = products.filter((p: { name: string; sku: string }) => {
    if (productSearch.length < 2) return false;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = updList.filter((u: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.buyer_name?.toLowerCase().includes(q) || u.companies?.name?.toLowerCase().includes(q) || String(u.upd_number).includes(q);
  });

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по компании, номеру..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <Button onClick={openCreate} size="sm"><Plus size={13} /> Новый УПД</Button>
      </div>

      {/* List */}
      <div className="bg-white overflow-hidden" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#aaa" }}>
            <FileCheck size={36} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm">УПД не найдены</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                {["№", "Дата", "Покупатель", "Сумма", "Статус", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold uppercase" style={{ color: "#888" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {filtered.map((u: any) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono" style={{ color: "#0067a5" }}>УПД-{u.upd_number}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "#888" }}>{formatDate(u.upd_date)}</td>
                  <td className="px-3 py-2">{u.buyer_name || u.companies?.name || "—"}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: "#2e7d32" }}>{formatCurrency(u.total_amount)}</td>
                  <td className="px-3 py-2"><Badge variant={STATUS_VARIANTS[u.status] ?? "default"}>{STATUS_LABELS[u.status] ?? u.status}</Badge></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openPreview(u.id)} className="p-1 rounded hover:bg-blue-50" title="Просмотр"><Eye size={12} style={{ color: "#0067a5" }} /></button>
                      <button onClick={() => openEdit(u.id)} className="p-1 rounded hover:bg-blue-50" title="Редактировать"><Save size={12} style={{ color: "#888" }} /></button>
                      <button onClick={() => handleDelete(u.id)} className="p-1 rounded hover:bg-red-50" title="Удалить"><Trash2 size={12} style={{ color: "#c62828" }} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Editor Modal */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? "Редактировать УПД" : "Новый УПД"} size="xl">
        <div className="p-5 space-y-4" style={{ maxHeight: "85vh", overflowY: "auto" }}>
          {/* Import from invoice */}
          <div>
            <label style={lblStyle}>Импорт из счёта</label>
            <select onChange={(e) => { importFromInvoice(e.target.value); e.target.value = ""; }} style={inputStyle}>
              <option value="">Выберите счёт...</option>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {invoices.map((inv: any) => <option key={inv.id} value={inv.id}>Счёт #{inv.invoice_number} {inv.buyer_name ? `· ${inv.buyer_name}` : ""} · {formatCurrency(inv.total_amount)}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={lblStyle}>Дата УПД</label>
              <input type="date" value={form.upd_date} onChange={(e) => setForm({ ...form, upd_date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={lblStyle}>Основание</label>
              <input value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {/* Buyer */}
          <div className="p-3 rounded" style={{ border: "1px solid #e4e4e4", background: "#fafafa" }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ ...lblStyle, marginBottom: 0 }}>Реквизиты покупателя</span>
              <label className="flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded" style={{ color: "#0067a5", border: "1px solid #0067a5" }}>
                <Upload size={12} /> {uploading ? "Загрузка..." : "Из файла"}
                <input type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRequisites(f); e.target.value = ""; }} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={lblStyle}>Компания</label>
                <SearchableCompanySelect companies={companies} value={form.buyer_company_id} onChange={selectCompany} inputStyle={inputStyle} />
              </div>
              <div>
                <label style={lblStyle}>Наименование</label>
                <input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div><label style={lblStyle}>ИНН</label><input value={form.buyer_inn} onChange={(e) => setForm({ ...form, buyer_inn: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>КПП</label><input value={form.buyer_kpp} onChange={(e) => setForm({ ...form, buyer_kpp: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>Адрес</label><input value={form.buyer_address} onChange={(e) => setForm({ ...form, buyer_address: e.target.value })} style={inputStyle} /></div>
            </div>
          </div>

          {/* Products */}
          <div>
            <label style={lblStyle}>Добавить товар</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
              <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Поиск по названию или артикулу..." className="w-full pl-8 pr-3 py-1.5 text-xs" style={{ border: "1px solid #d0d0d0", borderRadius: 4, outline: "none" }} />
            </div>
            {filteredProducts.length > 0 && (
              <div className="mt-1 rounded shadow-lg max-h-40 overflow-y-auto" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
                {filteredProducts.slice(0, 10).map((p: { id: string; name: string; sku: string; base_price: number }) => (
                  <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex justify-between" style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <span>{p.name} <span style={{ color: "#aaa" }}>({p.sku})</span></span>
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
            {items.length > 0 && (
              <table className="w-full text-xs" style={{ border: "1px solid #e4e4e4" }}>
                <thead>
                  <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e4" }}>
                    <th className="px-2 py-1.5 text-left" style={{ color: "#888" }}>№</th>
                    <th className="px-2 py-1.5 text-left" style={{ color: "#888" }}>Наименование</th>
                    <th className="px-2 py-1.5 text-right w-16" style={{ color: "#888" }}>Кол-во</th>
                    <th className="px-2 py-1.5 text-center w-16" style={{ color: "#888" }}>Ед.</th>
                    <th className="px-2 py-1.5 text-right w-24" style={{ color: "#888" }}>Цена</th>
                    <th className="px-2 py-1.5 text-right w-24" style={{ color: "#888" }}>Сумма</th>
                    <th className="px-2 py-1.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td className="px-2 py-1.5" style={{ color: "#aaa" }}>{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} className="w-full outline-none text-xs" style={{ border: "none", background: "transparent" }} placeholder="Наименование" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="w-full text-right outline-none text-xs" style={{ border: "1px solid #e0e0e0", borderRadius: 3, padding: "2px 4px" }} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="w-full text-center outline-none text-xs" style={{ border: "1px solid #e0e0e0", borderRadius: 3, padding: "2px 4px" }} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={item.price} onChange={(e) => updateItem(idx, "price", Number(e.target.value))} className="w-full text-right outline-none text-xs" style={{ border: "1px solid #e0e0e0", borderRadius: 3, padding: "2px 4px" }} />
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium" style={{ color: "#2e7d32" }}>{formatCurrency(item.total)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          <button onClick={() => duplicateItem(idx)} className="p-0.5 hover:bg-blue-50 rounded" title="Дублировать"><Copy size={11} style={{ color: "#0067a5" }} /></button>
                          <button onClick={() => removeItem(idx)} className="p-0.5 hover:bg-red-50 rounded"><X size={11} style={{ color: "#c62828" }} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f5f5f5", borderTop: "2px solid #e4e4e4" }}>
                    <td colSpan={5} className="px-2 py-2 text-right font-semibold" style={{ color: "#888" }}>Итого:</td>
                    <td className="px-2 py-2 text-right font-bold" style={{ color: "#2e7d32" }}>{formatCurrency(totalAmount)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div>
            <label style={lblStyle}>Комментарий</label>
            <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" onClick={() => handleSave("draft")} loading={saving}><Save size={13} /> Сохранить</Button>
            <Button size="sm" variant="secondary" onClick={() => handleSave("signed")} loading={saving}>Подписан</Button>
            <div className="flex-1" />
            <Button size="sm" variant="secondary" onClick={() => setEditorOpen(false)}>Закрыть</Button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal open={!!previewUpd} onClose={() => setPreviewUpd(null)} title={`УПД-${previewUpd?.upd_number}`} size="xl">
        {previewUpd && (() => {
          return (
            <div style={{ overflow: "auto" }}>
              <div id="upd-content">
                <UpdTemplate
                  upd={{ upd_number: previewUpd.upd_number, upd_date: previewUpd.upd_date, buyer_name: previewUpd.buyer_name, buyer_inn: previewUpd.buyer_inn, buyer_kpp: previewUpd.buyer_kpp, buyer_address: previewUpd.buyer_address, basis: previewUpd.basis, vat_included: previewUpd.vat_included }}
                  items={previewItems}
                  supplier={supplier}
                />
              </div>
              <div className="flex justify-end mt-4 gap-2" id="upd-buttons">
                <Button size="sm" onClick={async () => {
                  const html2canvas = (await import("html2canvas")).default;
                  const { jsPDF } = await import("jspdf");
                  const el = document.getElementById("upd-content");
                  if (!el) return;
                  const btnBar = document.getElementById("upd-buttons");
                  if (btnBar) btnBar.style.display = "none";
                  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#fff" });
                  if (btnBar) btnBar.style.display = "";
                  const pdf = new jsPDF("l", "mm", "a4");
                  const w = pdf.internal.pageSize.getWidth();
                  const h = (canvas.height * w) / canvas.width;
                  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, w, h);
                  pdf.save(`УПД_${previewUpd.upd_number}.pdf`);
                }}>Скачать PDF</Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

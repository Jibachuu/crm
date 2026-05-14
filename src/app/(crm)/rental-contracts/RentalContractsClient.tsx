"use client";

// Backlog v6 §4.6 — Договор аренды (гибрид поставки + аренды оборудования).
// Отличается от обычного договора поставки:
//   • Две независимых таблицы позиций в одном модальном окне:
//     «Товары на покупку» → Приложение №2 Спецификация
//     «Оборудование в пользование» → Приложение №3 Акт приёма-передачи
//   • Поле «Периодичность заказов» — текст, вставляется в §5 договора
//   • Адрес установки оборудования — для акта
//   • Основание подписи покупателя — обычно «доверенности», не «Устава»

import { useState, useEffect } from "react";
import { Plus, FileText, Download, Trash2, Search, Upload, Edit2, Package, Wrench } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = { draft: "Черновик", sent: "Отправлен", signed: "Подписан", expired: "Истёк" };

type PurchaseItem = { name: string; quantity: number; price: number; total: number; product_id?: string };
type EquipmentItem = { name: string; quantity: number; valuation: number; product_id?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 };

export default function RentalContractsClient({ companyId, dealId }: { companyId?: string; dealId?: string } = {}) {
  const [contracts, setContracts] = useState<AnyRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<AnyRec[]>([]);
  const [deals, setDeals] = useState<AnyRec[]>([]);
  const [invoices, setInvoices] = useState<AnyRec[]>([]);
  const [quotes, setQuotes] = useState<AnyRec[]>([]);
  const [products, setProducts] = useState<AnyRec[]>([]);
  const [productSearchP, setProductSearchP] = useState("");
  const [productSearchE, setProductSearchE] = useState("");
  const [pdfParsing, setPdfParsing] = useState(false);
  const [editingContract, setEditingContract] = useState<AnyRec | null>(null);

  const [form, setForm] = useState<AnyRec>({
    buyer_director_title: "генерального директора",
    buyer_director_basis: "доверенности",
    purchase_items: [] as PurchaseItem[],
    equipment_items: [] as EquipmentItem[],
    purchase_frequency_terms: "",
    equipment_location_address: "",
  });

  useEffect(() => {
    loadContracts();
    const supabase = createClient();
    supabase.from("companies").select("id, name, inn, kpp, ogrn, legal_address, director, phone, email").order("name").limit(2000).then(({ data }) => setCompanies(data ?? []));
    supabase.from("deals").select("id, title").order("created_at", { ascending: false }).limit(200).then(({ data }) => setDeals(data ?? []));
    supabase.from("invoices").select("id, invoice_number, buyer_name, total_amount").order("created_at", { ascending: false }).limit(100).then(({ data }) => setInvoices(data ?? []));
    supabase.from("quotes").select("id, title, total, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(100).then(({ data }) => setQuotes(data ?? []));
    supabase.from("products").select("id, name, sku, base_price, category, subcategory").eq("is_active", true).order("name").then(({ data }) => setProducts(data ?? []));
  }, []);

  async function loadContracts() {
    setLoading(true);
    const params = new URLSearchParams({ contract_type: "rental" });
    if (companyId) params.set("company_id", companyId);
    if (dealId) params.set("deal_id", dealId);
    const res = await fetch(`/api/contracts?${params}`);
    const data = await res.json();
    setContracts(data.contracts ?? []);
    setLoading(false);
  }

  function fillFromCompany(coId: string) {
    const co = companies.find((c) => c.id === coId);
    if (co) {
      setForm((f: AnyRec) => ({
        ...f, buyer_company_id: co.id, buyer_name: co.name || "",
        buyer_inn: co.inn || "", buyer_kpp: co.kpp || "", buyer_ogrn: co.ogrn || "",
        buyer_address: co.legal_address || "", buyer_director_name: co.director || "",
        buyer_email: co.email || "", buyer_phone: co.phone || "",
      }));
    }
  }

  async function parseFile(file: File) {
    setPdfParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/contracts/parse-requisites", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Ошибка парсинга"); setPdfParsing(false); return; }
      if (data.requisites && Object.keys(data.requisites).length > 0) {
        setForm((f: AnyRec) => ({ ...f, ...data.requisites }));
        alert("Реквизиты извлечены!");
      } else { alert(`Не удалось извлечь реквизиты`); }
    } catch (e) { alert("Ошибка: " + String(e)); }
    setPdfParsing(false);
  }

  // Pull items from deal — split by kind (purchase vs rental) if the
  // deal_products row carries a hint. Backlog v6 §4.6: Жиба хочет, чтобы
  // в сделке было видно «kind = purchase | rental», но эта схема будет
  // позже. Пока берём всё в «товары на покупку», менеджер сам перетаскивает.
  async function loadDealOrderItems(dId: string) {
    const res = await fetch(`/api/deals/products?deal_id=${dId}&block=order`);
    if (!res.ok) { alert("Не удалось загрузить товары сделки"); return; }
    const { products: rows } = await res.json() as { products: AnyRec[] };
    if (!rows?.length) { alert("В заказе сделки нет товаров"); return; }
    const billable = rows.filter((r) => !r.products?.excluded_from_invoice);
    const out: PurchaseItem[] = [];
    for (const r of billable) {
      const sku = r.products?.sku || "";
      const baseName = r.products?.name || "";
      const withSku = sku && !baseName.toLowerCase().includes(sku.toLowerCase()) ? `${baseName} / арт. ${sku}` : baseName;
      const variants = Array.isArray(r.variants) ? r.variants : [];
      if (variants.length > 0) {
        for (const v of variants) {
          const qty = v.quantity || 1;
          const price = v.price || 0;
          out.push({ name: `${withSku} / ${v.label}`, quantity: qty, price, total: v.sum ?? price * qty, product_id: r.product_id || undefined });
        }
      } else {
        out.push({ name: withSku, quantity: r.quantity || 1, price: r.unit_price || 0, total: r.total_price || 0, product_id: r.product_id || undefined });
      }
    }
    setForm((f: AnyRec) => ({ ...f, purchase_items: out }));
    alert(`Подгружено ${out.length} позиций в «Товары на покупку». Если что-то надо перенести в «Оборудование в пользование» — добавьте в нижнюю таблицу вручную и удалите из верхней.`);
  }

  async function loadInvoiceItems(invoiceId: string) {
    const supabase = createClient();
    const { data } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("id");
    if (data?.length) {
      setForm((f: AnyRec) => ({
        ...f, purchase_items: data.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, total: i.total, product_id: i.product_id })) as PurchaseItem[],
      }));
    }
  }

  async function loadQuoteItems(quoteId: string) {
    const supabase = createClient();
    const { data } = await supabase.from("quote_items").select("*, products(sku, article)").eq("quote_id", quoteId).order("sort_order");
    if (!data?.length) { alert("В КП нет товаров"); return; }
    type V = { label: string; price: number; quantity: number; sum?: number };
    const out: PurchaseItem[] = [];
    for (const qi of data as AnyRec[]) {
      const sku = qi.article || qi.products?.article || qi.products?.sku || "";
      const baseName = qi.name || "";
      const withSku = sku && !baseName.toLowerCase().includes(sku.toLowerCase()) ? `${baseName} / арт. ${sku}` : baseName;
      const variants: V[] = Array.isArray(qi.variants) ? qi.variants : [];
      if (variants.length > 0) {
        for (const v of variants) {
          const qty = v.quantity || 1;
          const price = v.price || 0;
          out.push({ name: `${withSku} / ${v.label}`, quantity: qty, price, total: v.sum ?? price * qty, product_id: qi.product_id || undefined });
        }
      } else {
        out.push({ name: withSku, quantity: qi.qty ?? 1, price: qi.client_price ?? 0, total: qi.sum ?? 0, product_id: qi.product_id || undefined });
      }
    }
    setForm((f: AnyRec) => ({ ...f, purchase_items: out }));
  }

  function openEditContract(c: AnyRec) {
    setEditingContract(c);
    setForm({
      ...c,
      buyer_director_title: c.buyer_director_title || "генерального директора",
      buyer_director_basis: c.buyer_director_basis || "доверенности",
      purchase_frequency_terms: c.purchase_frequency_terms || "",
      equipment_location_address: c.equipment_location_address || "",
      purchase_items: [] as PurchaseItem[],
      equipment_items: [] as EquipmentItem[],
    });
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!form.buyer_name) { alert("Укажите покупателя"); return; }
    if (!editingContract && form.purchase_items.length === 0 && form.equipment_items.length === 0) {
      if (!confirm("Не добавлено ни товаров на покупку, ни оборудования в пользование. Создать договор без приложений?")) return;
    }
    setSaving(true);

    const payload = {
      contract_type: "rental",
      buyer_company_id: companyId || form.buyer_company_id || null,
      buyer_name: form.buyer_name, buyer_legal_form: form.buyer_legal_form,
      buyer_inn: form.buyer_inn, buyer_kpp: form.buyer_kpp, buyer_ogrn: form.buyer_ogrn,
      buyer_address: form.buyer_address, buyer_bank_name: form.buyer_bank_name,
      buyer_account: form.buyer_account, buyer_bik: form.buyer_bik,
      buyer_corr_account: form.buyer_corr_account,
      buyer_director_name: form.buyer_director_name,
      buyer_director_title: form.buyer_director_title,
      buyer_director_basis: form.buyer_director_basis,
      buyer_director_basis_full: form.buyer_director_basis_full,
      buyer_email: form.buyer_email, buyer_phone: form.buyer_phone,
      buyer_short_name: form.buyer_short_name,
      deal_id: dealId || form.deal_id || null,
      purchase_frequency_terms: form.purchase_frequency_terms || null,
      equipment_location_address: form.equipment_location_address || null,
    };

    const action = editingContract ? "update" : "create";
    const body = editingContract
      ? { action, id: editingContract.id, ...payload }
      : {
          action,
          ...payload,
          purchase_items: form.purchase_items.filter((i: PurchaseItem) => i.name.trim()),
          equipment_items: form.equipment_items.filter((i: EquipmentItem) => i.name.trim()),
        };

    const res = await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); alert(d.error); setSaving(false); return; }

    setCreateOpen(false);
    setEditingContract(null);
    setForm({ buyer_director_title: "генерального директора", buyer_director_basis: "доверенности", purchase_items: [], equipment_items: [], purchase_frequency_terms: "", equipment_location_address: "" });
    loadContracts();
    setSaving(false);
  }

  function openPdf(contractId: string, type: "contract" | "spec" | "equipment", specId?: string) {
    const params = new URLSearchParams({ id: contractId, type });
    if (specId) params.set("spec_id", specId);
    fetch(`/api/contracts/generate?${params}`).then((r) => r.json()).then((d) => {
      if (d.html) { const w = window.open("", "_blank"); if (w) { w.document.write(d.html); w.document.close(); } else alert("Браузер заблокировал окно"); }
      else alert(d.error || "Ошибка");
    });
  }

  const filtered = contracts.filter((c) => !search || c.contract_number?.includes(search.toLowerCase()) || c.buyer_name?.toLowerCase().includes(search.toLowerCase()));
  const purchaseTotal = form.purchase_items.reduce((s: number, i: PurchaseItem) => s + (i.total || 0), 0);
  const equipmentTotal = form.equipment_items.reduce((s: number, i: EquipmentItem) => s + (i.quantity * i.valuation || 0), 0);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..." className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={13} /> Новый договор аренды</Button>
      </div>

      <div className="bg-white" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {loading ? <p className="text-center py-12 text-sm" style={{ color: "#aaa" }}>Загрузка...</p>
        : filtered.length === 0 ? (
          <div className="text-center py-12"><FileText size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} /><p className="text-sm" style={{ color: "#aaa" }}>Нет договоров аренды</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
              {["№", "Покупатель", "Дата", "Спецификация", "Оборудование", "Статус", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: "#888" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map((c) => {
                const spec = c.specifications?.[0];
                const equipmentItems = c.contract_equipment_items || [];
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono font-medium" style={{ color: "#0067a5" }}>#{c.contract_number}</td>
                    <td className="px-4 py-2.5">{c.buyer_name || "—"}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#888" }}>{formatDate(c.contract_date)}</td>
                    <td className="px-4 py-2.5">
                      {spec ? (
                        <button onClick={() => openPdf(c.id, "spec", spec.id)} className="text-xs px-2 py-0.5 rounded hover:bg-blue-50" style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}>
                          <Package size={10} className="inline mr-1" /> Прил. №2 ({formatCurrency(spec.total_amount)})
                        </button>
                      ) : <span className="text-xs" style={{ color: "#aaa" }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {equipmentItems.length > 0 ? (
                        <button onClick={() => openPdf(c.id, "equipment")} className="text-xs px-2 py-0.5 rounded hover:bg-amber-50" style={{ color: "#a05a00", border: "1px solid #f0d8b5" }}>
                          <Wrench size={10} className="inline mr-1" /> Прил. №3 ({equipmentItems.length} поз.)
                        </button>
                      ) : <span className="text-xs" style={{ color: "#aaa" }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{STATUS_LABELS[c.status] || c.status}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => openEditContract(c)} className="p-1 rounded hover:bg-blue-50" title="Редактировать"><Edit2 size={13} style={{ color: "#0067a5" }} /></button>
                        <button onClick={() => openPdf(c.id, "contract")} className="p-1 rounded hover:bg-blue-50" title="Печать договора"><Download size={13} style={{ color: "#0067a5" }} /></button>
                        <button onClick={async () => { if (!confirm("Удалить?")) return; await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: c.id }) }); loadContracts(); }} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: "#c62828" }} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setEditingContract(null); }} title={editingContract ? "Редактировать договор аренды" : "Новый договор аренды"} size="xl">
        <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">

          {/* Реквизиты покупателя */}
          <div className="p-4 rounded-lg" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold" style={{ color: "#333" }}>Реквизиты покупателя</h3>
              <button onClick={() => {
                const input = document.createElement("input");
                input.type = "file"; input.accept = ".pdf,.docx,.doc,.txt";
                input.onchange = () => { if (input.files?.[0]) parseFile(input.files[0]); };
                input.click();
              }} disabled={pdfParsing}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ color: "#e65c00", border: "1px solid #e65c00" }}>
                <Upload size={12} /> {pdfParsing ? "Парсинг..." : "Загрузить PDF/DOCX"}
              </button>
            </div>

            <div className="mb-2">
              <label style={lblStyle}>Компания (из CRM)</label>
              <select value={form.buyer_company_id || companyId || ""} onChange={(e) => fillFromCompany(e.target.value)} style={inputStyle}>
                <option value="">Выберите или загрузите PDF</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div><label style={lblStyle}>Название</label><input value={form.buyer_name || ""} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>Орг. форма</label><input value={form.buyer_legal_form || ""} onChange={(e) => setForm({ ...form, buyer_legal_form: e.target.value })} style={inputStyle} placeholder="ООО / ИП / АО" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div><label style={lblStyle}>ИНН</label><input value={form.buyer_inn || ""} onChange={(e) => setForm({ ...form, buyer_inn: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>КПП</label><input value={form.buyer_kpp || ""} onChange={(e) => setForm({ ...form, buyer_kpp: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>ОГРН</label><input value={form.buyer_ogrn || ""} onChange={(e) => setForm({ ...form, buyer_ogrn: e.target.value })} style={inputStyle} /></div>
            </div>
            <div className="mt-2"><label style={lblStyle}>Адрес</label><input value={form.buyer_address || ""} onChange={(e) => setForm({ ...form, buyer_address: e.target.value })} style={inputStyle} /></div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div><label style={lblStyle}>ФИО директора</label><input value={form.buyer_director_name || ""} onChange={(e) => setForm({ ...form, buyer_director_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>Подпись (Фамилия И.О.)</label><input value={form.buyer_short_name || ""} onChange={(e) => setForm({ ...form, buyer_short_name: e.target.value })} style={inputStyle} placeholder="Иванов И.И." /></div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div><label style={lblStyle}>Банк</label><input value={form.buyer_bank_name || ""} onChange={(e) => setForm({ ...form, buyer_bank_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>Р/с</label><input value={form.buyer_account || ""} onChange={(e) => setForm({ ...form, buyer_account: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>БИК</label><input value={form.buyer_bik || ""} onChange={(e) => setForm({ ...form, buyer_bik: e.target.value })} style={inputStyle} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div><label style={lblStyle}>К/с</label><input value={form.buyer_corr_account || ""} onChange={(e) => setForm({ ...form, buyer_corr_account: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>Сделка</label>
                <select value={form.deal_id || dealId || ""} onChange={(e) => setForm({ ...form, deal_id: e.target.value })} style={inputStyle}>
                  <option value="">Не привязан</option>
                  {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div><label style={lblStyle}>E-mail</label><input value={form.buyer_email || ""} onChange={(e) => setForm({ ...form, buyer_email: e.target.value })} style={inputStyle} /></div>
              <div><label style={lblStyle}>Телефон</label><input value={form.buyer_phone || ""} onChange={(e) => setForm({ ...form, buyer_phone: e.target.value })} style={inputStyle} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label style={lblStyle}>Основание подписи</label>
                <select value={form.buyer_director_basis || "доверенности"} onChange={(e) => setForm({ ...form, buyer_director_basis: e.target.value })} style={inputStyle}>
                  <option value="доверенности">Доверенности</option>
                  <option value="Устава">Устава</option>
                </select>
              </div>
              {form.buyer_director_basis === "доверенности" && (
                <div><label style={lblStyle}>Реквизиты доверенности</label><input value={form.buyer_director_basis_full || ""} onChange={(e) => setForm({ ...form, buyer_director_basis_full: e.target.value })} style={inputStyle} placeholder="доверенности №30 от 10.12.2025" /></div>
              )}
            </div>
          </div>

          {!editingContract && (<>
          {/* Товары на покупку */}
          <div className="p-4 rounded-lg" style={{ background: "#f0f7ff", border: "1px solid #d0e8f5" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-1" style={{ color: "#0067a5" }}>
                <Package size={14} /> Товары на покупку (→ Приложение №2 Спецификация)
              </h3>
              <div className="flex gap-2 flex-wrap">
                <select onChange={(e) => { if (e.target.value) loadInvoiceItems(e.target.value); e.target.value = ""; }} className="text-xs px-2 py-1 rounded" style={{ border: "1px solid #e65c00", color: "#e65c00", maxWidth: 180 }}>
                  <option value="">Из счёта...</option>
                  {invoices.map((inv) => <option key={inv.id} value={inv.id}>#{inv.invoice_number}</option>)}
                </select>
                <select onChange={(e) => { if (e.target.value) loadDealOrderItems(e.target.value); e.target.value = ""; }} className="text-xs px-2 py-1 rounded" style={{ border: "1px solid #2e7d32", color: "#2e7d32", maxWidth: 180 }}>
                  <option value="">Из сделки...</option>
                  {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
                <select onChange={(e) => { if (e.target.value) loadQuoteItems(e.target.value); e.target.value = ""; }} className="text-xs px-2 py-1 rounded" style={{ border: "1px solid #7b1fa2", color: "#7b1fa2", maxWidth: 180 }}>
                  <option value="">Из КП...</option>
                  {quotes.map((q) => <option key={q.id} value={q.id}>{q.title || `КП ${q.id.slice(0, 6)}`}</option>)}
                </select>
                <div className="relative">
                  <input value={productSearchP} onChange={(e) => setProductSearchP(e.target.value)} placeholder="Из каталога..." className="text-xs px-2 py-1 rounded w-36" style={{ border: "1px solid #0067a5", color: "#0067a5" }} />
                  {productSearchP.length >= 2 && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded shadow-lg border max-h-40 overflow-y-auto" style={{ minWidth: 280 }}>
                      {products.filter((p) => {
                        const q = productSearchP.toLowerCase();
                        return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
                      }).slice(0, 10).map((p) => (
                        <button key={p.id} onClick={() => {
                          setForm((f: AnyRec) => ({ ...f, purchase_items: [...f.purchase_items, { name: `${p.name}${p.sku ? ` (арт. ${p.sku})` : ""}`, quantity: 1, price: p.base_price, total: p.base_price, product_id: p.id }] }));
                          setProductSearchP("");
                        }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 border-b border-gray-100">
                          {p.name} {p.sku ? `· ${p.sku}` : ""} — {p.base_price} ₽
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setForm((f: AnyRec) => ({ ...f, purchase_items: [...f.purchase_items, { name: "", quantity: 1, price: 0, total: 0 }] }))} className="text-xs px-2 py-1 rounded" style={{ color: "#0067a5", border: "1px solid #0067a5" }}>+ Вручную</button>
              </div>
            </div>

            {form.purchase_items.length === 0 && <p className="text-xs italic" style={{ color: "#888" }}>Пусто. Подгрузите из сделки / КП / счёта или добавьте вручную.</p>}
            {form.purchase_items.map((item: PurchaseItem, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-1 items-end">
                <div className="col-span-5"><input value={item.name} onChange={(e) => { const items = [...form.purchase_items]; items[i] = { ...items[i], name: e.target.value }; setForm({ ...form, purchase_items: items }); }} style={{ ...inputStyle, fontSize: 12 }} placeholder="Наименование" /></div>
                <div className="col-span-2"><input type="number" value={item.quantity} onChange={(e) => { const items = [...form.purchase_items]; const q = Number(e.target.value); items[i] = { ...items[i], quantity: q, total: q * items[i].price }; setForm({ ...form, purchase_items: items }); }} style={{ ...inputStyle, fontSize: 12 }} /></div>
                <div className="col-span-2"><input type="number" value={item.price} onChange={(e) => { const items = [...form.purchase_items]; const p = Number(e.target.value); items[i] = { ...items[i], price: p, total: items[i].quantity * p }; setForm({ ...form, purchase_items: items }); }} style={{ ...inputStyle, fontSize: 12 }} /></div>
                <div className="col-span-2 text-sm font-medium" style={{ color: "#2e7d32", paddingTop: 6 }}>{formatCurrency(item.total)}</div>
                <div className="col-span-1"><button onClick={() => setForm({ ...form, purchase_items: form.purchase_items.filter((_: PurchaseItem, idx: number) => idx !== i) })} className="text-xs text-red-500">✕</button></div>
              </div>
            ))}

            {form.purchase_items.length > 0 && (
              <div className="flex justify-end mt-2">
                <span className="text-sm font-bold" style={{ color: "#2e7d32" }}>Итого к покупке: {formatCurrency(purchaseTotal)}</span>
              </div>
            )}
          </div>

          {/* Оборудование в пользование */}
          <div className="p-4 rounded-lg" style={{ background: "#fff8f0", border: "1px solid #f0d8b5" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-1" style={{ color: "#a05a00" }}>
                <Wrench size={14} /> Оборудование в пользование (→ Приложение №3 Акт)
              </h3>
              <div className="flex gap-2">
                <div className="relative">
                  <input value={productSearchE} onChange={(e) => setProductSearchE(e.target.value)} placeholder="Из каталога..." className="text-xs px-2 py-1 rounded w-36" style={{ border: "1px solid #a05a00", color: "#a05a00" }} />
                  {productSearchE.length >= 2 && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded shadow-lg border max-h-40 overflow-y-auto" style={{ minWidth: 280 }}>
                      {products.filter((p) => {
                        const q = productSearchE.toLowerCase();
                        return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
                      }).slice(0, 10).map((p) => (
                        <button key={p.id} onClick={() => {
                          setForm((f: AnyRec) => ({ ...f, equipment_items: [...f.equipment_items, { name: `${p.name}${p.sku ? ` (арт. ${p.sku})` : ""}`, quantity: 1, valuation: p.base_price, product_id: p.id }] }));
                          setProductSearchE("");
                        }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 border-b border-gray-100">
                          {p.name} {p.sku ? `· ${p.sku}` : ""} — {p.base_price} ₽
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setForm((f: AnyRec) => ({ ...f, equipment_items: [...f.equipment_items, { name: "", quantity: 1, valuation: 0 }] }))} className="text-xs px-2 py-1 rounded" style={{ color: "#a05a00", border: "1px solid #a05a00" }}>+ Вручную</button>
              </div>
            </div>

            {form.equipment_items.length === 0 && <p className="text-xs italic" style={{ color: "#888" }}>Пусто. Сюда — то, что НЕ продаётся, а передаётся в пользование (флаконы, держатели). Указывайте оценочную стоимость — это компенсация при невозврате.</p>}
            {form.equipment_items.map((item: EquipmentItem, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-1 items-end">
                <div className="col-span-5"><input value={item.name} onChange={(e) => { const items = [...form.equipment_items]; items[i] = { ...items[i], name: e.target.value }; setForm({ ...form, equipment_items: items }); }} style={{ ...inputStyle, fontSize: 12 }} placeholder="Наименование оборудования" /></div>
                <div className="col-span-2"><input type="number" value={item.quantity} onChange={(e) => { const items = [...form.equipment_items]; items[i] = { ...items[i], quantity: Number(e.target.value) }; setForm({ ...form, equipment_items: items }); }} style={{ ...inputStyle, fontSize: 12 }} /></div>
                <div className="col-span-2"><input type="number" value={item.valuation} onChange={(e) => { const items = [...form.equipment_items]; items[i] = { ...items[i], valuation: Number(e.target.value) }; setForm({ ...form, equipment_items: items }); }} style={{ ...inputStyle, fontSize: 12 }} placeholder="Оценочная" /></div>
                <div className="col-span-2 text-sm font-medium" style={{ color: "#a05a00", paddingTop: 6 }}>{formatCurrency(item.quantity * item.valuation)}</div>
                <div className="col-span-1"><button onClick={() => setForm({ ...form, equipment_items: form.equipment_items.filter((_: EquipmentItem, idx: number) => idx !== i) })} className="text-xs text-red-500">✕</button></div>
              </div>
            ))}

            {form.equipment_items.length > 0 && (
              <div className="flex justify-end mt-2">
                <span className="text-sm font-bold" style={{ color: "#a05a00" }}>Оценочная сумма оборудования: {formatCurrency(equipmentTotal)}</span>
              </div>
            )}
          </div>
          </>)}

          {/* Условия аренды и периодичности */}
          <div className="p-4 rounded-lg" style={{ background: "#f5f0ff", border: "1px solid #d8c8f0" }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: "#6b3aa0" }}>Условия по аренде и периодичности</h3>
            <div className="space-y-3">
              <div>
                <label style={lblStyle}>Адрес установки оборудования (для Акта)</label>
                <input value={form.equipment_location_address || ""} onChange={(e) => setForm({ ...form, equipment_location_address: e.target.value })} style={inputStyle} placeholder="г. Екатеринбург, ул. Металлургов, стр. 6В, пом. 2" />
              </div>
              <div>
                <label style={lblStyle}>Периодичность заказов товаров (вставится в §5.16 договора)</label>
                <textarea value={form.purchase_frequency_terms || ""} onChange={(e) => setForm({ ...form, purchase_frequency_terms: e.target.value })} style={{ ...inputStyle, minHeight: 60, fontFamily: "inherit" }} placeholder="Например: Покупатель обязуется заказывать товар не реже одного раза в месяц на сумму не менее 10 000 рублей. При прекращении заказов более 60 дней Поставщик вправе истребовать оборудование." />
                <p className="text-xs mt-1" style={{ color: "#888" }}>Можно оставить пустым — пункт не добавится в договор.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => { setCreateOpen(false); setEditingContract(null); }}>Отмена</Button>
            <Button size="sm" onClick={handleCreate} loading={saving} disabled={!form.buyer_name}>
              <FileText size={13} /> {editingContract ? "Сохранить" : "Создать договор + Спец. + Акт"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

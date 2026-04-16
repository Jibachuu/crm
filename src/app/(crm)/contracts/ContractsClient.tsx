"use client";

import { useState, useEffect } from "react";
import { Plus, FileText, Download, Trash2, Search, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = { draft: "Черновик", sent: "Отправлен", signed: "Подписан", expired: "Истёк" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ContractsClient({ companyId, dealId }: { companyId?: string; dealId?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [companies, setCompanies] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deals, setDeals] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [invoices, setInvoices] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [pdfParsing, setPdfParsing] = useState(false);

  // Combined form: contract + spec
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<any>({
    buyer_director_title: "генерального директора",
    buyer_director_basis: "Устава",
    delivery_method: "СДЭК",
    payment_terms: "предоплата 100%",
    shipment_days: 12,
    items: [{ name: "", quantity: 1, price: 0, total: 0 }],
  });

  useEffect(() => {
    loadContracts();
    const supabase = createClient();
    supabase.from("companies").select("id, name, inn, kpp, ogrn, legal_address, director, phone, email").order("name").limit(2000).then(({ data }) => setCompanies(data ?? []));
    supabase.from("deals").select("id, title").order("created_at", { ascending: false }).limit(200).then(({ data }) => setDeals(data ?? []));
    supabase.from("invoices").select("id, invoice_number, buyer_name, total_amount").order("created_at", { ascending: false }).limit(100).then(({ data }) => setInvoices(data ?? []));
    supabase.from("products").select("id, name, sku, base_price, category, subcategory").eq("is_active", true).order("name").then(({ data }) => setProducts(data ?? []));
  }, []);

  async function loadContracts() {
    setLoading(true);
    const params = new URLSearchParams();
    if (companyId) params.set("company_id", companyId);
    if (dealId) params.set("deal_id", dealId);
    const res = await fetch(`/api/contracts?${params}`);
    const data = await res.json();
    setContracts(data.contracts ?? []);
    setLoading(false);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fillFromCompany(coId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const co = companies.find((c: any) => c.id === coId);
    if (co) {
      setForm((f: typeof form) => ({
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
        setForm((f: typeof form) => ({ ...f, ...data.requisites }));

        // Save parsed requisites back to company if linked
        if (form.buyer_company_id) {
          const r = data.requisites;
          const updates: Record<string, string> = {};
          if (r.buyer_kpp) updates.kpp = r.buyer_kpp;
          if (r.buyer_ogrn) updates.ogrn = r.buyer_ogrn;
          if (r.buyer_address) updates.legal_address = r.buyer_address;
          if (r.buyer_director_name) updates.director = r.buyer_director_name;
          if (Object.keys(updates).length > 0) {
            await createClient().from("companies").update(updates).eq("id", form.buyer_company_id);
          }
        }
        alert("Реквизиты извлечены!");
      } else {
        alert(`Не удалось извлечь реквизиты.\nИзвлечено символов: ${data.rawTextLength || 0}\nТекст: ${(data.textPreview || "").slice(0, 200)}\n\nПопробуйте DOCX или введите вручную.`);
      }
    } catch (e) {
      alert("Ошибка: " + String(e));
    }
    setPdfParsing(false);
  }

  async function loadInvoiceItems(invoiceId: string) {
    const supabase = createClient();
    const { data } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("id");
    if (data?.length) {
      setForm((f: typeof form) => ({
        ...f, invoice_id: invoiceId,
        items: data.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, total: i.total, product_id: i.product_id })),
      }));
    }
  }

  async function handleCreate() {
    if (!form.buyer_name) { alert("Укажите покупателя"); return; }
    setSaving(true);

    // 1. Create contract
    const contractRes = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        buyer_company_id: companyId || form.buyer_company_id || null,
        buyer_name: form.buyer_name, buyer_legal_form: form.buyer_legal_form,
        buyer_inn: form.buyer_inn, buyer_kpp: form.buyer_kpp, buyer_ogrn: form.buyer_ogrn,
        buyer_address: form.buyer_address, buyer_bank_name: form.buyer_bank_name,
        buyer_account: form.buyer_account, buyer_bik: form.buyer_bik,
        buyer_corr_account: form.buyer_corr_account,
        buyer_director_name: form.buyer_director_name,
        buyer_director_title: form.buyer_director_title,
        buyer_director_basis: form.buyer_director_basis,
        buyer_email: form.buyer_email, buyer_phone: form.buyer_phone,
        buyer_short_name: form.buyer_short_name,
        deal_id: dealId || form.deal_id || null,
      }),
    });
    if (!contractRes.ok) { const d = await contractRes.json(); alert(d.error); setSaving(false); return; }
    const contract = await contractRes.json();

    // 2. Create specification with items
    const validItems = form.items.filter((i: { name: string }) => i.name.trim());
    if (validItems.length > 0) {
      await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_spec",
          contract_id: contract.id,
          items: validItems,
          delivery_method: form.delivery_method,
          payment_terms: form.payment_terms,
          shipment_days: form.shipment_days,
          invoice_id: form.invoice_id || null,
        }),
      });
    }

    setCreateOpen(false);
    setForm({ buyer_director_title: "генерального директора", buyer_director_basis: "Устава", delivery_method: "СДЭК", payment_terms: "предоплата 100%", shipment_days: 12, items: [{ name: "", quantity: 1, price: 0, total: 0 }] });
    loadContracts();
    setSaving(false);
  }

  function openPdf(contractId: string, type: "contract" | "spec", specId?: string) {
    const params = new URLSearchParams({ id: contractId, type });
    if (specId) params.set("spec_id", specId);
    fetch(`/api/contracts/generate?${params}`).then((r) => r.json()).then((d) => {
      if (d.html) { const w = window.open("", "_blank"); if (w) { w.document.write(d.html); w.document.close(); } else alert("Браузер заблокировал окно"); }
      else alert(d.error || "Ошибка");
    });
  }

  const filtered = contracts.filter((c) => !search || c.contract_number?.includes(search.toLowerCase()) || c.buyer_name?.toLowerCase().includes(search.toLowerCase()));

  const totalSpecAmount = form.items.reduce((s: number, i: { total: number }) => s + (i.total || 0), 0);
  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
  const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..." className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={13} /> Новый договор + спецификация</Button>
      </div>

      {/* Table */}
      <div className="bg-white" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {loading ? <p className="text-center py-12 text-sm" style={{ color: "#aaa" }}>Загрузка...</p>
        : filtered.length === 0 ? (
          <div className="text-center py-12"><FileText size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} /><p className="text-sm" style={{ color: "#aaa" }}>Нет договоров</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
              {["№", "Покупатель", "Дата", "Статус", "Спецификации", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: "#888" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {filtered.map((c: any) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono font-medium" style={{ color: "#0067a5" }}>#{c.contract_number}</td>
                  <td className="px-4 py-2.5">{c.buyer_name || "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#888" }}>{formatDate(c.contract_date)}</td>
                  <td className="px-4 py-2.5 text-xs">{STATUS_LABELS[c.status] || c.status}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(c.specifications ?? []).map((s: any) => (
                        <button key={s.id} onClick={() => openPdf(c.id, "spec", s.id)} className="text-xs px-2 py-0.5 rounded hover:bg-blue-50" style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}>
                          Спец. №{s.spec_number} ({formatCurrency(s.total_amount)})
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => openPdf(c.id, "contract")} className="p-1 rounded hover:bg-blue-50" title="Скачать договор"><Download size={13} style={{ color: "#0067a5" }} /></button>
                      <button onClick={async () => { if (!confirm("Удалить?")) return; await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: c.id }) }); loadContracts(); }} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: "#c62828" }} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Contract + Spec Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новый договор + спецификация" size="xl">
        <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">

          {/* Section: Buyer requisites */}
          <div className="p-4 rounded-lg" style={{ background: "#f8f9fa", border: "1px solid #e0e0e0" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold" style={{ color: "#333" }}>Реквизиты покупателя</h3>
              <div className="flex gap-2">
                <button onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file"; input.accept = ".pdf,.docx,.doc,.txt";
                  input.onchange = () => { if (input.files?.[0]) parseFile(input.files[0]); };
                  input.click();
                }} disabled={pdfParsing}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ color: "#e65c00", border: "1px solid #e65c00" }}>
                  <Upload size={12} /> {pdfParsing ? "Парсинг..." : "Загрузить реквизиты (PDF/DOCX)"}
                </button>
              </div>
            </div>

            <div className="mb-2">
              <label style={lblStyle}>Компания (из CRM)</label>
              <select value={form.buyer_company_id || companyId || ""} onChange={(e) => fillFromCompany(e.target.value)} style={inputStyle}>
                <option value="">Выберите или загрузите PDF</option>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
              <div><label style={lblStyle}>Сокр. (подпись)</label><input value={form.buyer_short_name || ""} onChange={(e) => setForm({ ...form, buyer_short_name: e.target.value })} style={inputStyle} placeholder="Иванов И.И." /></div>
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
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {deals.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Specification items */}
          <div className="p-4 rounded-lg" style={{ background: "#f0f7ff", border: "1px solid #d0e8f5" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold" style={{ color: "#0067a5" }}>Спецификация (товары)</h3>
              <div className="flex gap-2">
                <select onChange={(e) => { if (e.target.value) loadInvoiceItems(e.target.value); e.target.value = ""; }}
                  className="text-xs px-2 py-1 rounded" style={{ border: "1px solid #e65c00", color: "#e65c00", maxWidth: 200 }}>
                  <option value="">Из счёта...</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {invoices.map((inv: any) => <option key={inv.id} value={inv.id}>#{inv.invoice_number} · {inv.buyer_name}</option>)}
                </select>
                <div className="relative">
                  <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Добавить товар из каталога..."
                    className="text-xs px-2 py-1 rounded w-48" style={{ border: "1px solid #0067a5", color: "#0067a5" }} />
                  {productSearch.length >= 2 && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded shadow-lg border max-h-40 overflow-y-auto" style={{ minWidth: 280 }}>
                      {products.filter((p) => {
                        const q = productSearch.toLowerCase();
                        return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.subcategory?.toLowerCase().includes(q);
                      }).slice(0, 10).map((p) => (
                        <button key={p.id} onClick={() => {
                          setForm((f: typeof form) => ({ ...f, items: [...f.items, { name: `${p.name}${p.sku ? ` (арт. ${p.sku})` : ""}`, quantity: 1, price: p.base_price, total: p.base_price, product_id: p.id }] }));
                          setProductSearch("");
                        }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 border-b border-gray-100">
                          {p.name} {p.sku ? `· ${p.sku}` : ""} — {p.base_price} ₽
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setForm((f: typeof form) => ({ ...f, items: [...f.items, { name: "", quantity: 1, price: 0, total: 0 }] }))} className="text-xs px-2 py-1 rounded" style={{ color: "#0067a5", border: "1px solid #0067a5" }}>+ Вручную</button>
              </div>
            </div>

            {form.items.map((item: { name: string; quantity: number; price: number; total: number }, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-1 items-end">
                <div className="col-span-5"><input value={item.name} onChange={(e) => { const items = [...form.items]; items[i] = { ...items[i], name: e.target.value }; setForm({ ...form, items }); }} style={{ ...inputStyle, fontSize: 12 }} placeholder="Наименование" /></div>
                <div className="col-span-2"><input type="number" value={item.quantity} onChange={(e) => { const items = [...form.items]; const q = Number(e.target.value); items[i] = { ...items[i], quantity: q, total: q * items[i].price }; setForm({ ...form, items }); }} style={{ ...inputStyle, fontSize: 12 }} /></div>
                <div className="col-span-2"><input type="number" value={item.price} onChange={(e) => { const items = [...form.items]; const p = Number(e.target.value); items[i] = { ...items[i], price: p, total: items[i].quantity * p }; setForm({ ...form, items }); }} style={{ ...inputStyle, fontSize: 12 }} /></div>
                <div className="col-span-2 text-sm font-medium" style={{ color: "#2e7d32", paddingTop: 6 }}>{formatCurrency(item.total)}</div>
                <div className="col-span-1">{form.items.length > 1 && <button onClick={() => setForm({ ...form, items: form.items.filter((_: unknown, idx: number) => idx !== i) })} className="text-xs text-red-500">✕</button>}</div>
              </div>
            ))}

            <div className="flex justify-end mt-2">
              <span className="text-sm font-bold" style={{ color: "#2e7d32" }}>Итого: {formatCurrency(totalSpecAmount)}</span>
            </div>
          </div>

          {/* Section: Delivery terms */}
          <div className="grid grid-cols-3 gap-3">
            <div><label style={lblStyle}>Доставка</label><input value={form.delivery_method || ""} onChange={(e) => setForm({ ...form, delivery_method: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Условия оплаты</label><input value={form.payment_terms || ""} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Срок отгрузки (дней)</label><input type="number" value={form.shipment_days || 3} onChange={(e) => setForm({ ...form, shipment_days: Number(e.target.value) })} style={inputStyle} /></div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button size="sm" onClick={handleCreate} loading={saving} disabled={!form.buyer_name}>
              <FileText size={13} /> Создать договор + спецификацию
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

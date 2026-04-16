"use client";

import { useState, useEffect } from "react";
import { Plus, FileText, Download, Trash2, Search, Eye } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = { draft: "Черновик", sent: "Отправлен", signed: "Подписан", expired: "Истёк" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ContractsClient({ companyId, dealId }: { companyId?: string; dealId?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [companies, setCompanies] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deals, setDeals] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [invoices, setInvoices] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<any>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [specForm, setSpecForm] = useState<any>({ items: [{ name: "", quantity: 1, price: 0, total: 0 }], delivery_method: "СДЭК", payment_terms: "предоплата 100%", shipment_days: 3 });

  useEffect(() => {
    loadContracts();
    const supabase = createClient();
    supabase.from("companies").select("id, name, inn, kpp, ogrn, legal_address, director, phone, email").order("name").limit(2000).then(({ data }) => setCompanies(data ?? []));
    supabase.from("deals").select("id, title").order("created_at", { ascending: false }).limit(200).then(({ data }) => setDeals(data ?? []));
    supabase.from("invoices").select("id, invoice_number, buyer_name, total_amount").order("created_at", { ascending: false }).limit(100).then(({ data }) => setInvoices(data ?? []));
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
        ...f,
        buyer_company_id: co.id,
        buyer_name: co.name || "",
        buyer_inn: co.inn || "",
        buyer_kpp: co.kpp || "",
        buyer_ogrn: co.ogrn || "",
        buyer_address: co.legal_address || "",
        buyer_director_name: co.director || "",
        buyer_email: co.email || "",
        buyer_phone: co.phone || "",
      }));
    }
  }

  async function handleCreate() {
    setSaving(true);
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...form, deal_id: dealId || form.deal_id || null }),
    });
    if (res.ok) { setCreateOpen(false); setForm({}); loadContracts(); }
    else { const d = await res.json(); alert(d.error || "Ошибка"); }
    setSaving(false);
  }

  async function loadInvoiceItems(invoiceId: string) {
    const supabase = createClient();
    const { data } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("id");
    if (data?.length) {
      setSpecForm((f: typeof specForm) => ({
        ...f,
        invoice_id: invoiceId,
        items: data.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, total: i.total, product_id: i.product_id })),
      }));
    }
  }

  async function handleCreateSpec(contractId: string) {
    setSaving(true);
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_spec", contract_id: contractId, ...specForm }),
    });
    if (res.ok) { setSpecOpen(null); setSpecForm({ items: [{ name: "", quantity: 1, price: 0, total: 0 }], delivery_method: "СДЭК", payment_terms: "предоплата 100%", shipment_days: 3 }); loadContracts(); }
    else { const d = await res.json(); alert(d.error || "Ошибка"); }
    setSaving(false);
  }

  function openPdf(contractId: string, type: "contract" | "spec", specId?: string) {
    const params = new URLSearchParams({ id: contractId, type });
    if (specId) params.set("spec_id", specId);
    fetch(`/api/contracts/generate?${params}`).then((r) => r.json()).then((d) => {
      if (d.html) {
        const w = window.open("", "_blank");
        if (w) { w.document.write(d.html); w.document.close(); }
        else alert("Браузер заблокировал окно");
      } else alert(d.error || "Ошибка");
    });
  }

  const filtered = contracts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.contract_number?.includes(q) || c.buyer_name?.toLowerCase().includes(q) || c.companies?.name?.toLowerCase().includes(q);
  });

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
  const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..." className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none" style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={13} /> Новый договор</Button>
      </div>

      <div className="bg-white" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {loading ? (
          <p className="text-center py-12 text-sm" style={{ color: "#aaa" }}>Загрузка...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={32} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Нет договоров</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                {["№", "Покупатель", "Дата", "Статус", "Спецификации", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: "#888" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {filtered.map((c: any) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono font-medium" style={{ color: "#0067a5" }}>#{c.contract_number}</td>
                  <td className="px-4 py-2.5">{c.buyer_name || c.companies?.name || "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#888" }}>{formatDate(c.contract_date)}</td>
                  <td className="px-4 py-2.5 text-xs">{STATUS_LABELS[c.status] || c.status}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(c.specifications ?? []).map((s: any) => (
                        <button key={s.id} onClick={() => openPdf(c.id, "spec", s.id)} className="text-xs px-2 py-0.5 rounded hover:bg-blue-50" style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}>
                          Спец. №{s.spec_number}
                        </button>
                      ))}
                      <button onClick={() => setSpecOpen(c.id)} className="text-xs px-2 py-0.5 rounded hover:bg-green-50" style={{ color: "#2e7d32", border: "1px solid #a5d6a7" }}>
                        + Спец.
                      </button>
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

      {/* Create Contract Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новый договор" size="lg">
        <div className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <div>
            <label style={lblStyle}>Компания (из CRM)</label>
            <select value={form.buyer_company_id || ""} onChange={(e) => fillFromCompany(e.target.value)} style={inputStyle}>
              <option value="">Выберите или заполните вручную</option>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>Название покупателя</label><input value={form.buyer_name || ""} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Организационная форма</label><input value={form.buyer_legal_form || ""} onChange={(e) => setForm({ ...form, buyer_legal_form: e.target.value })} style={inputStyle} placeholder='ООО / ИП / АО' /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label style={lblStyle}>ИНН</label><input value={form.buyer_inn || ""} onChange={(e) => setForm({ ...form, buyer_inn: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>КПП</label><input value={form.buyer_kpp || ""} onChange={(e) => setForm({ ...form, buyer_kpp: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>ОГРН</label><input value={form.buyer_ogrn || ""} onChange={(e) => setForm({ ...form, buyer_ogrn: e.target.value })} style={inputStyle} /></div>
          </div>
          <div><label style={lblStyle}>Адрес</label><input value={form.buyer_address || ""} onChange={(e) => setForm({ ...form, buyer_address: e.target.value })} style={inputStyle} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>ФИО директора</label><input value={form.buyer_director_name || ""} onChange={(e) => setForm({ ...form, buyer_director_name: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Сокращённо (для подписи)</label><input value={form.buyer_short_name || ""} onChange={(e) => setForm({ ...form, buyer_short_name: e.target.value })} style={inputStyle} placeholder="Иванов И.И." /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>Должность директора</label><input value={form.buyer_director_title || "генерального директора"} onChange={(e) => setForm({ ...form, buyer_director_title: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Основание</label><input value={form.buyer_director_basis || "Устава"} onChange={(e) => setForm({ ...form, buyer_director_basis: e.target.value })} style={inputStyle} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label style={lblStyle}>Банк</label><input value={form.buyer_bank_name || ""} onChange={(e) => setForm({ ...form, buyer_bank_name: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Р/с</label><input value={form.buyer_account || ""} onChange={(e) => setForm({ ...form, buyer_account: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>БИК</label><input value={form.buyer_bik || ""} onChange={(e) => setForm({ ...form, buyer_bik: e.target.value })} style={inputStyle} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>К/с</label><input value={form.buyer_corr_account || ""} onChange={(e) => setForm({ ...form, buyer_corr_account: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Привязать к сделке</label>
              <select value={form.deal_id || dealId || ""} onChange={(e) => setForm({ ...form, deal_id: e.target.value })} style={inputStyle}>
                <option value="">Не привязан</option>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {deals.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button size="sm" onClick={handleCreate} loading={saving} disabled={!form.buyer_name}><FileText size={13} /> Создать договор</Button>
          </div>
        </div>
      </Modal>

      {/* Create Specification Modal */}
      <Modal open={!!specOpen} onClose={() => setSpecOpen(null)} title="Новая спецификация" size="lg">
        <div className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <div>
            <label style={lblStyle}>Загрузить товары из счёта</label>
            <select onChange={(e) => { if (e.target.value) loadInvoiceItems(e.target.value); }} style={inputStyle}>
              <option value="">Выберите счёт...</option>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {invoices.map((inv: any) => <option key={inv.id} value={inv.id}>Счёт #{inv.invoice_number} · {inv.buyer_name}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label style={{ ...lblStyle, marginBottom: 0 }}>Товары</label>
              <button onClick={() => setSpecForm((f: typeof specForm) => ({ ...f, items: [...f.items, { name: "", quantity: 1, price: 0, total: 0 }] }))} className="text-xs px-2 py-1 rounded" style={{ color: "#0067a5", border: "1px solid #0067a5" }}>+ Строка</button>
            </div>
            {specForm.items.map((item: { name: string; quantity: number; price: number; total: number }, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-1 items-end">
                <div className="col-span-5"><input value={item.name} onChange={(e) => { const items = [...specForm.items]; items[i] = { ...items[i], name: e.target.value }; setSpecForm({ ...specForm, items }); }} style={{ ...inputStyle, fontSize: 12 }} placeholder="Наименование" /></div>
                <div className="col-span-2"><input type="number" value={item.quantity} onChange={(e) => { const items = [...specForm.items]; const q = Number(e.target.value); items[i] = { ...items[i], quantity: q, total: q * items[i].price }; setSpecForm({ ...specForm, items }); }} style={{ ...inputStyle, fontSize: 12 }} /></div>
                <div className="col-span-2"><input type="number" value={item.price} onChange={(e) => { const items = [...specForm.items]; const p = Number(e.target.value); items[i] = { ...items[i], price: p, total: items[i].quantity * p }; setSpecForm({ ...specForm, items }); }} style={{ ...inputStyle, fontSize: 12 }} /></div>
                <div className="col-span-2 text-sm font-medium" style={{ color: "#2e7d32", paddingTop: 6 }}>{item.total.toLocaleString("ru-RU")} ₽</div>
                <div className="col-span-1">{specForm.items.length > 1 && <button onClick={() => { const items = specForm.items.filter((_: unknown, idx: number) => idx !== i); setSpecForm({ ...specForm, items }); }} className="text-xs text-red-500">✕</button>}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><label style={lblStyle}>Доставка</label><input value={specForm.delivery_method} onChange={(e) => setSpecForm({ ...specForm, delivery_method: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Условия оплаты</label><input value={specForm.payment_terms} onChange={(e) => setSpecForm({ ...specForm, payment_terms: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Срок отгрузки (дней)</label><input type="number" value={specForm.shipment_days} onChange={(e) => setSpecForm({ ...specForm, shipment_days: Number(e.target.value) })} style={inputStyle} /></div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setSpecOpen(null)}>Отмена</Button>
            <Button size="sm" onClick={() => specOpen && handleCreateSpec(specOpen)} loading={saving}><FileText size={13} /> Создать спецификацию</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

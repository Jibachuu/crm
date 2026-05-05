"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Search, Receipt, FileDown, Eye, Trash2, Edit2, Save } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { formatCurrency, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { amountToWords } from "@/lib/numToWords";
import { formatLiters } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = { issued: "Выставлен", paid: "Оплачен", overdue: "Просрочен" };
const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = { issued: "warning", paid: "success", overdue: "danger" };

interface PriceTier { from_qty: number; to_qty: number | null; price: number }
interface InvoiceItem { product_id: string; name: string; quantity: number; unit: string; price: number; total: number; price_tiers?: PriceTier[] }

function SearchableCompanySelect({ companies, value, onChange, inputStyle, placeholder = "Поиск компании..." }: { companies: { id: string; name: string }[]; value: string; onChange: (id: string) => void; inputStyle: React.CSSProperties; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = companies.find((c: { id: string }) => c.id === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = query
    ? companies.filter((c: { name: string }) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30)
    : companies.slice(0, 30);

  return (
    <div ref={ref} className="relative">
      <input
        value={open ? query : (selected?.name ?? "")}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(""); }}
        placeholder={placeholder}
        style={inputStyle}
      />
      {value && !open && (
        <button type="button" onClick={() => { onChange(""); setQuery(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#aaa" }}>✕</button>
      )}
      {open && (
        <div className="absolute z-50 w-full mt-1 rounded shadow-lg max-h-48 overflow-y-auto" style={{ border: "1px solid #e4e4e4", background: "#fff" }}>
          {filtered.length === 0 && <p className="text-xs px-3 py-2" style={{ color: "#aaa" }}>Не найдено</p>}
          {filtered.map((c: { id: string; name: string }) => (
            <button type="button" key={c.id} onClick={() => { onChange(c.id); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50" style={{ borderBottom: "1px solid #f0f0f0", background: c.id === value ? "#e8f4fd" : "transparent" }}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function InvoicesClient({ initialInvoices, companies, products, deals, supplier, quotes = [] }: any) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewInvoice, setPreviewInvoice] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Pre-generate QR code when preview invoice changes
  useEffect(() => {
    if (!previewInvoice || !supplier) { setQrDataUrl(""); return; }
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const total = previewItems.reduce((s: number, i: { total: number }) => s + i.total, 0);
        const qrParts = [
          "ST00012",
          `Name=${supplier?.company_name ?? ""}`,
          `PersonalAcc=${supplier?.account_number ?? ""}`,
          `BankName=${supplier?.bank_name ?? ""}`,
          `BIC=${supplier?.bik ?? ""}`,
          `CorrespAcc=${supplier?.corr_account ?? ""}`,
          `PayeeINN=${supplier?.inn ?? ""}`,
          supplier?.kpp ? `KPP=${supplier.kpp}` : "",
          `Sum=${Math.round(total * 100)}`,
          `Purpose=Оплата по счёту №${previewInvoice.invoice_number} от ${new Date(previewInvoice.invoice_date).toLocaleDateString("ru-RU")}`,
        ].filter(Boolean);
        const url = await QRCode.toDataURL(qrParts.join("|"), { width: 200, margin: 1 });
        if (!cancelled) setQrDataUrl(url);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [previewInvoice, previewItems, supplier]);

  // Create form state
  const [form, setForm] = useState({
    invoice_date: new Date().toISOString().slice(0, 10),
    payment_due: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    buyer_company_id: "", buyer_name: "", buyer_inn: "", buyer_kpp: "", buyer_address: "",
    basis: "Основной договор", deal_id: "", comment: "", vat_included: false,
  });
  const [items, setItems] = useState<InvoiceItem[]>([{ product_id: "", name: "", quantity: 1, unit: "шт", price: 0, total: 0 }]);

  async function importFromQuote(quoteId: string) {
    if (!quoteId) return;
    const supabase = createClient();
    const { data: qItems } = await supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("sort_order");
    if (!qItems?.length) { alert("В КП нет товаров"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = quotes.find((qq: any) => qq.id === quoteId);
    if (q?.company_id) selectBuyer(q.company_id);
    setItems(qItems.map((qi: { product_id?: string; name: string; qty: number; client_price: number; sum: number }) => ({
      product_id: qi.product_id || "",
      name: qi.name,
      quantity: qi.qty ?? 1,
      unit: "шт",
      price: qi.client_price ?? 0,
      total: qi.sum ?? 0,
    })));
  }

  // Pull "Заказ"-block products straight from the linked deal into the
  // invoice (request 2026-05-05). Variants get flattened — one invoice
  // line per variant — so the printed счёт matches what's в сделке.
  // Loaded via admin API: direct supabase select hit RLS and returned
  // [] from manager browsers even when the deal had order rows.
  async function importFromDealOrder() {
    const dealId = form.deal_id;
    if (!dealId) { alert("Сначала привяжите счёт к сделке"); return; }
    const res = await fetch(`/api/deals/products?deal_id=${dealId}&block=order`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert("Не удалось загрузить товары: " + (d.error || res.status));
      return;
    }
    const { products: rows } = await res.json() as { products: unknown[] };
    if (!rows?.length) { alert("В сделке нет товаров в блоке «Заказ»"); return; }

    type V = { label: string; price: number; quantity: number; sum?: number };
    type Row = {
      product_id: string | null;
      name: string | null;
      quantity: number;
      unit_price: number;
      total_price: number;
      variants: V[] | null;
      products?: { name?: string; category?: string; subcategory?: string; liters?: string; container?: string } | null;
    };

    const newItems: InvoiceItem[] = [];
    for (const r of rows as Row[]) {
      const p = r.products ?? {};
      const litersPart = p.liters ? formatLiters(p.liters) : "";
      const baseName = [p.category, p.subcategory, litersPart, p.container, p.name ?? r.name].filter(Boolean).join(" / ");

      const vs = Array.isArray(r.variants) ? r.variants : [];
      if (vs.length > 0) {
        for (const v of vs) {
          newItems.push({
            product_id: r.product_id ?? "",
            name: v.label ? `${baseName} / ${v.label}` : baseName,
            quantity: v.quantity || 1,
            unit: "шт",
            price: v.price ?? 0,
            total: v.sum ?? (v.price ?? 0) * (v.quantity || 1),
          });
        }
      } else {
        newItems.push({
          product_id: r.product_id ?? "",
          name: baseName,
          quantity: r.quantity || 1,
          unit: "шт",
          price: r.unit_price ?? 0,
          total: r.total_price ?? (r.unit_price ?? 0) * (r.quantity || 1),
        });
      }
    }
    setItems(newItems);
  }

  function selectBuyer(companyId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = companies.find((co: any) => co.id === companyId);
    setForm({ ...form, buyer_company_id: companyId, buyer_name: c?.name ?? "", buyer_inn: c?.inn ?? "", buyer_kpp: c?.kpp ?? "", buyer_address: c?.legal_address ?? "" });
  }

  function addItem() { setItems([...items, { product_id: "", name: "", quantity: 1, unit: "шт", price: 0, total: 0 }]); }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)); }

  // Бутылочный товар → даёт раскладку 5 стандартных вариантов как в КП.
  // Replaces the source row with 5 typed rows so the printed invoice
  // shows the full ladder (Без УФ / С УФ / С УФ + лого / С наклейкой /
  // С наклейкой + лого) — managers were entering only the "default"
  // variant by hand.
  function isBottleItem(item: InvoiceItem): boolean {
    if (!item.product_id) return /флакон/i.test(item.name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = products.find((pr: any) => pr.id === item.product_id);
    if (!p) return /флакон/i.test(item.name);
    return /флакон/i.test(`${p.category ?? ""} ${p.subcategory ?? ""} ${p.name ?? ""}`);
  }

  function expandBottleVariants(idx: number) {
    const src = items[idx];
    if (!src.name) return;
    const bp = src.price || 0;
    // Same 5-variant pricing model used by /quotes (commit-line 322 in
    // QuotesList.tsx). Pricing logic kept in sync intentionally so the
    // КП and the invoice match without a manager re-typing.
    const variants: { suffix: string; price: number }[] = [
      { suffix: "Без УФ печати",                  price: bp },
      { suffix: "С УФ печатью",                   price: bp + 500 },
      { suffix: "С УФ печатью и логотипом Havenberg",      price: Math.round((bp + 500) * 0.6) },
      { suffix: "С наклейкой",                    price: bp + 100 },
      { suffix: "С наклейкой и логотипом Havenberg",       price: Math.round((bp + 100) * 0.6) },
    ];
    // Strip an existing variant suffix if user already chose one.
    // Strip any trailing OR mid-string variant suffix so re-clicking
    // doesn't pile labels on top of each other (e.g. catalog name still
    // says "Без УФ печати"). \b doesn't work on Cyrillic in JS so we
    // anchor on whitespace/slash explicitly.
    const baseName = src.name
      .replace(/\s*[\/\-]\s*(Без\s*УФ\s*печати|С\s*УФ\s*печатью(\s+и\s+(?:нашим\s+лого|логотипом\s+Havenberg))?|С\s*наклейкой(\s+и\s+(?:нашим\s+лого|логотипом\s+Havenberg))?)/gi, "")
      .replace(/\s*[\/\-]\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    const newRows: InvoiceItem[] = variants.map((v) => ({
      product_id: src.product_id,
      name: `${baseName} / ${v.suffix}`,
      quantity: src.quantity || 1,
      unit: src.unit || "шт",
      price: v.price,
      total: (src.quantity || 1) * v.price,
    }));
    setItems([...items.slice(0, idx), ...newRows, ...items.slice(idx + 1)]);
  }
  // Same field order as КП builder so invoice item names stay consistent
  // with what the client saw in the КП. Косметика обычно имеет
  // category/subcategory + объём (liters) + тара (container) + аромат
  // (kind или flavor) — все три части критичны для покупателя.
  function buildProductName(p: {
    name: string; sku?: string; category?: string; subcategory?: string;
    liters?: string; container?: string; kind?: string; flavor?: string;
    volume_ml?: number; description?: string;
  }) {
    const litersPart = p.liters ? formatLiters(p.liters) : (p.volume_ml ? `${p.volume_ml}мл` : "");
    const aroma = p.kind || p.flavor || "";
    const parts: (string | undefined)[] = [
      p.category,
      p.subcategory,
      litersPart,
      p.container,
      aroma,
      p.name,
    ];
    return parts.filter(Boolean).join(" / ") + (p.sku ? ` / арт. ${p.sku}` : "");
  }

  function updateItem(i: number, field: string, val: string | number) {
    setItems(items.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: val };
      if (field === "product_id") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = products.find((pr: any) => pr.id === val);
        if (p) { updated.name = buildProductName(p); updated.price = p.base_price; }
      }
      updated.total = updated.quantity * updated.price;
      return updated;
    }));
  }

  const totalAmount = items.reduce((s, i) => s + i.total, 0);

  async function handleCreate() {
    // Backlog v5 §4.3.1: enforce полные реквизиты at create time. ИНН
    // length distinguishes юрлицо (10) from ИП (12) — КПП is required
    // for the former, irrelevant for the latter.
    const innLen = (form.buyer_inn || "").replace(/\D/g, "").length;
    const isLegalEntity = innLen === 10;
    const missing: string[] = [];
    if (!form.buyer_name?.trim()) missing.push("Наименование покупателя");
    if (innLen !== 10 && innLen !== 12) missing.push("ИНН (10 или 12 цифр)");
    if (isLegalEntity && !form.buyer_kpp?.trim()) missing.push("КПП");
    if (!form.buyer_address?.trim()) missing.push("Юридический адрес");
    if (items.length === 0) missing.push("Хотя бы одна позиция");
    if (missing.length > 0) {
      alert("Заполните обязательные поля:\n• " + missing.join("\n• "));
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Get next invoice number
    const { data: maxInv } = await supabase.from("invoices").select("invoice_number").order("invoice_number", { ascending: false }).limit(1);
    const nextNum = ((maxInv?.[0]?.invoice_number ?? 0) as number) + 1;

    const { data: invoice, error } = await supabase.from("invoices").insert({
      invoice_number: nextNum,
      invoice_date: form.invoice_date,
      payment_due: form.payment_due,
      buyer_company_id: form.buyer_company_id || null,
      buyer_name: form.buyer_name,
      buyer_inn: form.buyer_inn || null,
      buyer_kpp: form.buyer_kpp || null,
      buyer_address: form.buyer_address || null,
      basis: form.basis,
      deal_id: form.deal_id || null,
      comment: form.comment || null,
      vat_included: form.vat_included,
      hide_total: (form as { hide_total?: boolean }).hide_total ?? false,
      total_amount: totalAmount,
      created_by: user?.id,
    }).select("*").single();

    if (error || !invoice) { alert(error?.message ?? "Ошибка"); setSaving(false); return; }

    // Save buyer requisites back to company via API (RLS blocks managers
    // from updating companies directly; admin endpoint is the only path).
    if (form.buyer_company_id && (form.buyer_kpp || form.buyer_address)) {
      const updates: Record<string, string> = {};
      if (form.buyer_kpp) updates.kpp = form.buyer_kpp;
      if (form.buyer_address) updates.legal_address = form.buyer_address;
      if (form.buyer_inn) updates.inn = form.buyer_inn;
      await fetch("/api/companies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.buyer_company_id, ...updates }),
      }).catch(() => {});
    }

    // Insert items
    await supabase.from("invoice_items").insert(
      items.filter((i) => i.name).map((i) => ({
        invoice_id: invoice.id,
        product_id: i.product_id || null,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        price: i.price,
        total: i.total,
        price_tiers: i.price_tiers?.length ? i.price_tiers : null,
      }))
    );

    setSaving(false);
    setCreateOpen(false);
    window.location.reload();
  }

  async function openPreview(inv: { id: string }) {
    setPreviewInvoice(inv);
    setPreviewItems([]);
    const supabase = createClient();
    const { data: loadedItems } = await supabase.from("invoice_items").select("*").eq("invoice_id", inv.id);
    setPreviewItems(loadedItems ?? []);
  }

  async function updateStatus(id: string, status: string) {
    const supabase = createClient();
    await supabase.from("invoices").update({ status }).eq("id", id);
    setInvoices(invoices.map((inv: { id: string }) => inv.id === id ? { ...inv, status } : inv));
  }

  async function deleteInvoice(id: string) {
    if (!confirm("Удалить счёт?")) return;
    const supabase = createClient();
    await supabase.from("invoices").delete().eq("id", id);
    setInvoices(invoices.filter((inv: { id: string }) => inv.id !== id));
  }

  function startEditInvoice() {
    setEditingInvoice(true);
    setEditItems(previewItems.map((i: InvoiceItem) => ({ ...i })));
  }

  function updateEditItem(i: number, field: string, val: string | number) {
    setEditItems(editItems.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: val };
      // Same auto-fill behaviour as the create form: picking a product
      // populates the full name (category / volume / aroma / SKU) and
      // the base price, so the manager doesn't retype either.
      if (field === "product_id") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = products.find((pr: any) => pr.id === val);
        if (p) { updated.name = buildProductName(p); updated.price = p.base_price; }
      }
      updated.total = updated.quantity * updated.price;
      return updated;
    }));
  }

  // Same bottle-variant ladder as the create form, but operating on
  // editItems so existing invoices can be expanded without re-creating.
  function expandEditBottleVariants(idx: number) {
    const src = editItems[idx];
    if (!src.name) return;
    const bp = src.price || 0;
    const variants: { suffix: string; price: number }[] = [
      { suffix: "Без УФ печати",                  price: bp },
      { suffix: "С УФ печатью",                   price: bp + 500 },
      { suffix: "С УФ печатью и логотипом Havenberg",      price: Math.round((bp + 500) * 0.6) },
      { suffix: "С наклейкой",                    price: bp + 100 },
      { suffix: "С наклейкой и логотипом Havenberg",       price: Math.round((bp + 100) * 0.6) },
    ];
    // Strip any trailing OR mid-string variant suffix so re-clicking
    // doesn't pile labels on top of each other (e.g. catalog name still
    // says "Без УФ печати"). \b doesn't work on Cyrillic in JS so we
    // anchor on whitespace/slash explicitly.
    const baseName = src.name
      .replace(/\s*[\/\-]\s*(Без\s*УФ\s*печати|С\s*УФ\s*печатью(\s+и\s+(?:нашим\s+лого|логотипом\s+Havenberg))?|С\s*наклейкой(\s+и\s+(?:нашим\s+лого|логотипом\s+Havenberg))?)/gi, "")
      .replace(/\s*[\/\-]\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    const newRows: InvoiceItem[] = variants.map((v) => ({
      product_id: src.product_id,
      name: `${baseName} / ${v.suffix}`,
      quantity: src.quantity || 1,
      unit: src.unit || "шт",
      price: v.price,
      total: (src.quantity || 1) * v.price,
    }));
    setEditItems([...editItems.slice(0, idx), ...newRows, ...editItems.slice(idx + 1)]);
  }

  async function saveEditInvoice() {
    if (!previewInvoice) return;
    setSaving(true);
    const supabase = createClient();
    const newTotal = editItems.reduce((s, i) => s + i.total, 0);

    // Update invoice total
    await supabase.from("invoices").update({ total_amount: newTotal }).eq("id", previewInvoice.id);

    // Delete old items and insert new
    await supabase.from("invoice_items").delete().eq("invoice_id", previewInvoice.id);
    await supabase.from("invoice_items").insert(
      editItems.filter((i) => i.name).map((i) => ({
        invoice_id: previewInvoice.id,
        product_id: i.product_id || null,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        price: i.price,
        total: i.total,
      }))
    );

    setPreviewItems(editItems);
    setPreviewInvoice({ ...previewInvoice, total_amount: newTotal });
    setInvoices(invoices.map((inv: { id: string }) => inv.id === previewInvoice.id ? { ...inv, total_amount: newTotal } : inv));
    setEditingInvoice(false);
    setSaving(false);
  }

  function proxyUrl(url: string) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }

  function printInvoice() {
    if (!previewInvoice) return;

    const stampSrc = supplier?.stamp_url ? proxyUrl(supplier.stamp_url) : "";
    const sigSrc = supplier?.signature_url ? proxyUrl(supplier.signature_url) : "";

    const printWindow = window.open("", "_blank");
    if (!printWindow) { alert("Браузер заблокировал окно"); return; }
    const inv = previewInvoice;
    const total = previewItems.reduce((s: number, i: { total: number }) => s + i.total, 0);
    const fmt = (n: number) => Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    const d = new Date(inv.invoice_date);
    const dateStr = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
    const dueDateStr = inv.payment_due ? new Date(inv.payment_due).toLocaleDateString("ru-RU") : "";

    // Find buyer company details
    const buyerCompany = companies.find((c: { id: string }) => c.id === inv.buyer_company_id);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Счёт №${inv.invoice_number}</title>
<style>
body{font-family:Arial,sans-serif;font-size:11px;margin:20mm 15mm;color:#000;line-height:1.4}
table{border-collapse:collapse}
.bank-header{width:100%;margin-bottom:0}
.bank-header td{border:1px solid #000;padding:4px 6px;font-size:10px;vertical-align:top}
.bank-header .label{font-size:9px;color:#555}
.title{font-size:16px;font-weight:bold;margin:20px 0 15px;padding-bottom:8px;border-bottom:2px solid #000}
.details{margin-bottom:15px;font-size:11px}
.details td{padding:2px 0;border:none;vertical-align:top}
.details .lbl{font-weight:bold;padding-right:10px;white-space:nowrap;width:120px}
.items{width:100%;margin:10px 0}
.items td,.items th{border:1px solid #000;padding:4px 6px}
.items th{font-weight:bold;text-align:center;font-size:10px}
.items .r{text-align:right}
.items .c{text-align:center}
.totals{width:100%;margin:0}
.totals td{border:none;padding:2px 6px;font-size:11px}
.totals .r{text-align:right}
.totals .bold{font-weight:bold}
.sum-words{font-weight:bold;font-size:11px;margin:5px 0}
.fine-print{font-size:9px;color:#333;margin:15px 0;line-height:1.5}
.sign-block{margin-top:25px;position:relative}
.sign-line{display:inline-block;width:200px;border-bottom:1px solid #000;margin:0 10px}
.stamp{position:absolute;left:0;bottom:-10px;width:140px;height:140px;opacity:0.8}
.signature{position:absolute;left:160px;bottom:10px;width:100px;opacity:0.8}
@media print{body{margin:10mm 15mm}@page{size:A4;margin:10mm 15mm 10mm 15mm}
  /* Hide browser header/footer (about:blank, page numbers, date) */
  @top-left{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-right{content:none}
}
</style></head><body>

<!-- Bank header with QR -->
<div style="display:flex;align-items:flex-start;gap:12px">
<table class="bank-header" style="flex:1">
<tr>
<td rowspan="2" style="width:55%">
${supplier?.bank_name ?? ""}<br><span class="label">Банк получателя</span>
</td>
<td style="width:10%"><span class="label">БИК</span></td>
<td style="width:35%">${supplier?.bik ?? ""}</td>
</tr>
<tr>
<td><span class="label">Сч. №</span></td>
<td>${supplier?.corr_account ?? ""}</td>
</tr>
<tr>
<td>
<span class="label">ИНН</span>&nbsp;&nbsp;${supplier?.inn ?? ""}&nbsp;&nbsp;&nbsp;&nbsp;<span class="label">КПП</span>&nbsp;&nbsp;${supplier?.kpp ?? ""}
<br>${supplier?.company_name ?? ""}<br><span class="label">Получатель</span>
</td>
<td><span class="label">Сч. №</span></td>
<td>${supplier?.account_number ?? ""}</td>
</tr>
</table>
${qrDataUrl ? `<div style="text-align:center;flex-shrink:0">
<img src="${qrDataUrl}" style="width:120px;height:120px" />
<p style="font-size:8px;color:#555;margin-top:2px">Отсканируйте для<br>оплаты</p>
</div>` : ""}
</div>

<div class="title">Счет на оплату № ${inv.invoice_number} от ${dateStr}</div>

<table class="details">
<tr><td class="lbl">Поставщик<br>(Исполнитель):</td><td>${supplier?.company_name ?? ""}, ИНН ${supplier?.inn ?? ""}${supplier?.kpp ? ", " + supplier.kpp : ""}${supplier?.address ? ", " + supplier.address : ""}</td></tr>
<tr><td class="lbl">Покупатель<br>(Заказчик):</td><td>${inv.buyer_name}${inv.buyer_inn ? ", ИНН " + inv.buyer_inn : ""}${(inv.buyer_kpp || buyerCompany?.kpp) ? ", КПП " + (inv.buyer_kpp || buyerCompany?.kpp) : ""}${(inv.buyer_address || buyerCompany?.legal_address) ? ", " + (inv.buyer_address || buyerCompany?.legal_address) : ""}</td></tr>
<tr><td class="lbl">Основание:</td><td>${inv.basis}</td></tr>
</table>

<table class="items">
<thead>
<tr><th style="width:30px">№</th><th>Товары (работы, услуги)</th><th style="width:50px">Кол-во</th><th style="width:35px">Ед.</th><th style="width:80px" class="r">Цена</th><th style="width:90px" class="r">Сумма</th></tr>
</thead>
<tbody>
${previewItems.map((item: { name: string; quantity: number; unit: string; price: number; total: number }, i: number) =>
  `<tr><td class="c">${i + 1}</td><td>${item.name}</td><td class="c">${item.quantity}</td><td class="c">${item.unit}</td><td class="r">${fmt(item.price)}</td><td class="r">${fmt(item.total)}</td></tr>`
).join("")}
</tbody>
</table>

<table class="totals">
<tr><td colspan="4"></td><td class="r bold" style="width:100px">Итого:</td><td class="r bold" style="width:100px">${fmt(total)}</td></tr>
<tr><td colspan="4"></td><td class="r">${inv.vat_included ? "В том числе НДС (20%):" : "Без налога (НДС)"}</td><td class="r">${inv.vat_included ? fmt(total * 0.2 / 1.2) : "-"}</td></tr>
<tr><td colspan="4"></td><td class="r bold">Всего к оплате:</td><td class="r bold">${fmt(total)}</td></tr>
</table>

<p style="margin-top:10px">Всего наименований ${previewItems.length}, на сумму ${fmt(total)} руб.</p>
<p class="sum-words">${amountToWords(total)}</p>

${dueDateStr ? `<p style="margin-top:10px">Оплатить не позднее ${dueDateStr}</p>` : ""}

<div class="fine-print">
Оплата данного счета означает согласие с условиями поставки товара.<br>
Уведомление об оплате обязательно, в противном случае не гарантируется наличие товара на складе.<br>
Товар отпускается по факту прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и паспорта.
</div>

<div class="sign-block">
${stampSrc ? `<img class="stamp" src="${stampSrc}" />` : ""}
${sigSrc ? `<img class="signature" src="${sigSrc}" />` : ""}
<p><strong>Предприниматель</strong> <span class="sign-line"></span> / ${supplier?.director ?? ""} /</p>
</div>

<script>
document.title='Счёт ${inv.invoice_number}';
function doPrint(){
  var btn=document.getElementById('printBtn');if(btn)btn.style.display='none';
  var imgs=document.images,loaded=0,total=imgs.length;
  if(!total){window.print();if(btn)btn.style.display='';return}
  function check(){loaded++;if(loaded>=total)setTimeout(function(){window.print();if(btn)btn.style.display=''},200)}
  for(var i=0;i<total;i++){if(imgs[i].complete)check();else{imgs[i].onload=check;imgs[i].onerror=check}}
}
</script>
<div style="text-align:center;margin:15px 0" id="printBtn">
<button onclick="doPrint()" style="padding:10px 30px;font-size:14px;background:#0067a5;color:#fff;border:none;border-radius:6px;cursor:pointer">
Напечатать / Сохранить PDF
</button>
<p style="font-size:11px;color:#888;margin-top:6px">Нажмите кнопку выше, затем выберите «Сохранить как PDF» в диалоге печати</p>
</div>
</body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  const inputStyle: React.CSSProperties = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
  const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = invoices.filter((inv: any) =>
    !search ||
    String(inv.invoice_number).includes(search) ||
    inv.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
    inv.companies?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по номеру, покупателю..."
            className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ border: "1px solid #d0d0d0", borderRadius: 4 }} />
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm"><Plus size={13} /> Новый счёт</Button>
      </div>

      <div className="flex gap-4 mb-3 text-xs" style={{ color: "#888" }}>
        <span>Счетов: <strong style={{ color: "#333" }}>{filtered.length}</strong></span>
      </div>

      <div className="bg-white overflow-hidden" style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}>
        {filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#aaa" }}>
            <Receipt size={36} className="mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm">Счетов нет</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                {["№", "Покупатель", "Сумма", "Дата", "Оплатить до", "Статус", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold uppercase" style={{ color: "#888" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {filtered.map((inv: any) => (
                <tr key={inv.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono font-medium" style={{ color: "#0067a5" }}>#{inv.invoice_number}</td>
                  <td className="px-4 py-2" style={{ color: "#333" }}>{inv.buyer_name || inv.companies?.name || "—"}</td>
                  <td className="px-4 py-2 font-medium" style={{ color: "#2e7d32" }}>{formatCurrency(inv.total_amount)}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: "#888" }}>{formatDate(inv.invoice_date)}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: "#888" }}>{inv.payment_due ? formatDate(inv.payment_due) : "—"}</td>
                  <td className="px-4 py-2">
                    <select value={inv.status} onChange={(e) => updateStatus(inv.id, e.target.value)}
                      className="text-xs px-1.5 py-0.5 rounded outline-none" style={{ border: "1px solid #e0e0e0" }}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openPreview(inv)} className="p-1 rounded hover:bg-blue-50" title="Просмотр"><Eye size={13} style={{ color: "#0067a5" }} /></button>
                      <button onClick={() => deleteInvoice(inv.id)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: "#c62828" }} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Invoice Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новый счёт" size="lg">
        <div className="p-5 space-y-3" style={{ maxHeight: "80vh", overflowY: "auto" }}>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>Дата счёта</label><input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Оплатить до</label><input type="date" value={form.payment_due} onChange={(e) => setForm({ ...form, payment_due: e.target.value })} style={inputStyle} /></div>
          </div>
          <div>
            <label style={lblStyle}>Покупатель (из CRM)</label>
            <SearchableCompanySelect
              companies={companies}
              value={form.buyer_company_id}
              onChange={selectBuyer}
              inputStyle={inputStyle}
              placeholder="Поиск компании..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>Полное наименование покупателя <span style={{ color: "#c62828" }}>*</span></label><input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} style={inputStyle} placeholder="ООО «Ярмарка Групп» / ИП Иванов И.И." /></div>
            <div>
              <label style={lblStyle}>ИНН покупателя <span style={{ color: "#c62828" }}>*</span> <span style={{ color: "#888", fontWeight: 400 }}>(Tab → автозаполнение из ЕГРЮЛ)</span></label>
              <input value={form.buyer_inn}
                onChange={(e) => setForm({ ...form, buyer_inn: e.target.value })}
                onBlur={async (e) => {
                  const inn = e.target.value.replace(/\D/g, "");
                  if (inn.length !== 10 && inn.length !== 12) return;
                  try {
                    const res = await fetch("/api/dadata/company", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ inn }),
                    });
                    if (!res.ok) return;
                    const d = await res.json();
                    setForm((prev) => ({
                      ...prev,
                      buyer_name: prev.buyer_name || d.name || "",
                      buyer_kpp: prev.buyer_kpp || d.kpp || "",
                      buyer_address: prev.buyer_address || d.address || "",
                    }));
                  } catch { /* network — silently fall back to manual entry */ }
                }}
                placeholder="10 или 12 цифр" style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>КПП покупателя <span style={{ color: "#888", fontWeight: 400 }}>(для ООО)</span></label><input value={form.buyer_kpp} onChange={(e) => setForm({ ...form, buyer_kpp: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Юридический адрес покупателя <span style={{ color: "#c62828" }}>*</span></label><input value={form.buyer_address} onChange={(e) => setForm({ ...form, buyer_address: e.target.value })} style={inputStyle} placeholder="Только юр. адрес — без склада / ТК / пометок" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={lblStyle}>Основание</label><input value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })} style={inputStyle} /></div>
            <div><label style={lblStyle}>Привязать к сделке</label>
              {/* Native <select> with hundreds of deals isn't searchable
                  and forced operators to scroll alphabetically. */}
              <SearchableSelect
                value={form.deal_id}
                onChange={(id) => setForm({ ...form, deal_id: id })}
                options={deals.map((d: { id: string; title: string }) => ({ id: d.id, label: d.title }))}
                placeholder="Поиск сделки по названию..."
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label style={{ ...lblStyle, marginBottom: 0 }}>Товары</label>
              <div className="flex items-center gap-2">
                {/* Import "Заказ" rows from the linked deal — only useful
                    when a deal is actually attached to this invoice. */}
                {form.deal_id && (
                  <button type="button" onClick={() => {
                    if (items.length > 0 && !confirm("Заменить текущие позиции на товары из заказа сделки?")) return;
                    importFromDealOrder();
                  }} className="text-xs px-2 py-1 rounded" style={{ color: "#2e7d32", border: "1px solid #c8e6c9", background: "#f0f9f0" }}>
                    Из заказа сделки
                  </button>
                )}
                {quotes.length > 0 && (
                  /* "Из КП..." — same problem as the deal picker, made
                      searchable. value="" so it acts as an action-picker:
                      selecting a КП calls importFromQuote and resets. */
                  <div style={{ minWidth: 240 }}>
                    <SearchableSelect
                      value=""
                      onChange={(id) => { if (id) importFromQuote(id); }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      options={(quotes as any[]).map((q) => ({
                        id: q.id,
                        label: `КП #${q.quote_number}`,
                        sublabel: q.companies?.name ?? "",
                      }))}
                      placeholder="Импорт из КП..."
                      style={{ border: "1px solid #e65c00", borderRadius: 4, padding: "4px 8px", fontSize: 12, width: "100%", outline: "none", color: "#e65c00" }}
                    />
                  </div>
                )}
                <button onClick={addItem} className="text-xs px-2 py-1 rounded" style={{ color: "#0067a5", border: "1px solid #0067a5" }}>+ Строка</button>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="rounded p-2" style={{ border: "1px solid #f0f0f0" }}>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <SearchableSelect
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        options={products.map((p: any) => ({
                          id: p.id,
                          // Same naming convention as the invoice line itself,
                          // so the user sees the full breakdown
                          // (объём + тара + аромат) before picking.
                          label: buildProductName(p),
                          sublabel: p.sku ? `арт. ${p.sku}` : undefined,
                        }))}
                        value={item.product_id}
                        onChange={(id) => updateItem(i, "product_id", id)}
                        placeholder="Поиск товара по названию, объёму, аромату или артикулу..."
                        style={{ ...inputStyle, fontSize: 12 }}
                      />
                      {!item.product_id && <input value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Или введите название" style={{ ...inputStyle, fontSize: 11, marginTop: 2 }} />}
                    </div>
                    <div className="col-span-2"><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(i, "quantity", Number(e.target.value))} style={{ ...inputStyle, fontSize: 12 }} placeholder="Кол-во" /></div>
                    <div className="col-span-1"><input value={item.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} style={{ ...inputStyle, fontSize: 12 }} /></div>
                    <div className="col-span-2"><input type="number" min="0" step="0.01" value={item.price} onChange={(e) => updateItem(i, "price", Number(e.target.value))} style={{ ...inputStyle, fontSize: 12 }} placeholder="Цена" /></div>
                    <div className="col-span-2 text-sm font-medium" style={{ color: "#2e7d32", paddingTop: 6 }}>{formatCurrency(item.total)}</div>
                    <div className="col-span-1 flex items-center gap-1">
                      {isBottleItem(item) && (
                        <button
                          type="button"
                          onClick={() => expandBottleVariants(i)}
                          className="text-xs px-1.5 py-0.5 rounded hover:bg-blue-50 whitespace-nowrap"
                          style={{ color: "#0067a5", border: "1px solid #b3e0f5" }}
                          title="Развернуть в 5 вариантов: Без УФ / С УФ / С УФ+лого / С наклейкой / С наклейкой+лого (как в КП)"
                        >
                          Вариации
                        </button>
                      )}
                      {items.length > 1 && <button onClick={() => removeItem(i)} className="text-xs text-red-500 hover:underline">✕</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded" style={{ background: "#f5f5f5", border: "1px solid #e4e4e4" }}>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.vat_included} onChange={(e) => setForm({ ...form, vat_included: e.target.checked })} style={{ accentColor: "#0067a5" }} />
              Включая НДС 20%
            </label>
            <div className="text-right">
              <p className="text-xs" style={{ color: "#888" }}>Итого:</p>
              <p className="text-lg font-bold" style={{ color: "#2e7d32" }}>{formatCurrency(totalAmount)}</p>
            </div>
          </div>

          <div><label style={lblStyle}>Комментарий</label><textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button size="sm" onClick={handleCreate} loading={saving} disabled={!form.buyer_name || items.every((i) => !i.name)}>
              <Receipt size={13} /> Создать счёт
            </Button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal open={!!previewInvoice} onClose={() => setPreviewInvoice(null)} title={previewInvoice ? `Счёт №${previewInvoice.invoice_number}` : ""} size="lg">
        {previewInvoice && (
          <div className="p-5">
            <div className="text-xs space-y-1 mb-4" style={{ color: "#666" }}>
              <p><strong>Поставщик:</strong> {supplier?.company_name}, ИНН {supplier?.inn}</p>
              <p><strong>Покупатель:</strong> {previewInvoice.buyer_name}{previewInvoice.buyer_inn ? `, ИНН ${previewInvoice.buyer_inn}` : ""}</p>
              <p><strong>Основание:</strong> {previewInvoice.basis}</p>
              <p><strong>Дата:</strong> {formatDate(previewInvoice.invoice_date)} &nbsp; <strong>Оплатить до:</strong> {previewInvoice.payment_due ? formatDate(previewInvoice.payment_due) : "—"}</p>
            </div>
            {!editingInvoice ? (
              <>
                <table className="w-full text-xs mb-4" style={{ border: "1px solid #e4e4e4" }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      <th className="px-2 py-1.5 text-left" style={{ borderBottom: "1px solid #e4e4e4" }}>№</th>
                      <th className="px-2 py-1.5 text-left" style={{ borderBottom: "1px solid #e4e4e4" }}>Наименование</th>
                      <th className="px-2 py-1.5 text-right" style={{ borderBottom: "1px solid #e4e4e4" }}>Кол-во</th>
                      <th className="px-2 py-1.5 text-right" style={{ borderBottom: "1px solid #e4e4e4" }}>Цена</th>
                      <th className="px-2 py-1.5 text-right" style={{ borderBottom: "1px solid #e4e4e4" }}>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((item: { name: string; quantity: number; unit: string; price: number; total: number }, i: number) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td className="px-2 py-1.5">{i + 1}</td>
                        <td className="px-2 py-1.5">{item.name}</td>
                        <td className="px-2 py-1.5 text-right">{item.quantity} {item.unit}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(item.price)}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-sm mb-2">
                  <p><strong>Итого: {formatCurrency(previewInvoice.total_amount)}</strong></p>
                  <p className="text-xs italic" style={{ color: "#666" }}>{amountToWords(previewInvoice.total_amount)}</p>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" onClick={printInvoice}><FileDown size={13} /> Скачать PDF</Button>
                  <Button size="sm" variant="secondary" onClick={startEditInvoice}><Edit2 size={13} /> Редактировать</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setPreviewInvoice(null); setEditingInvoice(false); }}>Закрыть</Button>
                </div>
              </>
            ) : (
              <>
                <table className="w-full text-xs mb-4" style={{ border: "1px solid #e4e4e4" }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      <th className="px-2 py-1.5 text-left" style={{ borderBottom: "1px solid #e4e4e4" }}>№</th>
                      <th className="px-2 py-1.5 text-left" style={{ borderBottom: "1px solid #e4e4e4" }}>Наименование</th>
                      <th className="px-2 py-1.5 text-right" style={{ borderBottom: "1px solid #e4e4e4" }}>Кол-во</th>
                      <th className="px-2 py-1.5 text-right" style={{ borderBottom: "1px solid #e4e4e4" }}>Цена</th>
                      <th className="px-2 py-1.5 text-right" style={{ borderBottom: "1px solid #e4e4e4" }}>Сумма</th>
                      <th style={{ borderBottom: "1px solid #e4e4e4", width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map((item, i) => {
                      const isBottle = /флакон/i.test(item.name);
                      return (
                      <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td className="px-2 py-1.5 align-top">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          {/* Searchable product picker (same as create form),
                              fed by the same products list. Free-text input
                              kept below for one-off / non-catalog lines. */}
                          <SearchableSelect
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            options={products.map((p: any) => ({
                              id: p.id,
                              label: buildProductName(p),
                              sublabel: p.sku ? `арт. ${p.sku}` : undefined,
                            }))}
                            value={item.product_id}
                            onChange={(id) => updateEditItem(i, "product_id", id)}
                            placeholder="Сменить из каталога…"
                            style={{ border: "1px solid #d0d0d0", borderRadius: 4, padding: "3px 6px", fontSize: 11, width: "100%", outline: "none" }}
                          />
                          <input
                            value={item.name}
                            onChange={(e) => updateEditItem(i, "name", e.target.value)}
                            className="w-full text-xs px-1 py-0.5 rounded focus:outline-none mt-1"
                            style={{ border: "1px solid #e4e4e4" }}
                            placeholder="Или введите название вручную"
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top"><input type="number" value={item.quantity} onChange={(e) => updateEditItem(i, "quantity", Number(e.target.value))} className="w-16 text-xs px-1 py-0.5 rounded text-right focus:outline-none" style={{ border: "1px solid #d0d0d0" }} /></td>
                        <td className="px-2 py-1.5 align-top"><input type="number" value={item.price} onChange={(e) => updateEditItem(i, "price", Number(e.target.value))} className="w-20 text-xs px-1 py-0.5 rounded text-right focus:outline-none" style={{ border: "1px solid #d0d0d0" }} /></td>
                        <td className="px-2 py-1.5 text-right font-medium align-top">{formatCurrency(item.total)}</td>
                        <td className="align-top">
                          <div className="flex items-center gap-1 justify-end">
                            {isBottle && (
                              <button
                                type="button"
                                onClick={() => expandEditBottleVariants(i)}
                                className="text-xs px-1.5 py-0.5 rounded hover:bg-blue-50 whitespace-nowrap"
                                style={{ color: "#0067a5", border: "1px solid #b3e0f5" }}
                                title="Развернуть в 5 вариантов как в КП"
                              >
                                Вариации
                              </button>
                            )}
                            <button onClick={() => setEditItems(editItems.filter((_, idx) => idx !== i))} className="p-0.5 hover:bg-red-50 rounded"><Trash2 size={11} className="text-red-400" /></button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button onClick={() => setEditItems([...editItems, { product_id: "", name: "", quantity: 1, unit: "шт", price: 0, total: 0 }])} className="text-xs mb-3" style={{ color: "#0067a5" }}>+ Добавить строку</button>
                <div className="text-sm mb-2">
                  <p><strong>Итого: {formatCurrency(editItems.reduce((s, i) => s + i.total, 0))}</strong></p>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" onClick={saveEditInvoice} loading={saving}><Save size={13} /> Сохранить</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingInvoice(false)}>Отмена</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

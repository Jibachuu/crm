"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, FileSpreadsheet, Trash2, Eye, Download, Copy, Check, Send, X, ImagePlus } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { formatCurrency, formatDate, formatLiters } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = { draft: "Черновик", sent: "Отправлено", accepted: "Принято", rejected: "Отклонено" };
const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = { draft: "default", sent: "warning", accepted: "success", rejected: "danger" };

interface PriceTier { from_qty: number; to_qty: number | null; price: number; discount_pct?: number }
type BottleVariant = "none" | "uv" | "uv_logo" | "sticker" | "sticker_logo";
const BOTTLE_VARIANTS: { value: BottleVariant; label: string }[] = [
  { value: "none", label: "Без УФ печати" },
  { value: "uv", label: "С УФ печатью (+500₽)" },
  { value: "uv_logo", label: "С УФ печатью и нашим лого" },
  { value: "sticker", label: "С наклейкой (+100₽)" },
  { value: "sticker_logo", label: "С наклейкой и нашим лого" },
];
function calcBottlePrice(basePrice: number, variant: BottleVariant): number {
  switch (variant) {
    case "uv": return basePrice + 500;
    case "uv_logo": return Math.round((basePrice + 500) * 0.6);
    case "sticker": return basePrice + 100;
    case "sticker_logo": return basePrice;
    default: return basePrice;
  }
}
interface ItemVariant { label: string; price: number; quantity: number; sum: number; image_url: string }
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
  price_tiers?: PriceTier[];
  bottle_variant?: BottleVariant;
  column_index?: number;
  variants?: ItemVariant[];
}

function SearchableSelect({ options, value, onChange, inputStyle, placeholder = "Поиск..." }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void; inputStyle: React.CSSProperties; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())).slice(0, 30)
    : options.slice(0, 30);

  return (
    <div ref={ref} className="relative">
      <input
        value={open ? query : (selected?.label ?? "")}
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
          {filtered.map((o) => (
            <button type="button" key={o.id} onClick={() => { onChange(o.id); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50" style={{ borderBottom: "1px solid #f0f0f0", background: o.id === value ? "#e8f4fd" : "transparent" }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function QuotesList({ initialQuotes, companies, contacts, products, users, currentUserId, invoices = [], categoryTiers = [] }: any) {
  // Build category -> tiers lookup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tiersByCategory = new Map<string, { tiers: { from_qty: number; discount_pct: number }[]; unit: string }>(
    categoryTiers.map((ct: any) => [ct.category, { tiers: ct.tiers || [], unit: ct.unit || "шт" }])
  );
  // Fuzzy match: product category "Брендированные флаконы" should match tier "Флаконы"
  function findCategoryTiers(productCategory: string) {
    if (!productCategory) return undefined;
    const exact = tiersByCategory.get(productCategory);
    if (exact) return exact;
    const lower = productCategory.toLowerCase();
    for (const [key, value] of tiersByCategory) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return value;
    }
    return undefined;
  }
  const [quotes, setQuotes] = useState(initialQuotes);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Editor state
  const [form, setForm] = useState<{ company_id: string; contact_id: string; deal_id: string; manager_id: string; payment_terms: string; delivery_terms: string; comment: string; hide_total?: boolean; category_overrides?: Record<string, { title: string; description: string }>; column_titles?: Record<string, string> }>({ company_id: "", contact_id: "", deal_id: "", manager_id: currentUserId, payment_terms: "предоплата", delivery_terms: "", comment: "" });
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);

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
      setForm({ company_id: q.company_id ?? "", contact_id: q.contact_id ?? "", deal_id: q.deal_id ?? "", manager_id: q.manager_id ?? currentUserId, payment_terms: q.payment_terms ?? "предоплата", delivery_terms: q.delivery_terms ?? "", comment: q.comment ?? "", hide_total: q.hide_total ?? false, category_overrides: q.category_overrides ?? {}, column_titles: q.column_titles ?? {} });
    }
    // Load items from DB
    const supabase = (await import("@/lib/supabase/client")).createClient();
    const { data: loadedItems } = await supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("sort_order");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setItems((loadedItems ?? []).map((i: any) => ({
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
      price_tiers: i.price_tiers ?? undefined,
      bottle_variant: i.bottle_variant ?? undefined,
      column_index: i.column_index ?? 0,
      variants: i.variants ?? undefined,
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

    // Auto-generate price tiers from category defaults
    let priceTiers: PriceTier[] | undefined;
    if (p.category) {
      const catTier = findCategoryTiers(p.category ?? "");
      if (catTier?.tiers?.length) {
        priceTiers = catTier.tiers.map((t: { from_qty: number; discount_pct: number }, i: number, arr: { from_qty: number; discount_pct: number }[]) => ({
          from_qty: t.from_qty,
          to_qty: i < arr.length - 1 ? arr[i + 1].from_qty - 1 : null,
          price: Math.round(p.base_price * (1 - t.discount_pct / 100)),
          discount_pct: t.discount_pct,
        }));
        // Prepend base price tier (1 to first discount qty - 1)
        if (priceTiers.length > 0 && priceTiers[0].from_qty > 1) {
          priceTiers.unshift({ from_qty: 1, to_qty: priceTiers[0].from_qty - 1, price: p.base_price, discount_pct: 0 });
        }
      }
    }

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
      price_tiers: priceTiers,
    }]);
    setProductSearch("");
  }

  function addManualItem() {
    setItems([...items, { product_id: "", name: "", article: "", base_price: 0, client_price: 0, discount_pct: 0, qty: 1, sum: 0, image_url: "", description: "" }]);
  }

  async function importFromInvoice(invoiceId: string) {
    if (!invoiceId) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: invItems } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId);
    if (!invItems?.length) { alert("В счёте нет товаров"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = invoices.find((i: any) => i.id === invoiceId);
    if (inv?.buyer_company_id) setForm((prev) => ({ ...prev, company_id: inv.buyer_company_id }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productMap = new Map(products.map((p: any) => [p.id, p]));
    const newItems: QuoteItem[] = invItems.map((ii: { product_id?: string; name: string; quantity: number; price: number; total: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prod = ii.product_id ? productMap.get(ii.product_id) as any : null;
      return {
        product_id: ii.product_id || "",
        name: ii.name,
        article: prod?.sku || "",
        base_price: prod?.base_price ?? ii.price,
        client_price: ii.price,
        discount_pct: prod?.base_price ? Math.round((prod.base_price - ii.price) / prod.base_price * 1000) / 10 : 0,
        qty: ii.quantity ?? 1,
        sum: ii.total ?? 0,
        image_url: prod?.image_url || "",
        description: prod?.description || "",
      };
    });
    setItems((prev) => [...prev, ...newItems]);
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
      } else if (field === "base_price") {
        const bp = Number(val) || 0;
        // Recalculate discount % from new base price and existing client price
        updated.discount_pct = bp > 0 ? Math.round((bp - updated.client_price) / bp * 1000) / 10 : 0;
        // Recalculate price tiers based on new base price
        if (updated.price_tiers?.length) {
          updated.price_tiers = updated.price_tiers.map((t: PriceTier & { discount_pct?: number }) => {
            const pct = t.discount_pct ?? (item.base_price > 0 ? Math.round((item.base_price - t.price) / item.base_price * 1000) / 10 : 0);
            return { ...t, discount_pct: pct, price: Math.round(bp * (1 - pct / 100)) };
          });
        }
      }
      return updated;
    }));
  }

  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }
  function duplicateItem(idx: number) { setItems([...items.slice(0, idx + 1), { ...items[idx] }, ...items.slice(idx + 1)]); }

  // Add all 5 bottle variants to an item (pre-filled with standard pricing)
  function addBottleVariants(idx: number) {
    const item = items[idx];
    const bp = item.base_price || item.client_price || 0;
    const variants: ItemVariant[] = [
      { label: "Без УФ печати", price: bp, quantity: 1, sum: bp, image_url: item.image_url || "" },
      { label: "С УФ печатью", price: bp + 500, quantity: 1, sum: bp + 500, image_url: "" },
      { label: "С УФ печатью и нашим лого", price: Math.round((bp + 500) * 0.6), quantity: 1, sum: Math.round((bp + 500) * 0.6), image_url: "" },
      { label: "С наклейкой", price: bp + 100, quantity: 1, sum: bp + 100, image_url: "" },
      { label: "С наклейкой и нашим лого", price: bp, quantity: 1, sum: bp, image_url: "" },
    ];
    setItems(items.map((it, i) => i === idx ? { ...it, variants } : it));
  }

  function removeAllVariants(idx: number) {
    setItems(items.map((it, i) => i === idx ? { ...it, variants: undefined } : it));
  }

  function addCustomVariant(idx: number) {
    const item = items[idx];
    const newVariant: ItemVariant = { label: "Новый вариант", price: 0, quantity: 1, sum: 0, image_url: "" };
    const variants = [...(item.variants ?? []), newVariant];
    setItems(items.map((it, i) => i === idx ? { ...it, variants } : it));
  }

  function updateVariant(itemIdx: number, varIdx: number, field: keyof ItemVariant, val: string | number) {
    setItems(items.map((it, i) => {
      if (i !== itemIdx) return it;
      const variants = [...(it.variants ?? [])];
      const v = { ...variants[varIdx], [field]: val };
      if (field === "price" || field === "quantity") {
        v.sum = (Number(v.price) || 0) * (Number(v.quantity) || 0);
      }
      variants[varIdx] = v;
      return { ...it, variants };
    }));
  }

  function removeVariant(itemIdx: number, varIdx: number) {
    setItems(items.map((it, i) => {
      if (i !== itemIdx) return it;
      const variants = (it.variants ?? []).filter((_, vi) => vi !== varIdx);
      return { ...it, variants: variants.length ? variants : undefined };
    }));
  }

  async function uploadVariantImage(file: File, itemIdx: number, varIdx: number) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("product_id", `quote-manual-${Date.now()}`);
    const res = await fetch("/api/products/upload-image", { method: "POST", body: fd });
    if (res.ok) {
      const { url } = await res.json();
      updateVariant(itemIdx, varIdx, "image_url", url);
    }
  }

  function itemTotalSum(item: QuoteItem): number {
    if (item.variants?.length) return item.variants.reduce((s, v) => s + (v.sum || v.price * v.quantity || 0), 0);
    return item.sum;
  }
  const totalAmount = items.reduce((s, i) => s + itemTotalSum(i), 0);
  const avgDiscount = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.discount_pct, 0) / items.length * 10) / 10 : 0;

  // Column management
  const columnTitles = form.column_titles ?? {};
  const columnCount = Math.max(1, ...items.map((i) => (i.column_index ?? 0) + 1));
  const columnTotals = Array.from({ length: columnCount }, (_, ci) =>
    items.filter((i) => (i.column_index ?? 0) === ci).reduce((s, i) => s + itemTotalSum(i), 0)
  );

  function addColumn() {
    const newIdx = columnCount;
    setForm({ ...form, column_titles: { ...columnTitles, [String(newIdx)]: `Вариант ${newIdx + 1}` } });
    // Add an empty manual item in the new column
    setItems([...items, { product_id: "", name: "", article: "", base_price: 0, client_price: 0, discount_pct: 0, qty: 1, sum: 0, image_url: "", description: "", column_index: newIdx }]);
  }

  function removeColumn(colIdx: number) {
    if (columnCount <= 1) return;
    // Remove all items in this column
    const newItems = items.filter((i) => (i.column_index ?? 0) !== colIdx)
      .map((i) => ({ ...i, column_index: (i.column_index ?? 0) > colIdx ? (i.column_index ?? 0) - 1 : (i.column_index ?? 0) }));
    setItems(newItems);
    // Shift column titles
    const newTitles: Record<string, string> = {};
    for (const [k, v] of Object.entries(columnTitles)) {
      const ki = Number(k);
      if (ki < colIdx) newTitles[k] = v;
      else if (ki > colIdx) newTitles[String(ki - 1)] = v;
    }
    setForm({ ...form, column_titles: newTitles });
  }

  async function handleSave(status = "draft") {
    setSaving(true);
    const res = await fetch("/api/quotes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: editing ? "update" : "create", id: editing?.id, ...form, category_overrides: form.category_overrides ?? {}, status, items }),
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

  async function uploadItemImage(file: File, itemIndex: number) {
    setUploadingImage(String(itemIndex));
    const fd = new FormData();
    fd.append("file", file);
    // Always use placeholder — КП photo changes should NOT affect the product catalog
    fd.append("product_id", `quote-manual-${Date.now()}`);
    const res = await fetch("/api/products/upload-image", { method: "POST", body: fd });
    if (res.ok) {
      const { url } = await res.json();
      setItems(items.map((it, i) => i === itemIndex ? { ...it, image_url: url } : it));
    }
    setUploadingImage(null);
  }

  async function deleteQuote(id: string) {
    if (!confirm("Удалить КП?")) return;
    await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    setQuotes(quotes.filter((q: { id: string }) => q.id !== id));
  }

  const filteredProducts = products.filter((p: { name: string; sku: string; category?: string; subcategory?: string; liters?: string; container?: string; description?: string }) => {
    if (productSearch.length < 2) return false;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.subcategory?.toLowerCase().includes(q) ||
      p.liters?.toLowerCase().includes(q) ||
      p.container?.toLowerCase().includes(q) ||
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
              <SearchableSelect
                options={companies.map((c: { id: string; name: string }) => ({ id: c.id, label: c.name }))}
                value={form.company_id}
                onChange={(id) => setForm({ ...form, company_id: id, contact_id: "" })}
                inputStyle={inputStyle}
                placeholder="Поиск компании..."
              />
            </div>
            <div>
              <label style={lblStyle}>Контакт</label>
              <SearchableSelect
                options={companyContacts.map((c: { id: string; full_name: string }) => ({ id: c.id, label: c.full_name }))}
                value={form.contact_id}
                onChange={(id) => setForm({ ...form, contact_id: id })}
                inputStyle={inputStyle}
                placeholder="Поиск контакта..."
              />
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
                {filteredProducts.slice(0, 50).map((p: { id: string; name: string; sku: string; base_price: number; category?: string; subcategory?: string; liters?: string; container?: string; description?: string; image_url?: string }) => (
                  <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between" style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <span>{[p.category, p.subcategory, formatLiters(p.liters), p.container, p.name].filter(Boolean).join(" / ")} <span style={{ color: "#aaa" }}>арт. {p.sku}</span></span>
                    <span style={{ color: "#2e7d32" }}>{formatCurrency(p.base_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category descriptions editor */}
          {(() => {
            const cats = new Set<string>();
            for (const item of items) {
              const parts = item.name.split(" / ");
              if (parts.length >= 2) cats.add(parts[0]);
            }
            if (cats.size === 0) return null;
            const overrides = form.category_overrides ?? {};
            return (
              <div>
                <label style={lblStyle}>Описания категорий (отображаются в КП)</label>
                <div className="space-y-2">
                  {[...cats].map((cat) => (
                    <div key={cat} className="p-3 rounded" style={{ border: "1px solid #e4e4e4", background: "#fafafa" }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold" style={{ color: "#555" }}>{cat}</span>
                      </div>
                      <input
                        value={overrides[cat]?.title ?? cat}
                        onChange={(e) => setForm({ ...form, category_overrides: { ...overrides, [cat]: { ...overrides[cat], title: e.target.value, description: overrides[cat]?.description ?? "" } } })}
                        placeholder="Заголовок категории"
                        className="w-full text-xs px-2 py-1 rounded outline-none mb-1"
                        style={{ border: "1px solid #e0e0e0", fontSize: 12, fontWeight: 600 }}
                      />
                      <textarea
                        value={overrides[cat]?.description ?? ""}
                        onChange={(e) => setForm({ ...form, category_overrides: { ...overrides, [cat]: { title: overrides[cat]?.title ?? cat, description: e.target.value } } })}
                        placeholder="Описание категории (отображается под заголовком в КП)"
                        className="w-full text-xs px-2 py-1 rounded outline-none"
                        rows={2}
                        style={{ border: "1px solid #e0e0e0", resize: "vertical", fontSize: 11 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label style={{ ...lblStyle, marginBottom: 0 }}>Позиции ({items.length})</label>
              <div className="flex items-center gap-2">
                {invoices.length > 0 && (
                  <select onChange={(e) => { importFromInvoice(e.target.value); e.target.value = ""; }}
                    className="text-xs px-2 py-1 rounded" style={{ border: "1px solid #e65c00", color: "#e65c00", maxWidth: 180 }}>
                    <option value="">Из счёта...</option>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {invoices.map((inv: any) => <option key={inv.id} value={inv.id}>Счёт #{inv.invoice_number} {inv.buyer_name ? `· ${inv.buyer_name}` : ""}</option>)}
                  </select>
                )}
                <button onClick={addManualItem} className="text-xs px-2 py-1 rounded" style={{ color: "#0067a5", border: "1px solid #0067a5" }}>+ Вручную</button>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: "#aaa" }}>Добавьте товары из каталога или вручную</p>
            ) : (
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-3 p-3 rounded" style={{ border: "1px solid #e4e4e4", background: "#fafafa" }}>
                    {/* Photo — always clickable to change */}
                    <label className="flex-shrink-0 relative group cursor-pointer block w-20 h-20">
                      {item.image_url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.image_url} alt="" className="w-20 h-20 rounded object-cover" style={{ border: "1px solid #e0e0e0" }} />
                          <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <ImagePlus size={16} style={{ color: "#fff" }} />
                          </div>
                        </>
                      ) : (
                        <div className="w-20 h-20 rounded flex flex-col items-center justify-center gap-1 transition-colors hover:bg-gray-100"
                          style={{ background: "#f0f0f0", border: "1px dashed #ccc" }}>
                          {uploadingImage === String(idx) ? (
                            <span className="text-xs" style={{ color: "#888" }}>...</span>
                          ) : (
                            <>
                              <ImagePlus size={18} style={{ color: "#aaa" }} />
                              <span style={{ fontSize: 9, color: "#aaa" }}>Фото</span>
                            </>
                          )}
                        </div>
                      )}
                      <input type="file" accept="image/*" className="hidden" disabled={uploadingImage === String(idx)}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadItemImage(f, idx); e.target.value = ""; }} />
                    </label>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)}
                          className="flex-1 text-xs font-medium px-2 py-1 rounded outline-none" style={{ border: "1px solid #e0e0e0" }}
                          placeholder="Название товара" />
                        <button onClick={() => duplicateItem(idx)} className="p-1 rounded hover:bg-blue-50 flex-shrink-0" title="Дублировать"><Copy size={12} style={{ color: "#0067a5" }} /></button>
                        <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-red-50 flex-shrink-0" title="Удалить"><X size={12} style={{ color: "#c62828" }} /></button>
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

                      {/* Bottle variant selector (only for Флаконы category) */}
                      {item.name.toLowerCase().includes("флакон") && (
                        <div className="flex items-center gap-2 text-xs">
                          <span style={{ color: "#7b1fa2" }}>Вариант:</span>
                          <select
                            value={item.bottle_variant ?? "none"}
                            onChange={(e) => {
                              const variant = e.target.value as BottleVariant;
                              const newPrice = calcBottlePrice(item.base_price, variant);
                              const newItems = [...items];
                              newItems[idx] = { ...item, bottle_variant: variant, client_price: newPrice, discount_pct: item.base_price > 0 ? Math.round((item.base_price - newPrice) / item.base_price * 1000) / 10 : 0, sum: newPrice * item.qty };
                              // Recalculate price tiers if they exist
                              if (item.price_tiers?.length) {
                                const catTier = findCategoryTiers("Флаконы");
                                if (catTier?.tiers?.length) {
                                  const tiers = catTier.tiers.map((t: { from_qty: number; discount_pct: number }, i: number, arr: { from_qty: number; discount_pct: number }[]) => ({
                                    from_qty: t.from_qty,
                                    to_qty: i < arr.length - 1 ? arr[i + 1].from_qty - 1 : null,
                                    price: Math.round(newPrice * (1 - t.discount_pct / 100)),
                                  }));
                                  if (tiers.length > 0 && tiers[0].from_qty > 1) tiers.unshift({ from_qty: 1, to_qty: tiers[0].from_qty - 1, price: newPrice });
                                  newItems[idx].price_tiers = tiers;
                                }
                              }
                              setItems(newItems);
                            }}
                            className="px-2 py-0.5 rounded outline-none"
                            style={{ border: "1px solid #ce93d8", fontSize: 11, color: "#7b1fa2" }}
                          >
                            {BOTTLE_VARIANTS.map((bv) => <option key={bv.value} value={bv.value}>{bv.label}</option>)}
                          </select>
                        </div>
                      )}

                      {/* Column selector (if multiple columns) */}
                      {columnCount > 1 && (
                        <div className="flex items-center gap-2 text-xs">
                          <span style={{ color: "#888" }}>Столбец:</span>
                          <select
                            value={item.column_index ?? 0}
                            onChange={(e) => updateItem(idx, "column_index", Number(e.target.value))}
                            className="px-2 py-0.5 rounded outline-none"
                            style={{ border: "1px solid #d0d0d0", fontSize: 11 }}
                          >
                            {Array.from({ length: columnCount }, (_, ci) => (
                              <option key={ci} value={ci}>{columnTitles[String(ci)] || `Столбец ${ci + 1}`}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1">
                          <span style={{ color: "#888" }}>Каталог:</span>
                          <input type="number" value={item.base_price} onChange={(e) => updateItem(idx, "base_price", Number(e.target.value))}
                            className="w-20 px-1 py-0.5 rounded outline-none text-right" style={{ border: "1px solid #e0e0e0", fontSize: 11, color: "#aaa", textDecoration: item.discount_pct > 0 ? "line-through" : "none" }} />
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
                        <div className="ml-auto font-medium" style={{ color: "#2e7d32" }}>
                          = {formatCurrency(item.variants?.length ? itemTotalSum(item) : item.sum)}
                        </div>
                      </div>

                      {/* Variants (разные варианты одного товара с отдельными ценами и фото) */}
                      <div className="mt-1 border-t pt-2" style={{ borderColor: "#e4e4e4" }}>
                        {!item.variants?.length ? (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => addBottleVariants(idx)}
                              className="text-xs" style={{ color: "#7b1fa2" }}>
                              + Варианты флакона (5 типов)
                            </button>
                            <button type="button" onClick={() => addCustomVariant(idx)}
                              className="text-xs" style={{ color: "#0067a5" }}>
                              + Свой вариант
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold" style={{ color: "#7b1fa2" }}>Варианты ({item.variants.length})</span>
                              <button type="button" onClick={() => removeAllVariants(idx)}
                                className="text-xs" style={{ color: "#c62828" }}>✕ Убрать все варианты</button>
                            </div>
                            <div className="space-y-1.5">
                              {item.variants.map((v, vi) => (
                                <div key={vi} className="flex items-center gap-2 p-1.5 rounded" style={{ background: "#f8f4fa", border: "1px solid #e1bee7" }}>
                                  {/* Photo */}
                                  <label className="flex-shrink-0 cursor-pointer" title="Загрузить фото">
                                    {v.image_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={v.image_url} alt="" className="w-10 h-10 rounded object-cover" style={{ border: "1px solid #e0e0e0" }} />
                                    ) : (
                                      <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: "#fff", border: "1px dashed #ccc" }}>
                                        <ImagePlus size={12} style={{ color: "#aaa" }} />
                                      </div>
                                    )}
                                    <input type="file" accept="image/*" className="hidden"
                                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVariantImage(f, idx, vi); e.target.value = ""; }} />
                                  </label>
                                  {/* Label */}
                                  <input value={v.label} onChange={(e) => updateVariant(idx, vi, "label", e.target.value)}
                                    className="flex-1 text-xs px-2 py-1 rounded outline-none"
                                    style={{ border: "1px solid #e0e0e0", background: "#fff" }} />
                                  {/* Price */}
                                  <span className="text-xs" style={{ color: "#888" }}>Цена:</span>
                                  <input type="number" value={v.price} onChange={(e) => updateVariant(idx, vi, "price", Number(e.target.value))}
                                    className="w-20 text-xs text-right px-1 py-0.5 rounded outline-none"
                                    style={{ border: "1px solid #e0e0e0", background: "#fff", color: "#2e7d32" }} />
                                  {/* Quantity */}
                                  <span className="text-xs" style={{ color: "#888" }}>Кол:</span>
                                  <input type="number" min="1" value={v.quantity} onChange={(e) => updateVariant(idx, vi, "quantity", Number(e.target.value))}
                                    className="w-14 text-xs text-right px-1 py-0.5 rounded outline-none"
                                    style={{ border: "1px solid #e0e0e0", background: "#fff" }} />
                                  {/* Sum */}
                                  <span className="text-xs font-medium" style={{ color: "#2e7d32", minWidth: 70, textAlign: "right" }}>
                                    {formatCurrency(v.sum || v.price * v.quantity)}
                                  </span>
                                  <button onClick={() => removeVariant(idx, vi)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
                                </div>
                              ))}
                            </div>
                            <button type="button" onClick={() => addCustomVariant(idx)}
                              className="text-xs mt-1" style={{ color: "#0067a5" }}>+ Ещё вариант</button>
                          </div>
                        )}
                      </div>

                      {/* Tiered pricing (price ladder) */}
                      <div className="mt-1">
                        <button type="button" onClick={() => {
                          const newItems = [...items];
                          if (item.price_tiers?.length) {
                            newItems[idx] = { ...item, price_tiers: undefined };
                          } else {
                            newItems[idx] = { ...item, price_tiers: [
                              { from_qty: 1, to_qty: 99, price: item.base_price, discount_pct: 0 },
                              { from_qty: 100, to_qty: 499, price: Math.round(item.base_price * 0.93), discount_pct: 7 },
                              { from_qty: 500, to_qty: null, price: Math.round(item.base_price * 0.85), discount_pct: 15 },
                            ] };
                          }
                          setItems(newItems);
                        }} className="text-xs" style={{ color: item.price_tiers?.length ? "#c62828" : "#0067a5" }}>
                          {item.price_tiers?.length ? "✕ Убрать лесенку цен" : "+ Лесенка цен"}
                        </button>
                        {item.price_tiers?.map((tier: { from_qty: number; to_qty: number | null; price: number; discount_pct?: number }, ti: number) => (
                          <div key={ti} className="flex items-center gap-2 mt-1 text-xs">
                            <span style={{ color: "#888" }}>от</span>
                            <input type="number" value={tier.from_qty} onChange={(e) => {
                              const newItems = [...items];
                              const tiers = [...(item.price_tiers ?? [])];
                              tiers[ti] = { ...tiers[ti], from_qty: Number(e.target.value) };
                              newItems[idx] = { ...item, price_tiers: tiers };
                              setItems(newItems);
                            }} className="w-16 px-1 py-0.5 rounded outline-none text-right" style={{ border: "1px solid #d0d0d0", fontSize: 11 }} />
                            <span style={{ color: "#888" }}>до</span>
                            <input type="number" value={tier.to_qty ?? ""} placeholder="∞" onChange={(e) => {
                              const newItems = [...items];
                              const tiers = [...(item.price_tiers ?? [])];
                              tiers[ti] = { ...tiers[ti], to_qty: e.target.value ? Number(e.target.value) : null };
                              newItems[idx] = { ...item, price_tiers: tiers };
                              setItems(newItems);
                            }} className="w-16 px-1 py-0.5 rounded outline-none text-right" style={{ border: "1px solid #d0d0d0", fontSize: 11 }} />
                            <span style={{ color: "#888" }}>шт →</span>
                            <input type="number" value={tier.discount_pct ?? (item.base_price > 0 ? Math.round((item.base_price - tier.price) / item.base_price * 1000) / 10 : 0)}
                              onChange={(e) => {
                                const pct = Number(e.target.value) || 0;
                                const newPrice = Math.round(item.base_price * (1 - pct / 100));
                                const newItems = [...items];
                                const tiers = [...(item.price_tiers ?? [])];
                                tiers[ti] = { ...tiers[ti], discount_pct: pct, price: newPrice };
                                newItems[idx] = { ...item, price_tiers: tiers };
                                setItems(newItems);
                              }}
                              className="w-14 px-1 py-0.5 rounded outline-none text-right" style={{ border: "1px solid #e0e0e0", fontSize: 11, color: "#e65c00" }} />
                            <span style={{ color: "#e65c00" }}>%</span>
                            <input type="number" value={tier.price} onChange={(e) => {
                              const newPrice = Number(e.target.value) || 0;
                              const pct = item.base_price > 0 ? Math.round((item.base_price - newPrice) / item.base_price * 1000) / 10 : 0;
                              const newItems = [...items];
                              const tiers = [...(item.price_tiers ?? [])];
                              tiers[ti] = { ...tiers[ti], price: newPrice, discount_pct: pct };
                              newItems[idx] = { ...item, price_tiers: tiers };
                              setItems(newItems);
                            }} className="w-20 px-1 py-0.5 rounded outline-none text-right font-medium" style={{ border: "1px solid #d0d0d0", fontSize: 11, color: "#2e7d32" }} />
                            <span style={{ color: "#888" }}>₽</span>
                            <button type="button" onClick={() => {
                              const newItems = [...items];
                              const tiers = (item.price_tiers ?? []).filter((_: unknown, i: number) => i !== ti);
                              newItems[idx] = { ...item, price_tiers: tiers.length ? tiers : undefined };
                              setItems(newItems);
                            }} className="text-red-400 hover:text-red-600">✕</button>
                          </div>
                        ))}
                        {item.price_tiers?.length ? (
                          <button type="button" onClick={() => {
                            const newItems = [...items];
                            const tiers = [...(item.price_tiers ?? []), { from_qty: 0, to_qty: null, price: item.base_price, discount_pct: 0 }];
                            newItems[idx] = { ...item, price_tiers: tiers };
                            setItems(newItems);
                          }} className="text-xs mt-1" style={{ color: "#0067a5" }}>+ Уровень</button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Columns management */}
          {items.length > 0 && (
            <div className="p-3 rounded space-y-3" style={{ background: "#f5f5f5", border: "1px solid #e4e4e4" }}>
              {/* Column titles & totals */}
              {columnCount > 1 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold" style={{ color: "#555" }}>Столбцы КП:</p>
                  {Array.from({ length: columnCount }, (_, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <input
                        value={columnTitles[String(ci)] || `Столбец ${ci + 1}`}
                        onChange={(e) => setForm({ ...form, column_titles: { ...columnTitles, [String(ci)]: e.target.value } })}
                        className="flex-1 text-xs px-2 py-1 rounded outline-none"
                        style={{ border: "1px solid #e0e0e0", fontSize: 11 }}
                      />
                      <span className="text-xs font-medium" style={{ color: "#2e7d32" }}>{formatCurrency(columnTotals[ci])}</span>
                      <span className="text-xs" style={{ color: "#aaa" }}>({items.filter((i) => (i.column_index ?? 0) === ci).length} поз.)</span>
                      {columnCount > 1 && (
                        <button onClick={() => removeColumn(ci)} className="text-xs px-1 hover:text-red-600" style={{ color: "#c62828" }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={addColumn} className="text-xs" style={{ color: "#0067a5" }}>+ Добавить столбец</button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="text-xs" style={{ color: "#888" }}>
                    Средняя скидка: <strong style={{ color: "#e65c00" }}>{avgDiscount}%</strong>
                  </div>
                  {items.some((i) => i.price_tiers?.length) && (
                    <label className="flex items-center gap-2 text-xs" style={{ color: "#888" }}>
                      <input type="checkbox" checked={form.hide_total ?? false}
                        onChange={(e) => setForm({ ...form, hide_total: e.target.checked })}
                        style={{ accentColor: "#e65c00" }} />
                      Скрыть общую сумму в КП (лесенка цен)
                    </label>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: "#888" }}>Общий итог:</p>
                  <p className="text-lg font-bold" style={{ color: "#2e7d32" }}>{formatCurrency(totalAmount)}</p>
                </div>
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
              window.open(`/q/${qid}`, "_blank");
              alert("На открывшейся странице нажмите кнопку 'Скачать PDF'");
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
    </div>
  );
}

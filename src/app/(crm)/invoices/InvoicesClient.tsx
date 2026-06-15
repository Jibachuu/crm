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

// Каталожный id «Дозатор для канистр» (sku=doz5000). При добавлении в счёт
// крема 5000мл (канистра) дозатор нужен покупателю чтобы из неё разливать,
// поэтому сразу подкладываем строку — менеджеры забывали, клиенты жаловались.
// У мыла 5000мл такого нет (отдельное решение от 2026-06-03).
const CANISTER_DISPENSER_ID = "1cb6f051-81a2-432a-85fd-4a3d31971e78";

// «Доставка» — синтетическая позиция, которая ВСЕГДА последняя в счёте
// (решение от 2026-06-04). Не товар каталога: product_id всегда пустой,
// менеджер сам ставит цену и при желании дополняет имя («Доставка до ПВЗ»
// / «Доставка до двери»). Распознаём по префиксу имени, чтобы не зависеть
// от точного совпадения после редактирования.
const DELIVERY_DEFAULT_NAME = "Доставка";
function isDeliveryItem(item: { name: string; product_id?: string }): boolean {
  // Каталожные товары с похожим названием не считаем доставкой — у нас
  // её в каталоге нет, но если когда-нибудь появится, ручной выбор в
  // строке не должен превращать её в «прибита к концу».
  if (item.product_id) return false;
  return /^доставка/i.test((item.name || "").trim());
}
function makeDeliveryRow(): InvoiceItem {
  return { product_id: "", name: DELIVERY_DEFAULT_NAME, quantity: 1, unit: "шт", price: 0, total: 0 };
}
// Перекладывает массив так, чтобы доставка была одна и последней.
// Если уже есть — сохраняем все правки менеджера (имя/цена/qty), просто
// двигаем в конец. Несколько доставок схлопываем в первую (защита от
// двойного импорта). Если доставки НЕТ — оставляем как есть (раньше
// функция автоматически добавляла дефолтную строку, и менеджер, удаляя
// доставку, тут же получал её обратно — Жиба 15.06.2026: «доставка
// иногда не нужна, а не убирается»).
function withDeliveryLast(rows: InvoiceItem[]): InvoiceItem[] {
  const delivery = rows.find(isDeliveryItem);
  if (!delivery) return rows;
  const rest = rows.filter((r) => !isDeliveryItem(r));
  return [...rest, delivery];
}
// Явный вариант для мест, где доставка нужна по умолчанию (импорт из
// КП / сделки, дублирование) — добавляет дефолтную строку, если её
// нет, и кладёт в конец.
function withDeliveryEnsured(rows: InvoiceItem[]): InvoiceItem[] {
  const delivery = rows.find(isDeliveryItem) ?? makeDeliveryRow();
  const rest = rows.filter((r) => !isDeliveryItem(r));
  return [...rest, delivery];
}

interface PriceTier { from_qty: number; to_qty: number | null; price: number }
interface InvoiceItem { product_id: string; name: string; quantity: number; unit: string; price: number; total: number; price_tiers?: PriceTier[] }

// True для каталожной позиции «Крем 5000мл» в любой из двух форм:
//  • name="Крем 5000мл" (отдельный товар, liters пустой);
//  • name="Крем" + subcategory="Крем" + liters="5000мл" + container="Канистра".
// Дополнительный фолбэк по тексту имени — на случай старых строк с
// пустым product_id, импортированных вручную.
function isCream5000Canister(item: { product_id?: string; name: string }, productsList: Array<{ id: string; name?: string; subcategory?: string; liters?: string; container?: string }>): boolean {
  if (item.product_id) {
    const p = productsList.find((pr) => pr.id === item.product_id);
    if (p) {
      const name = (p.name || "").toLowerCase();
      const sub = (p.subcategory || "").toLowerCase();
      const liters = (p.liters || "").toLowerCase();
      const isCream = sub === "крем" || name.startsWith("крем");
      const is5000 = liters.includes("5000") || /5000\s*мл/i.test(p.name || "");
      return isCream && is5000;
    }
  }
  return /крем/i.test(item.name) && /5000\s*мл/i.test(item.name);
}

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
  // Backlog v6 §3.3/§3.5: edit form must let the user change the invoice
  // number, date, due date, linked deal, basis, comment — previously only
  // items + total were editable, so adding a deal link or fixing a wrong
  // number forced creating a fresh duplicate invoice.
  const [editMeta, setEditMeta] = useState<{
    invoice_number: string;
    invoice_date: string;
    payment_due: string;
    deal_id: string;
    basis: string;
    comment: string;
  }>({
    invoice_number: "",
    invoice_date: "",
    payment_due: "",
    deal_id: "",
    basis: "",
    comment: "",
  });

  // Backlog v6 §3.4: when arriving via /invoices?open=<id> (e.g. from a deal
  // card), auto-open the preview for that invoice. Done once on mount —
  // subsequent navigations within the page manage previewInvoice manually.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("open");
    if (!id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = (initialInvoices as any[]).find((x: { id: string }) => x.id === id);
    if (!inv) return;
    setPreviewInvoice(inv);
    setPreviewItems([]);
    // 19.05.2026 — миграция browser→VPS, этап 2.
    fetch(`/api/invoices?id=${id}&items=1`).then((r) => r.ok ? r.json() : { items: [] }).then((d) => {
      setPreviewItems(withDeliveryLast(d.items ?? []));
    });
    // Strip the param so refresh / back-button doesn't keep retriggering.
    const url = new URL(window.location.href);
    url.searchParams.delete("open");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Create form state. Comment defaults to the standard shipping memo
  // (backlog v6 §11.3 — Артево's two normal сроки отгрузки: 10 дней
  // обычные / 12 индивидуальные). Operators edit per-invoice when the
  // деал has a non-standard срок, but the prefill saves the typing in
  // the common case.
  const [form, setForm] = useState({
    invoice_date: new Date().toISOString().slice(0, 10),
    payment_due: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    buyer_company_id: "", buyer_name: "", buyer_inn: "", buyer_kpp: "", buyer_address: "",
    basis: "Основной договор", deal_id: "",
    comment: "Срок отгрузки до 10 рабочих дней (12 при индивидуальном заказе)",
    vat_included: false,
    // v85: «offer» меняет заголовок на «Счёт-оферта» и дописывает 2-ю
    // страницу с «Общими условиями поставки по счёту-оферте» (8 пунктов).
    template_variant: "standard" as "standard" | "offer",
  });
  // Стартовая раскладка: одна пустая позиция + доставка в конце.
  // Доставка хранится в общем массиве, но UI и сериализация на сервер
  // защищают от того, чтобы менеджер случайно её удалил или перетащил
  // выше товаров.
  const [items, setItems] = useState<InvoiceItem[]>([
    { product_id: "", name: "", quantity: 1, unit: "шт", price: 0, total: 0 },
    makeDeliveryRow(),
  ]);

  async function importFromQuote(quoteId: string) {
    if (!quoteId) return;
    // 19.05.2026 — миграция browser→VPS, этап 2.
    const res = await fetch(`/api/quotes?items_for=${quoteId}`);
    const { items: qItems } = res.ok ? await res.json() : { items: [] };
    if (!qItems?.length) { alert("В КП нет товаров"); return; }
    // Backlog v6 §7.2: skip rows whose product is marked as a sample
    // («пробник» — excluded_from_invoice=true on the catalog row). They
    // are still tracked in КП/сделке for production, just not billed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billable = qItems.filter((qi: any) => !qi.products?.excluded_from_invoice);
    const skipped = qItems.length - billable.length;
    if (skipped > 0) {
      // Informational — operators were caught off-guard when «10 позиций»
      // landed in the invoice as 8 after sample exclusion.
      console.log(`[invoices] skipped ${skipped} sample row(s) on import from quote`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = quotes.find((qq: any) => qq.id === quoteId);
    if (q?.company_id) selectBuyer(q.company_id);
    type V = { label: string; price: number; quantity: number; sum?: number };
    type QI = {
      product_id?: string;
      name: string;
      article?: string;
      qty: number;
      client_price: number;
      sum: number;
      variants?: V[] | null;
      products?: { sku?: string; article?: string; excluded_from_invoice?: boolean } | null;
    };
    const out: InvoiceItem[] = [];
    for (const qi of billable as QI[]) {
      // SKU/article must end up in the printed invoice line — operators
      // were complaining "не видно артикулов" 2026-05-07. Quotes carry
      // either an inline `article` (manual rows) or a sku via the
      // joined products row. Append if not already in the name.
      const sku = qi.article || qi.products?.article || qi.products?.sku || "";
      const baseName = qi.name || "";
      const withSku = sku && !baseName.toLowerCase().includes(sku.toLowerCase())
        ? `${baseName} / арт. ${sku}`
        : baseName;
      // Backlog v6 §6.4 — quotes with chosen variants (e.g. флакон 500мл +
      // УФ-печать) were collapsing back to the base price/quantity. Mirror
      // the /api/invoices/from-quote behaviour: one invoice line per
      // variant, with the variant label appended and its own price/qty/sum.
      const variants = Array.isArray(qi.variants) ? qi.variants : [];
      if (variants.length > 0) {
        for (const v of variants) {
          const qty = v.quantity || 1;
          const price = v.price || 0;
          out.push({
            product_id: qi.product_id || "",
            name: `${withSku} / ${v.label}`,
            quantity: qty,
            unit: "шт",
            price,
            total: v.sum ?? price * qty,
          });
        }
      } else {
        out.push({
          product_id: qi.product_id || "",
          name: withSku,
          quantity: qi.qty ?? 1,
          unit: "шт",
          price: qi.client_price ?? 0,
          total: qi.sum ?? 0,
        });
      }
    }
    // Импорт из КП — доставка добавляется по умолчанию.
    setItems(withDeliveryEnsured(withCanisterDispenser(out)));
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
      quantity: number;
      unit_price: number;
      total_price: number;
      variants: V[] | null;
      base_price?: number;
      category?: string;
      subcategory?: string;
      // deal_products.flavor — выбранный для конкретной позиции аромат
      // (косметика часто хранит его именно здесь, а не на каталоге).
      flavor?: string;
      products?: { name?: string; sku?: string; category?: string; subcategory?: string; liters?: string; container?: string; flavor?: string; kind?: string; excluded_from_invoice?: boolean } | null;
    };

    // Backlog v6 §7.2: skip sample rows (excluded_from_invoice).
    const billableRows = (rows as Row[]).filter((r) => !r.products?.excluded_from_invoice);
    if (billableRows.length === 0) {
      alert("В заказе только пробники — они не выставляются в счёт");
      return;
    }

    const newItems: InvoiceItem[] = [];
    for (const r of billableRows) {
      const p = r.products ?? {};
      // Имя позиции: «{name} / арт. {sku}» как базовое идентифицирующее
      // ядро, плюс контекст в скобках — аромат (для косметики), литры и
      // тара. До 28.05 аромат не подтягивался вообще, литры/тара терялись
      // у вариантов — менеджеры заполняли это руками.
      // ВАЖНО: deal_products.kind = 'purchase'/'rental' (v82) — это НЕ
      // аромат; каталожное products.kind (v57) — да. Поэтому аромат
      // берём из r.flavor → p.flavor → p.kind в таком порядке.
      const baseName = (p.name || "Товар").trim();
      const withSku = p.sku && !baseName.toLowerCase().includes(p.sku.toLowerCase())
        ? `${baseName} / арт. ${p.sku}`
        : baseName;
      const litersPart = p.liters ? formatLiters(p.liters) : "";
      const aroma = (r.flavor || p.flavor || p.kind || "").trim();
      // Подкатегория для держателей («Настольные/Настенные») и подобных —
      // в имени её обычно нет, без неё строка обезличивается. Для косметики
      // (subcategory часто совпадает с name, типа «Крем»/«Мыло») дедуп
      // отсеивает дубль. category намеренно не выводим — она дублирует
      // раздел каталога и забивает строку (20.05 решение).
      const sub = (r.subcategory || p.subcategory || "").trim();
      const subPart = sub && !baseName.toLowerCase().includes(sub.toLowerCase()) ? sub : "";
      const ctx = [subPart, aroma, litersPart, p.container].filter(Boolean).join(", ");

      const vs = Array.isArray(r.variants) ? r.variants : [];
      if (vs.length > 0) {
        for (const v of vs) {
          // Вариант — главный идентификатор (УФ-печать и т.д.), идёт
          // первым; имя/арт/аромат/литры/тара кладём в скобки как контекст.
          const variantLabel = (v.label || "").trim();
          const inside = ctx ? `${withSku}, ${ctx}` : withSku;
          const composed = variantLabel ? `${variantLabel} (${inside})` : inside;
          newItems.push({
            product_id: r.product_id ?? "",
            name: composed,
            quantity: v.quantity || 1,
            unit: "шт",
            price: v.price ?? 0,
            total: v.sum ?? (v.price ?? 0) * (v.quantity || 1),
          });
        }
      } else {
        const fullName = ctx ? `${withSku} (${ctx})` : withSku;
        newItems.push({
          product_id: r.product_id ?? "",
          name: fullName,
          quantity: r.quantity || 1,
          unit: "шт",
          price: r.unit_price ?? 0,
          total: r.total_price ?? (r.unit_price ?? 0) * (r.quantity || 1),
        });
      }
    }
    // Импорт из сделки — доставка добавляется по умолчанию.
    setItems(withDeliveryEnsured(withCanisterDispenser(newItems)));
  }

  function selectBuyer(companyId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = companies.find((co: any) => co.id === companyId);
    setForm({ ...form, buyer_company_id: companyId, buyer_name: c?.name ?? "", buyer_inn: c?.inn ?? "", buyer_kpp: c?.kpp ?? "", buyer_address: c?.legal_address ?? "" });
  }

  function addItem() {
    // Новую строку ставим ПЕРЕД доставкой, чтобы доставка осталась последней.
    setItems(withDeliveryLast([...items, { product_id: "", name: "", quantity: 1, unit: "шт", price: 0, total: 0 }]));
  }
  function removeItem(i: number) {
    // Удалили доставку случайно — withDeliveryLast добавит дефолт обратно.
    setItems(withDeliveryLast(items.filter((_, idx) => idx !== i)));
  }

  // Подмешать «Дозатор для канистр» если в счёте есть крем 5000мл и дозатора
  // ещё нет. Вызывается только при создании счёта (через сделку, КП, ручной
  // выбор), в режиме редактирования не работает — иначе при правке старого
  // счёта могла бы появляться лишняя строка.
  function withCanisterDispenser(rows: InvoiceItem[]): InvoiceItem[] {
    const hasCream = rows.some((it) => isCream5000Canister(it, products));
    if (!hasCream) return rows;
    if (rows.some((it) => it.product_id === CANISTER_DISPENSER_ID)) return rows;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const disp = (products as any[]).find((p) => p.id === CANISTER_DISPENSER_ID);
    if (!disp) return rows;
    const name = buildProductName(disp);
    const price = Number(disp.base_price) || 0;
    return [...rows, {
      product_id: CANISTER_DISPENSER_ID,
      name,
      quantity: 1,
      unit: "шт",
      price,
      total: price,
    }];
  }

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
      { suffix: "Без УФ-печати",                  price: bp },
      { suffix: "С УФ-печатью",                   price: bp + 500 },
      { suffix: "С УФ-печатью и логотипом Havenberg",      price: Math.round((bp + 500) * 0.6) },
      { suffix: "С наклейкой",                    price: bp + 100 },
      { suffix: "С наклейкой и логотипом Havenberg",       price: Math.round((bp + 100) * 0.6) },
    ];
    // Strip an existing variant suffix if user already chose one.
    // Strip any trailing OR mid-string variant suffix so re-clicking
    // doesn't pile labels on top of each other (e.g. catalog name still
    // says "Без УФ-печати"). \b doesn't work on Cyrillic in JS so we
    // anchor on whitespace/slash explicitly.
    const baseName = src.name
      .replace(/\s*[\/\-]\s*(Без\s*УФ[\s-]*печати|С\s*УФ[\s-]*печатью(\s+и\s+(?:нашим\s+лого|логотипом\s+Havenberg))?|С\s*наклейкой(\s+и\s+(?:нашим\s+лого|логотипом\s+Havenberg))?)/gi, "")
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
    setItems(withDeliveryLast([...items.slice(0, idx), ...newRows, ...items.slice(idx + 1)]));
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
    const next = items.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: val };
      if (field === "product_id") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = products.find((pr: any) => pr.id === val);
        if (p) { updated.name = buildProductName(p); updated.price = p.base_price; }
      }
      updated.total = updated.quantity * updated.price;
      return updated;
    });
    // Подмешиваем дозатор только когда поменялся товар — иначе при правке
    // qty/price у уже-существующего крема дозатор воскрешался бы после удаления.
    // Доставку при правках полей строк не двигаем (она и так в конце; если
    // редактируется именно она — реордер не нужен, индекс не меняется).
    // Реордер делаем только когда поменялся product_id, т.к. это единственный
    // путь, который может вставить новую позицию (например, дозатор) и сбить
    // порядок.
    const afterDispenser = field === "product_id" ? withCanisterDispenser(next) : next;
    setItems(field === "product_id" ? withDeliveryLast(afterDispenser) : afterDispenser);
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
    // Доставка-строка присутствует всегда (см. withDeliveryLast) — она
    // не считается за «позицию» для требования минимального наполнения счёта.
    if (items.filter((i) => i.name && !isDeliveryItem(i)).length === 0) missing.push("Хотя бы одна позиция (не считая доставки)");
    if (missing.length > 0) {
      alert("Заполните обязательные поля:\n• " + missing.join("\n• "));
      return;
    }
    setSaving(true);
    // 19.05.2026 — миграция browser→VPS, этап 2. Создание счёта + items
    // в одном запросе. invoice_number и created_by заполняются на сервере.
    const itemsBody = items.filter((i) => i.name).map((i) => ({
      product_id: i.product_id || null,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      price: i.price,
      total: i.total,
      price_tiers: i.price_tiers?.length ? i.price_tiers : null,
    }));

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
        template_variant: form.template_variant,
        total_amount: totalAmount,
        items: itemsBody,
      }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error || "Ошибка"); setSaving(false); return; }

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

    setSaving(false);
    setCreateOpen(false);
    window.location.reload();
  }

  async function openPreview(inv: { id: string }) {
    setPreviewInvoice(inv);
    setPreviewItems([]);
    const res = await fetch(`/api/invoices?id=${inv.id}&items=1`);
    const d = res.ok ? await res.json() : { items: [] };
    setPreviewItems(withDeliveryLast(d.items ?? []));
  }

  async function updateStatus(id: string, status: string) {
    await fetch("/api/invoices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setInvoices(invoices.map((inv: { id: string }) => inv.id === id ? { ...inv, status } : inv));
  }

  async function deleteInvoice(id: string) {
    if (!confirm("Удалить счёт?")) return;
    await fetch(`/api/invoices?id=${id}`, { method: "DELETE" });
    setInvoices(invoices.filter((inv: { id: string }) => inv.id !== id));
  }

  function startEditInvoice() {
    if (!previewInvoice) return;
    setEditingInvoice(true);
    setEditItems(withDeliveryLast(previewItems.map((i: InvoiceItem) => ({ ...i }))));
    setEditMeta({
      invoice_number: String(previewInvoice.invoice_number ?? ""),
      invoice_date: previewInvoice.invoice_date ? String(previewInvoice.invoice_date).slice(0, 10) : "",
      payment_due: previewInvoice.payment_due ? String(previewInvoice.payment_due).slice(0, 10) : "",
      deal_id: previewInvoice.deal_id ?? "",
      basis: previewInvoice.basis ?? "",
      comment: previewInvoice.comment ?? "",
    });
  }

  // Backlog v6 §3.5: «Дублировать счёт» — open the create form pre-filled
  // from the currently previewed invoice (same buyer, same deal, same
  // items). The user then tweaks a date / qty and saves a fresh invoice
  // with its own number. Avoids the «копипаст всех полей вручную» dance.
  function duplicateInvoice() {
    if (!previewInvoice) return;
    setForm({
      ...form,
      buyer_company_id: previewInvoice.buyer_company_id ?? "",
      buyer_name: previewInvoice.buyer_name ?? "",
      buyer_inn: previewInvoice.buyer_inn ?? "",
      buyer_kpp: previewInvoice.buyer_kpp ?? "",
      buyer_address: previewInvoice.buyer_address ?? "",
      basis: previewInvoice.basis ?? "Основной договор",
      deal_id: previewInvoice.deal_id ?? "",
      comment: previewInvoice.comment ?? "",
      vat_included: !!previewInvoice.vat_included,
      template_variant: (previewInvoice.template_variant === "offer" ? "offer" : "standard") as "standard" | "offer",
    });
    setItems(withDeliveryLast(previewItems.map((i: InvoiceItem) => ({
      product_id: i.product_id ?? "",
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      price: i.price,
      total: i.total,
      price_tiers: i.price_tiers ?? undefined,
    }))));
    setPreviewInvoice(null);
    setEditingInvoice(false);
    setCreateOpen(true);
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
      { suffix: "Без УФ-печати",                  price: bp },
      { suffix: "С УФ-печатью",                   price: bp + 500 },
      { suffix: "С УФ-печатью и логотипом Havenberg",      price: Math.round((bp + 500) * 0.6) },
      { suffix: "С наклейкой",                    price: bp + 100 },
      { suffix: "С наклейкой и логотипом Havenberg",       price: Math.round((bp + 100) * 0.6) },
    ];
    // Strip any trailing OR mid-string variant suffix so re-clicking
    // doesn't pile labels on top of each other (e.g. catalog name still
    // says "Без УФ-печати"). \b doesn't work on Cyrillic in JS so we
    // anchor on whitespace/slash explicitly.
    const baseName = src.name
      .replace(/\s*[\/\-]\s*(Без\s*УФ[\s-]*печати|С\s*УФ[\s-]*печатью(\s+и\s+(?:нашим\s+лого|логотипом\s+Havenberg))?|С\s*наклейкой(\s+и\s+(?:нашим\s+лого|логотипом\s+Havenberg))?)/gi, "")
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
    setEditItems(withDeliveryLast([...editItems.slice(0, idx), ...newRows, ...editItems.slice(idx + 1)]));
  }

  async function saveEditInvoice() {
    if (!previewInvoice) return;
    setSaving(true);
    const newTotal = editItems.reduce((s, i) => s + i.total, 0);

    // Update invoice metadata + total (§3.3/§3.5 — number/date/deal/basis/comment).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaUpdate: Record<string, any> = { total_amount: newTotal };
    if (editMeta.invoice_number) metaUpdate.invoice_number = editMeta.invoice_number;
    if (editMeta.invoice_date) metaUpdate.invoice_date = editMeta.invoice_date;
    metaUpdate.payment_due = editMeta.payment_due || null;
    metaUpdate.deal_id = editMeta.deal_id || null;
    metaUpdate.basis = editMeta.basis || null;
    metaUpdate.comment = editMeta.comment || null;

    // 19.05.2026 — миграция browser→VPS, этап 2. Один PUT обновляет
    // мету и сразу заменяет items.
    await fetch("/api/invoices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: previewInvoice.id,
        ...metaUpdate,
        items: editItems.filter((i) => i.name).map((i) => ({
          product_id: i.product_id || null,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          price: i.price,
          total: i.total,
        })),
      }),
    });

    setPreviewItems(withDeliveryLast(editItems));
    setPreviewInvoice({ ...previewInvoice, ...metaUpdate });
    setInvoices(invoices.map((inv: { id: string }) =>
      inv.id === previewInvoice.id ? { ...inv, ...metaUpdate } : inv
    ));
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

    // v85: «offer» меняет заголовок на «Счёт-оферта» и дописывает 2-ю
    // страницу с 8 пунктами «Общих условий поставки по счёту-оферте» —
    // см. PDF-эталон от 31.05.2026.
    const isOffer = inv.template_variant === "offer";
    const titleLabel = isOffer ? "Счёт-оферта" : "Счёт на оплату";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titleLabel} №${inv.invoice_number}</title>
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
.fine-print{font-size:9px;color:#333;margin:10px 0;line-height:1.5}
.sign-block{margin-top:15px;position:relative;page-break-inside:avoid;break-inside:avoid}
.sign-line{display:inline-block;width:200px;border-bottom:1px solid #000;margin:0 10px}
.stamp{position:absolute;left:0;bottom:-10px;width:130px;height:130px;opacity:0.8}
.signature{position:absolute;left:140px;bottom:5px;width:100px;opacity:0.85}
/* Низ счёта (итоги + сумма прописью + фин-принт + подпись) — раньше держали
   единым блоком (break-inside:avoid) чтобы не было одинокого sign-block на
   стр. 2. Но в режиме «оферта» это давало пустую страницу перед «Общими
   условиями», т.к. footer с подписью насильно прыгал на свою страницу
   целиком. Теперь только sign-block сам по себе не разрывается (см. CSS
   .sign-block ниже), а остальной footer может перетекать. */
.invoice-footer{}
/* @page margin задаётся НА КАЖДОЙ СТРАНИЦЕ — раньше я ставил margin:0
   и компенсировал body margin'ом, но body margin срабатывает только на
   первой/последней странице потока — на промежуточных текст прилипал
   к краю. Теперь margin на @page правильный, body без margin. Если
   нужно убрать заголовок браузера (about:blank/дата), это снимается
   в диалоге печати чекбоксом «Headers and footers». orphans/widows
   защищают от уродских разрывов: одинокая первая или последняя строка
   абзаца не остаётся на чужой странице. */
@page{size:A4;margin:14mm 16mm}
@media print{
  body{margin:0}
  p{orphans:3;widows:3}
  #printBtn{display:none!important}
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

<div class="title">${titleLabel} № ${inv.invoice_number} от ${dateStr}${isOffer ? `<span style="float:right;font-size:10px;font-weight:normal;border:none">Счёт действителен для оплаты в течение 7 (семи) рабочих дней</span>` : ""}</div>

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

<div class="invoice-footer">
<table class="totals">
<tr><td colspan="4"></td><td class="r bold" style="width:100px">Итого:</td><td class="r bold" style="width:100px">${fmt(total)}</td></tr>
<tr><td colspan="4"></td><td class="r">${inv.vat_included ? "В том числе НДС (20%):" : "Без налога (НДС)"}</td><td class="r">${inv.vat_included ? fmt(total * 0.2 / 1.2) : "-"}</td></tr>
<tr><td colspan="4"></td><td class="r bold">Всего к оплате:</td><td class="r bold">${fmt(total)}</td></tr>
</table>

<p style="margin-top:6px">Всего наименований ${previewItems.length}, на сумму ${fmt(total)} руб.</p>
<p class="sum-words">${amountToWords(total)}</p>

${dueDateStr ? `<p style="margin-top:6px">Оплатить не позднее ${dueDateStr}</p>` : ""}

<div class="fine-print">
Оплата данного счета означает согласие с условиями поставки товара.<br>
Уведомление об оплате обязательно, в противном случае не гарантируется наличие товара на складе.<br>
Товар отпускается по факту прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и паспорта.
</div>

${isOffer ? "" : `<div class="sign-block">
${stampSrc ? `<img class="stamp" src="${stampSrc}" />` : ""}
${sigSrc ? `<img class="signature" src="${sigSrc}" />` : ""}
<p><strong>Предприниматель</strong> <span class="sign-line"></span> / ${supplier?.director ?? ""} /</p>
</div>`}
</div><!-- /.invoice-footer -->

${isOffer ? `<div style="page-break-before:always;font-size:10px;line-height:1.45">
<h3 style="font-size:13px;font-weight:bold;margin:0 0 10px;text-align:center">ОБЩИЕ УСЛОВИЯ ПОСТАВКИ ПО СЧЕТУ-ОФЕРТЕ</h3>

<!-- Раньше тут было column-count:2: Chrome пытался балансировать колонки
     на стр. 2, и из-за этого сверху страницы появлялась пустая зона
     (column-fill: balance — поведение по умолчанию). Переключили на
     одно-колонный текст: документ становится на пол-страницы длиннее,
     но больше нет пустых зон и страница начинается сразу с заголовка. -->
<div>
<p style="font-weight:bold;margin:4px 0 2px">1. Акцепт и заключение договора</p>
<p>1.1. Акцептом настоящей оферты признается поступление денежных средств на расчетный счет Поставщика в размере 100% суммы счета либо в ином размере предоплаты, прямо указанном в счете.</p>
<p>1.2. Оплата счета означает, что Покупатель полностью ознакомился с условиями счета-оферты, принимает их без замечаний и разногласий, подтверждает полномочия лица, инициировавшего оплату, и обязуется соблюдать все условия поставки.</p>
<p>1.3. Частичная оплата не является акцептом, если возможность частичной оплаты прямо не указана в счете либо Поставщик письменно не подтвердил принятие частичной оплаты как акцепта.</p>
<p>1.4. Оплата счета после истечения срока его действия не считается акцептом, если Поставщик письменно не подтвердил принятие такой оплаты либо не приступил к исполнению поставки. Поставщик вправе вернуть оплату, поступившую после срока действия счета.</p>
<p>1.5. Оплата счета третьим лицом по поручению Покупателя признается акцептом Покупателя, если из назначения платежа, переписки или иных документов следует, что оплата произведена за Покупателя по настоящему счету.</p>
<p>1.6. При противоречии между индивидуальными условиями, указанными в таблице счета, и Общими условиями поставки применяются индивидуальные условия счета.</p>

<p style="font-weight:bold;margin:6px 0 2px">2. Предмет поставки</p>
<p>2.1. Поставщик обязуется передать в собственность Покупателя товары, указанные в настоящем счете, а Покупатель обязуется принять и оплатить товары на условиях счета-оферты.</p>
<p>2.2. Покупатель подтверждает, что приобретает товары для использования в предпринимательской деятельности либо в иных целях, не связанных с личным, семейным, домашним или иным подобным использованием.</p>
<p>2.3. Наименование, характеристики, количество, цена, срок и адрес поставки товара определяются настоящим счетом и признаются согласованными с момента акцепта счета-оферты.</p>
<p>2.4. Поставщик гарантирует, что является собственником товара, товар не находится в споре, под арестом, не является предметом залога, не обременен правами третьих лиц и не нарушает прав третьих лиц.</p>
<p>2.5. Поставщик гарантирует соответствие товара стандартам производителя, заявленным характеристикам и требованиям действующего законодательства Российской Федерации.</p>

<p style="font-weight:bold;margin:6px 0 2px">3. Цена и порядок расчетов</p>
<p>3.1. Цена товара указывается в настоящем счете в рублях Российской Федерации.</p>
<p>3.2. Если иное прямо не указано в счете, поставка осуществляется на условиях 100% предоплаты.</p>
<p>3.3. Обязательство Покупателя по оплате считается исполненным с даты поступления денежных средств на расчетный счет Поставщика.</p>
<p>3.4. Если Покупатель не оплатил счет в срок его действия, Поставщик вправе считать оферту неакцептованной и отказаться от поставки товара без каких-либо санкций.</p>
<p>3.5. Счет действителен для оплаты в течение 7 (семи) рабочих дней с даты выставления, если иной срок не указан в счете.</p>

<p style="font-weight:bold;margin:6px 0 2px">4. Порядок поставки и переход права собственности</p>
<p>4.1. Поставщик осуществляет поставку товара по адресу и на условиях, указанных в счете. Если адрес поставки не указан, поставка осуществляется способом, дополнительно согласованным Сторонами в переписке.</p>
<p>4.2. Покупатель обязан обеспечить принятие товара по согласованному адресу, в том числе организовать разгрузочные работы, обеспечить место разгрузки рабочей силой и подъемными механизмами, если это требуется для товара.</p>
<p>4.3. Принятие товара Покупателем подтверждается подписанием УПД, товарной накладной, транспортной накладной, акта приема-передачи, документов перевозчика либо иного документа, подтверждающего передачу товара.</p>
<p>4.4. Право собственности на товар и риск случайной гибели или повреждения товара переходят к Покупателю с момента передачи товара перевозчику, транспортной компании или службе доставки, а при передаче без привлечения перевозчика — с момента фактической передачи товара Покупателю или его представителю.</p>
<p>4.5. Поставщик передает товар в упаковке, обеспечивающей сохранность товара при обычных условиях транспортировки. Специальная упаковка предоставляется при наличии возможности и за счет Покупателя, если иное не указано в счете.</p>

<p style="font-weight:bold;margin:6px 0 2px">5. Приемка, качество, претензии</p>
<p>5.1. Покупатель обязан проверить товар по количеству, ассортименту, качеству, состоянию упаковки и наличию видимых повреждений не позднее 3 (трех) рабочих дней с момента поставки.</p>
<p>5.2. Претензии по скрытым недостаткам, которые не могли быть выявлены при обычной приемке, могут быть предъявлены в течение гарантийного срока.</p>
<p>5.3. При наличии претензии Покупатель направляет Поставщику письменное уведомление с указанием товара, количества, содержания претензии, основания претензии и конкретного требования. К претензии прилагаются фото-, видео-, актовые и иные подтверждающие материалы.</p>
<p>5.4. Наличие недостатков подтверждается двусторонним актом представителей Сторон. Представитель Поставщика прибывает для осмотра в течение 3 (трех) рабочих дней с даты получения претензии. При неприбытии представителя Поставщика в указанный срок Покупатель вправе составить акт в одностороннем порядке.</p>
<p>5.5. При удовлетворении претензии о недостатках товара Поставщик заменяет некачественный товар в согласованный срок, но не более 14 (четырнадцати) рабочих дней с даты предъявления соответствующего требования Покупателем.</p>
<p>5.6. Если Поставщик оспаривает факт ненадлежащего качества товара, Стороны привлекают независимого эксперта. Расходы на экспертизу предварительно несет Покупатель, но если экспертиза подтвердит, что недостатки возникли до передачи товара Покупателю по вине производителя или Поставщика, расходы на экспертизу возмещаются Поставщиком.</p>

<p style="font-weight:bold;margin:6px 0 2px">6. Документы и гарантия</p>
<p>6.1. Совместно с товаром Поставщик передает Покупателю счет на оплату, УПД и/или иные первичные документы, применимые к соответствующей поставке.</p>
<p>6.2. Один оригинал товарно-транспортных документов, подписанных Покупателем и Поставщиком/перевозчиком, остается у Покупателя; второй оригинал направляется Поставщику.</p>
<p>6.3. Гарантия на товар предоставляется на условиях и в сроках гарантии изготовителя. Если изготовитель не предоставляет гарантию, гарантийный срок составляет 1 (один) год с даты поставки, если иной срок не указан в технической документации.</p>
<p>6.4. Документы, предусмотренные настоящим пунктом, могут оформляться, подписываться и обмениваться сторонами как на бумажном носителе, так и в электронном виде через систему электронного документооборота (ЭДО), применимую между Сторонами. Документы, подписанные с использованием ЭДО, имеют юридическую силу, равную документам на бумажном носителе, и признаются сторонами надлежащими доказательствами факта исполнения обязательств по поставке.</p>
<p>6.5. При обнаружении недостатков в течение гарантийного срока Покупатель вправе требовать замены товара на товар надлежащего качества в срок не более 14 (четырнадцати) рабочих дней с даты предъявления требования. Подтвержденные дополнительные расходы, связанные с выявлением и устранением недостатков товара, несет Поставщик.</p>

<p style="font-weight:bold;margin:6px 0 2px">7. Условия использования флаконов, емкостей, дозаторов и тары Havenberg / Artevo</p>
<p>7.1. Если Поставщик предоставляет Покупателю безвозмездно, по себестоимости, со скидкой или на иных льготных условиях флаконы, емкости, дозаторы и/или иную тару с обозначениями, упоминаниями или маркировкой «Havenberg» и/или «Artevo», Покупатель обязан использовать такие флаконы исключительно для залива, хранения, дозирования, демонстрации и использования оригинальных средств бренда «Havenberg».</p>
<p>7.2. Использование указанных флаконов для средств иных брендов, средств неизвестного происхождения либо неоригинальных средств не допускается.</p>
<p>7.3. Поставщик вправе проводить аудит соблюдения условий использования указанных флаконов, в том числе путем посещения представителем Поставщика объекта Покупателя в часы работы Покупателя, осмотра флаконов, фото- и/или видеофиксации, а также отбора пробы средства, находящегося во флаконе.</p>
<p>7.4. Результаты проверки и/или отбора пробы оформляются актом Поставщика, в том числе в одностороннем порядке при отказе Покупателя от подписания акта.</p>
<p>7.5. При нарушении Покупателем пунктов 7.1–7.2 либо при воспрепятствовании аудиту по пункту 7.3 льготные условия предоставления соответствующих флаконов утрачивают силу. Покупатель обязан оплатить Поставщику полную стоимость каждого флакона, в отношении которого выявлено нарушение, в размере 1 390 (Одна тысяча триста девяносто) рублей 00 копеек за один флакон.</p>
<p>7.6. Если флакон был ранее оплачен Покупателем по себестоимости, со скидкой или на иных льготных условиях, Покупатель обязан доплатить разницу до полной стоимости флакона. Оплата производится в течение 10 (десяти) рабочих дней с даты получения требования и/или счета Поставщика.</p>

<p style="font-weight:bold;margin:6px 0 2px">8. Ответственность сторон</p>
<p>8.1. Стороны несут ответственность за неисполнение или ненадлежащее исполнение обязательств в соответствии с законодательством Российской Федерации и настоящим счетом-офертой.</p>
<p>8.2. За нарушение Покупателем срока оплаты поставленного товара, если счетом предусмотрена постоплата или отсрочка платежа, Поставщик вправе начислить неустойку 0,1% от стоимости неоплаченного товара за каждый день просрочки.</p>
<p>8.3. Невнесение авансового платежа в срок не является просрочкой оплаты, если поставка осуществляется на условиях 100% предоплаты, но дает Поставщику право отказаться от поставки товара.</p>
<p>8.4. За нарушение Поставщиком срока поставки Покупатель вправе начислить неустойку 0,1% от стоимости непоставленного в срок товара за каждый день просрочки.</p>
<p>8.5. Если срок поставки нарушен более чем на 3 (три) рабочих дня, Покупатель вправе отказаться от соответствующей поставки и потребовать возврата денежных средств, оплаченных за товар, срок поставки которого нарушен.</p>
</div>

<div style="margin-top:18px;border-top:1px solid #000;padding-top:10px;font-size:11px;position:relative;min-height:150px">
${stampSrc ? `<img src="${stampSrc}" style="position:absolute;left:0;top:18px;width:130px;height:130px;opacity:0.8" />` : ""}
${sigSrc ? `<img src="${sigSrc}" style="position:absolute;left:140px;top:8px;width:100px;opacity:0.85" />` : ""}
<strong>Предприниматель</strong> <span style="display:inline-block;width:200px;border-bottom:1px solid #000;margin:0 10px"></span> ${supplier?.director ?? "Абзалов Н.Л."}
</div>
</div>` : ""}

<script>
document.title='${titleLabel} ${inv.invoice_number}';
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
            <div>
              <label style={lblStyle}>
                Юридический адрес покупателя <span style={{ color: "#c62828" }}>*</span>
                {form.buyer_company_id && (
                  <span style={{ color: "#888", fontWeight: 400, marginLeft: 6 }}>— из карточки компании, редактируется там</span>
                )}
              </label>
              {/* Backlog v6 §3.2: when a company is selected, the legal
                  address must come from the company card. Editing it inline
                  here was producing inconsistent invoices (Андрей Чурилов
                  flagged 11.05). The field is read-only with the buyer
                  picked — change the company itself to fix a bad address. */}
              <input
                value={form.buyer_address}
                onChange={(e) => setForm({ ...form, buyer_address: e.target.value })}
                readOnly={!!form.buyer_company_id}
                style={{ ...inputStyle, background: form.buyer_company_id ? "#f5f5f5" : (inputStyle as React.CSSProperties).background, cursor: form.buyer_company_id ? "not-allowed" : "text" }}
                placeholder="Только юр. адрес — без склада / ТК / пометок"
              />
            </div>
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
              {items.map((item, i) => {
                const delivery = isDeliveryItem(item);
                return (
                <div key={i} className="rounded p-2" style={{ border: delivery ? "1px solid #b3e0f5" : "1px solid #f0f0f0", background: delivery ? "#f5fbff" : undefined }}>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      {delivery ? (
                        // Доставка — не из каталога: только редактируемое имя
                        // (менеджер может написать «Доставка до ПВЗ» и т.д.).
                        // Плашка слева — чтобы строку нельзя было спутать с товаром.
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "#0067a5", color: "#fff", whiteSpace: "nowrap" }}>ДОСТАВКА</span>
                          <input value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Доставка" style={{ ...inputStyle, fontSize: 12 }} />
                        </div>
                      ) : (
                        <>
                          <SearchableSelect
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            options={(products as any[]).filter((p) => !/^доставка/i.test(p.name || "")).map((p: any) => ({
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
                        </>
                      )}
                    </div>
                    <div className="col-span-2"><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(i, "quantity", Number(e.target.value))} style={{ ...inputStyle, fontSize: 12 }} placeholder="Кол-во" /></div>
                    <div className="col-span-1"><input value={item.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} style={{ ...inputStyle, fontSize: 12 }} /></div>
                    <div className="col-span-2"><input type="number" min="0" step="0.01" value={item.price} onChange={(e) => updateItem(i, "price", Number(e.target.value))} style={{ ...inputStyle, fontSize: 12 }} placeholder="Цена" /></div>
                    <div className="col-span-2 text-sm font-medium" style={{ color: "#2e7d32", paddingTop: 6 }}>{formatCurrency(item.total)}</div>
                    <div className="col-span-1 flex items-center gap-1">
                      {!delivery && isBottleItem(item) && (
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
                      {/* Доставку убрать нельзя: она автоматически возвращается
                          обратно дефолтной, поэтому крестик у неё не показываем. */}
                      {!delivery && items.length > 1 && <button onClick={() => removeItem(i)} className="text-xs text-red-500 hover:underline">✕</button>}
                    </div>
                  </div>
                </div>
                );
              })}
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

          <div>
            <label style={lblStyle}>Шаблон счёта</label>
            <select
              value={form.template_variant}
              onChange={(e) => setForm({ ...form, template_variant: e.target.value as "standard" | "offer" })}
              style={inputStyle}
            >
              <option value="standard">Простой счёт</option>
              <option value="offer">Счёт-оферта (+ Общие условия на 2-й странице)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button size="sm" onClick={handleCreate} loading={saving} disabled={!form.buyer_name || items.every((i) => isDeliveryItem(i) || !i.name)}>
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
                <div className="flex gap-2 mt-4 flex-wrap">
                  <Button size="sm" onClick={printInvoice}><FileDown size={13} /> Скачать PDF</Button>
                  <Button size="sm" variant="secondary" onClick={startEditInvoice}><Edit2 size={13} /> Редактировать</Button>
                  <Button size="sm" variant="secondary" onClick={duplicateInvoice}><Plus size={13} /> Дублировать</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setPreviewInvoice(null); setEditingInvoice(false); }}>Закрыть</Button>
                </div>
              </>
            ) : (
              <>
                {/* Backlog v6 §3.3/§3.5: metadata fields editable inline. */}
                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  <label className="block">
                    <span className="block text-slate-500 mb-0.5">Номер</span>
                    <input
                      value={editMeta.invoice_number}
                      onChange={(e) => setEditMeta({ ...editMeta, invoice_number: e.target.value })}
                      className="w-full px-2 py-1 rounded focus:outline-none"
                      style={{ border: "1px solid #d0d0d0" }}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-slate-500 mb-0.5">Дата</span>
                    <input
                      type="date"
                      value={editMeta.invoice_date}
                      onChange={(e) => setEditMeta({ ...editMeta, invoice_date: e.target.value })}
                      className="w-full px-2 py-1 rounded focus:outline-none"
                      style={{ border: "1px solid #d0d0d0" }}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-slate-500 mb-0.5">Оплатить до</span>
                    <input
                      type="date"
                      value={editMeta.payment_due}
                      onChange={(e) => setEditMeta({ ...editMeta, payment_due: e.target.value })}
                      className="w-full px-2 py-1 rounded focus:outline-none"
                      style={{ border: "1px solid #d0d0d0" }}
                    />
                  </label>
                  <label className="block col-span-3">
                    <span className="block text-slate-500 mb-0.5">Сделка</span>
                    <SearchableSelect
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      options={(deals as any[]).map((d: { id: string; title: string }) => ({ id: d.id, label: d.title }))}
                      value={editMeta.deal_id}
                      onChange={(id) => setEditMeta({ ...editMeta, deal_id: id })}
                      placeholder="Привязать к сделке…"
                      style={{ border: "1px solid #d0d0d0", borderRadius: 4, padding: "5px 8px", fontSize: 12, width: "100%", outline: "none" }}
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="block text-slate-500 mb-0.5">Основание</span>
                    <input
                      value={editMeta.basis}
                      onChange={(e) => setEditMeta({ ...editMeta, basis: e.target.value })}
                      className="w-full px-2 py-1 rounded focus:outline-none"
                      style={{ border: "1px solid #d0d0d0" }}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-slate-500 mb-0.5">Комментарий</span>
                    <input
                      value={editMeta.comment}
                      onChange={(e) => setEditMeta({ ...editMeta, comment: e.target.value })}
                      className="w-full px-2 py-1 rounded focus:outline-none"
                      style={{ border: "1px solid #d0d0d0" }}
                    />
                  </label>
                </div>
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
                            <button onClick={() => setEditItems(withDeliveryLast(editItems.filter((_, idx) => idx !== i)))} className="p-0.5 hover:bg-red-50 rounded"><Trash2 size={11} className="text-red-400" /></button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button onClick={() => setEditItems(withDeliveryLast([...editItems, { product_id: "", name: "", quantity: 1, unit: "шт", price: 0, total: 0 }]))} className="text-xs mb-3" style={{ color: "#0067a5" }}>+ Добавить строку</button>
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

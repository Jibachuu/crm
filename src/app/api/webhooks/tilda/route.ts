import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Tilda webhook: receives form submissions, creates leads (and, for paid
// orders, immediately creates a won deal so revenue dashboards include
// the sale).
// Configure in Tilda: Form → Data → Webhook URL:
//   https://artevo-crm.ru/api/webhooks/tilda?key=YOUR_KEY

const WEBHOOK_KEY = process.env.TILDA_WEBHOOK_KEY || "";

const KNOWN_NAME_KEYS = ["Name", "name", "FIO", "fio", "Имя", "firstname", "Ваше имя", "Как вас зовут?"];
const KNOWN_PHONE_KEYS = ["Phone", "phone", "Телефон", "tel", "Ваш телефон", "Номер телефона"];
const KNOWN_EMAIL_KEYS = ["Email", "email", "Почта", "Ваш email", "E-mail"];
const KNOWN_COMPANY_KEYS = ["Company", "company", "Компания", "Название компании", "organization"];
const KNOWN_MESSAGE_KEYS = ["Message", "message", "Сообщение", "comment", "Комментарий", "comments"];
const KNOWN_ADDRESS_KEYS = ["Address", "address", "Адрес", "delivery_address", "Адрес доставки", "payment[address]", "payment[delivery_address]"];
const KNOWN_SYSTEM_KEYS = new Set([
  ...KNOWN_NAME_KEYS, ...KNOWN_PHONE_KEYS, ...KNOWN_EMAIL_KEYS, ...KNOWN_COMPANY_KEYS,
  ...KNOWN_MESSAGE_KEYS, ...KNOWN_ADDRESS_KEYS,
  "formname", "formid", "form", "tranid", "page", "tildaspec",
  "secret", "webhook_key", "tilda_key", "TILDA_WEBHOOK_KEY", "api_key",
]);

function pick(body: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = body[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

// Tilda Cart (and «Form Name: Cart») сваливает оплаченный заказ ОДНИМ
// большим текстом в одно поле (часто `Comments`, `Comment`, `Cart`, или
// сразу как тело payment[products][0][name] длинной строкой). Формат
// выглядит так:
//   Order #123456 1. Набор: 2490 (1 x 2490) SKU1, Объём: 300мл …
//   2. Жидкое мыло: 800 (1 x 800) SKU2, … The order is paid for.
//   Shipping address: RU: Point: пр-т Северный … Full name: Иванов И.И.
//   Payment Amount: 3290 RUB Payment ID: Tinkoff Payment: 8498…
//   Name: Анна Email: foo@bar.ru Phone: +79… Form Name: Cart …
//
// Без парсинга это попадало в `КОММЕНТАРИЙ` одной простынёй (см. жалобу
// Жибы 15.05). Парсим по якорным словам и возвращаем сразу набор
// структурированных полей.
type TildaParsed = {
  orderId?: string;
  isPaid?: boolean;
  shippingAddress?: string;
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string;
  paymentAmount?: number;
  paymentId?: string;
  formName?: string;
  products?: Array<{ name: string; quantity: number; price: number; amount: number; sku?: string; attributes?: string }>;
};
function parseTildaBlob(text: string): TildaParsed | null {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // Маркеры — без хотя бы одного парсить не пытаемся.
  const hasOrder = /Order\s*#\s*\d+/i.test(t);
  const hasPayment = /Payment\s*(Amount|ID)\s*:/i.test(t);
  const hasFullName = /Full\s*name\s*:/i.test(t);
  if (!hasOrder && !hasPayment && !hasFullName) return null;

  const out: TildaParsed = {};

  const mOrder = t.match(/Order\s*#\s*(\d+)/i);
  if (mOrder) out.orderId = mOrder[1];

  out.isPaid = /The order is paid for\./i.test(t) || /paid for\b/i.test(t);

  const grab = (label: RegExp, stopWords: string[]): string => {
    const stops = stopWords.map((s) => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("|");
    const re = new RegExp(label.source + "\\s*(.+?)(?=\\s+(?:" + stops + ")\\s*:|$)", "i");
    const m = t.match(re);
    return m ? m[1].trim().replace(/[\s-]+$/, "") : "";
  };
  const STOPS = ["Order #", "Full name", "Payment Amount", "Payment ID", "Purchaser information", "Additional information", "Block ID", "Transaction ID", "Form Name", "Name", "Email", "Phone", "Shipping address", "The order"];

  const shipping = grab(/Shipping\s+address\s*:/i, STOPS);
  if (shipping) out.shippingAddress = shipping;
  const fullName = grab(/Full\s+name\s*:/i, STOPS);
  if (fullName) out.fullName = fullName;
  const name = grab(/(?<!Full\s)Name\s*:/i, STOPS);
  if (name) out.name = name;
  const email = (t.match(/Email\s*:\s*(\S+@\S+\.[A-Za-z0-9]+)/i) || [])[1] || "";
  if (email) out.email = email;
  const phone = (t.match(/Phone\s*:\s*(\+?[\d\s\-()]{7,})/i) || [])[1]?.trim() || "";
  if (phone) out.phone = phone;
  const amount = (t.match(/Payment\s+Amount\s*:\s*([\d\s.,]+)\s*([A-Za-zА-Яа-я]+)?/i) || [])[1];
  if (amount) {
    const n = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) out.paymentAmount = n;
  }
  const payId = grab(/Payment\s+ID\s*:/i, STOPS);
  if (payId) out.paymentId = payId;
  const formName = grab(/Form\s+Name\s*:/i, STOPS);
  if (formName) out.formName = formName.replace(/-+$/, "").trim();

  // Парсинг товаров: «1. Имя: 2490 (1 x 2490) SKU, доп. атрибуты»
  // Граница между позициями — следующее «N. » или ключевое слово.
  const productRe = /(\d+)\.\s+(.+?):\s*([\d\s.,]+)\s*\((\d+)\s*x\s*([\d\s.,]+)\)\s*([A-Za-z0-9_\-/]+)?(?:,\s*([^]*?))?(?=\s+\d+\.\s|\s+(?:The order|Shipping address|Full name|Payment|Purchaser|Additional|Block|Transaction|Form Name)\s*:|$)/g;
  const products: TildaParsed["products"] = [];
  let m: RegExpExecArray | null;
  while ((m = productRe.exec(t)) !== null) {
    const total = Number(m[3].replace(/\s/g, "").replace(",", "."));
    const qty = Number(m[4]);
    const price = Number(m[5].replace(/\s/g, "").replace(",", "."));
    products.push({
      name: m[2].trim(),
      quantity: Number.isFinite(qty) ? qty : 1,
      price: Number.isFinite(price) ? price : 0,
      amount: Number.isFinite(total) ? total : price * qty,
      sku: m[6]?.trim() || undefined,
      attributes: m[7]?.trim() || undefined,
    });
  }
  if (products.length > 0) out.products = products;

  return out;
}

export async function POST(req: NextRequest) {
  const admin = createAdminClient();

  let body: Record<string, string>;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    body = await req.json();
  } else {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  }

  // Auth (unchanged from prior version) — supports query/header/body keys
  if (WEBHOOK_KEY) {
    const { searchParams } = new URL(req.url);
    const keyParam = searchParams.get("key") || "";
    const keyHeader = req.headers.get("x-webhook-key") || "";
    const keyBody = body["secret"] || body["webhook_key"] || body["tilda_key"] || body["TILDA_WEBHOOK_KEY"] || body["api_key"] || "";
    if (keyParam !== WEBHOOK_KEY && keyHeader !== WEBHOOK_KEY && keyBody !== WEBHOOK_KEY) {
      console.warn("[TILDA] Rejected: key mismatch.");
      return NextResponse.json({ error: "Invalid webhook key" }, { status: 403 });
    }
  }

  console.log("[TILDA] Received fields:", JSON.stringify(body));

  // Extract structured fields
  let name = pick(body, KNOWN_NAME_KEYS);
  let phone = pick(body, KNOWN_PHONE_KEYS);
  let email = pick(body, KNOWN_EMAIL_KEYS);
  const company = pick(body, KNOWN_COMPANY_KEYS);
  const messageRaw = pick(body, KNOWN_MESSAGE_KEYS);
  let address = pick(body, KNOWN_ADDRESS_KEYS);
  let formName = body.formname || body.formid || body.form || "";
  const pageUrl = body.tranid || body.page || body.referer || "";

  // Tilda Cart часто сваливает всю информацию о заказе одной строкой в
  // поле комментария. Пытаемся распарсить её на структурные поля и
  // подкрутить КОНТАКТ/АДРЕС/ОПЛАТА секции этими данными.
  let blobOrderId = "";
  let blobAmount = 0;
  let blobPaymentId = "";
  let blobIsPaid = false;
  let blobProducts: Array<{ name: string; quantity: number; price: number; amount: number; sku?: string; attributes?: string }> = [];
  let cleanMessage = messageRaw;
  // Иногда блоб не в message — пробуем все длинные значения
  const blobCandidates = [messageRaw, ...Object.values(body).filter((v) => typeof v === "string" && v.length > 80)];
  for (const candidate of blobCandidates) {
    const parsed = parseTildaBlob(candidate);
    if (parsed) {
      blobOrderId = parsed.orderId || "";
      blobIsPaid = !!parsed.isPaid;
      blobAmount = parsed.paymentAmount || 0;
      blobPaymentId = parsed.paymentId || "";
      blobProducts = parsed.products || [];
      if (parsed.shippingAddress && !address) address = parsed.shippingAddress;
      if (parsed.fullName && !name) name = parsed.fullName;
      else if (parsed.name && !name) name = parsed.name;
      if (parsed.email && !email) email = parsed.email;
      if (parsed.phone && !phone) phone = parsed.phone;
      if (parsed.formName && !formName) formName = parsed.formName;
      // Если из блоба удалось извлечь основные поля — НЕ кидаем оригинал
      // в КОММЕНТАРИЙ, чтобы не дублировать.
      if (candidate === messageRaw) cleanMessage = "";
      break;
    }
  }

  // Fallback fishing for contact data in arbitrary fields
  const allValues = Object.values(body).filter((v) => typeof v === "string" && v.length > 1) as string[];
  const anyPhone = allValues.find((v) => /^[+\d\s\-()]{7,}$/.test(v)) || "";
  const anyEmail = allValues.find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || "";
  const anyName = !name && !anyPhone && !anyEmail ? allValues[0] || "" : "";

  const finalName = name || anyName;
  const finalPhone = phone || anyPhone;
  const finalEmail = email || anyEmail;

  if (!finalName && !finalPhone && !finalEmail) {
    return NextResponse.json({ ok: true, skipped: true, reason: "No contact data", receivedFields: Object.keys(body) });
  }

  // Detect paid order — Tilda payment webhook posts payment[orderid] etc.,
  // плюс если блоб сказал «The order is paid for.» — тоже считаем.
  const orderId = body["payment[orderid]"] || body["payment[order]"] || blobOrderId || "";
  const paidAmountStr = body["payment[amount]"] || body["payment[sum]"] || body["amount"] || "";
  const paidAmountFields = Number(String(paidAmountStr).replace(/[^\d.,]/g, "").replace(",", "."));
  const paidAmount = Number.isFinite(paidAmountFields) && paidAmountFields > 0 ? paidAmountFields : blobAmount;
  const paymentSys = body["payment[sys]"] || body["payment[system]"] || "";
  const promocode = body["payment[promocode]"] || "";
  const isPaidOrder = !!orderId || (Number.isFinite(paidAmount) && paidAmount > 0) || !!paymentSys || blobIsPaid;

  // Parse products array from Tilda cart payload — сперва берём
  // структурированные payment[products][N], если их нет — используем
  // продукты из распарсенного блоба (Cart-форма).
  type IncomingProduct = { name: string; quantity: number; price: number; amount: number; sku?: string; attributes?: string };
  const products: IncomingProduct[] = [];
  for (let i = 0; i < 50; i++) {
    const pName = body[`payment[products][${i}][name]`] || body[`products[${i}][name]`];
    if (!pName) break;
    const qty = Number(body[`payment[products][${i}][quantity]`] || body[`products[${i}][quantity]`] || 1);
    const price = Number(body[`payment[products][${i}][price]`] || body[`products[${i}][price]`] || 0);
    const amount = Number(body[`payment[products][${i}][amount]`] || body[`products[${i}][amount]`] || price * qty);
    // Tilda иногда даёт sku/external_id в товаре. Названия мусорные у
    // длинных позиций («Набор из жидкого мыла и крема»), а артикул
    // (NKS3001) — стабильный, поэтому матчим в первую очередь по нему.
    const sku = body[`payment[products][${i}][sku]`]
      || body[`payment[products][${i}][external_id]`]
      || body[`products[${i}][sku]`]
      || body[`products[${i}][external_id]`]
      || "";
    products.push({ name: String(pName), quantity: qty, price, amount, sku: sku || undefined });
  }
  if (products.length === 0 && blobProducts.length > 0) {
    products.push(...blobProducts);
  }

  // Get admin user for created_by
  const { data: adminUser } = await admin.from("users").select("id").eq("role", "admin").limit(1).single();
  const adminId = adminUser?.id;

  // Contact dedup by email → phone (suffix match), enrich-only never overwrite
  let contactId: string | null = null;
  if (finalEmail) {
    const { data } = await admin.from("contacts").select("id").ilike("email", finalEmail).limit(1).single();
    if (data) contactId = data.id;
  }
  if (!contactId && finalPhone) {
    const cleanPhone = finalPhone.replace(/\D/g, "");
    const suffix = cleanPhone.slice(-10);
    if (suffix.length >= 7) {
      const { data } = await admin.from("contacts").select("id, phone")
        .or(`phone.ilike.%${suffix},phone_mobile.ilike.%${suffix}`)
        .limit(1).single();
      if (data) contactId = data.id;
    }
  }

  if (!contactId) {
    const { data: newContact } = await admin.from("contacts").insert({
      full_name: finalName || finalEmail || finalPhone,
      phone: finalPhone || null,
      email: finalEmail || null,
      created_by: adminId,
    }).select("id").single();
    contactId = newContact?.id ?? null;
  } else {
    const { data: existing } = await admin.from("contacts").select("full_name, phone, email").eq("id", contactId).single();
    if (existing) {
      const updates: Record<string, string> = {};
      if (finalPhone && !existing.phone) updates.phone = finalPhone;
      if (finalEmail && !existing.email) updates.email = finalEmail;
      if (finalName && (!existing.full_name || /^\d+$/.test(existing.full_name.trim()))) updates.full_name = finalName;
      if (Object.keys(updates).length > 0) {
        await admin.from("contacts").update(updates).eq("id", contactId);
      }
    }
  }

  // Company dedup
  let companyId: string | null = null;
  if (company) {
    const { data: existing } = await admin.from("companies").select("id").ilike("name", company).limit(1).single();
    if (existing) {
      companyId = existing.id;
    } else {
      const { data: newCompany } = await admin.from("companies").insert({ name: company, created_by: adminId }).select("id").single();
      companyId = newCompany?.id ?? null;
    }
  }

  // Default lead funnel + first stage
  const { data: leadFunnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
  let leadStageId: string | null = null;
  if (leadFunnel) {
    const { data: stage } = await admin.from("funnel_stages").select("id").eq("funnel_id", leadFunnel.id).order("sort_order").limit(1).single();
    leadStageId = stage?.id ?? null;
  }

  // Сопоставляем товары с каталогом ДО построения описания, чтобы
  // отметить непривязанные позиции значком ⚠️ в секции ЗАКАЗ — менеджер
  // сразу видит, что нужно добавить руками. SKU > имя > ничего.
  type Resolved = { p: IncomingProduct; productId: string | null };
  const resolved: Resolved[] = [];
  for (const p of products) {
    let productId: string | null = null;
    if (p.sku) {
      const { data } = await admin.from("products").select("id").eq("sku", p.sku).maybeSingle();
      productId = data?.id ?? null;
    }
    if (!productId && p.name) {
      const { data } = await admin.from("products").select("id").ilike("name", `%${p.name}%`).limit(1).maybeSingle();
      productId = data?.id ?? null;
    }
    resolved.push({ p, productId });
  }
  const unmatched = resolved.filter((r) => !r.productId);

  // Build structured lead description — one section per type, blank line
  // between sections. Backlog v6 §1.7 (new ask 14.05) — Рустем жаловался,
  // что описание лида с Tilda превращается в неразборчивую простыню. Раньше
  // в description сваливался комментарий + всё подряд + сырой dump. Теперь
  // делаем секции и убираем raw-dump (его всё равно можно посмотреть в
  // логах crm-app или в Tilda).
  const sections: string[] = [];

  const contactLines: string[] = [];
  if (finalName) contactLines.push(`👤 ${finalName}`);
  if (finalPhone) contactLines.push(`📞 ${finalPhone}`);
  if (finalEmail) contactLines.push(`✉️ ${finalEmail}`);
  if (company) contactLines.push(`🏢 ${company}`);
  if (contactLines.length > 0) sections.push(`КОНТАКТ\n${contactLines.join("\n")}`);

  if (address) sections.push(`АДРЕС ДОСТАВКИ\n${address}`);

  if (cleanMessage) sections.push(`КОММЕНТАРИЙ\n${cleanMessage}`);

  if (resolved.length > 0) {
    const productLines = resolved.map((r, i) => {
      const mark = r.productId ? "" : " ⚠️ нет в каталоге";
      const header = `${i + 1}. ${r.p.name}${r.p.sku ? ` (арт. ${r.p.sku})` : ""}${mark} — ${r.p.quantity} шт × ${r.p.price} ₽ = ${r.p.amount} ₽`;
      return r.p.attributes ? `${header}\n   ${r.p.attributes}` : header;
    });
    const total = resolved.reduce((s, r) => s + r.p.amount, 0);
    const footer = unmatched.length > 0
      ? `────────\nИтого: ${total} ₽\n\n⚠️ ${unmatched.length} позиц${unmatched.length === 1 ? "ия" : "ий"} не нашлись в каталоге — добавьте товары в /products чтобы они автоматом подцеплялись в будущем.`
      : `────────\nИтого: ${total} ₽`;
    sections.push(`ЗАКАЗ\n${productLines.join("\n")}\n${footer}`);
  }

  if (isPaidOrder) {
    const payLines: string[] = ["✅ ОПЛАЧЕНО"];
    if (orderId) payLines.push(`Номер заказа: ${orderId}`);
    if (Number.isFinite(paidAmount) && paidAmount > 0) payLines.push(`Сумма: ${paidAmount.toFixed(0)} ₽`);
    if (paymentSys) payLines.push(`Платёжная система: ${paymentSys}`);
    if (blobPaymentId) payLines.push(`Payment ID: ${blobPaymentId}`);
    if (promocode) payLines.push(`Промокод: ${promocode}`);
    sections.push(payLines.join("\n"));
  }

  const sourceLines: string[] = [];
  if (formName) sourceLines.push(`Форма: ${formName}`);
  if (pageUrl) sourceLines.push(`Страница: ${pageUrl}`);
  if (sourceLines.length > 0) sections.push(`ИСТОЧНИК\n${sourceLines.join("\n")}`);

  // Extra fields that aren't covered above — keep them visible but
  // structured (one per line), not as a raw urlencoded dump.
  const extraEntries = Object.entries(body)
    .filter(([k]) =>
      !KNOWN_SYSTEM_KEYS.has(k) &&
      !k.startsWith("payment[") &&
      !k.startsWith("products[") &&
      !/^utm_/.test(k) &&
      !/^cookies/i.test(k) &&
      !/^trantoken|tildaspec/i.test(k)
    );
  if (extraEntries.length > 0) {
    const extraLines = extraEntries.map(([k, v]) => `${k}: ${v}`);
    sections.push(`ДОПОЛНИТЕЛЬНО\n${extraLines.join("\n")}`);
  }

  const description = sections.join("\n\n");

  const leadTitle = isPaidOrder
    ? `Оплачено: ${finalName || finalEmail || finalPhone}${orderId ? ` (№${orderId})` : ""}${Number.isFinite(paidAmount) && paidAmount > 0 ? ` — ${paidAmount.toFixed(0)} ₽` : ""}`
    : `Заявка с сайта: ${finalName || finalEmail || finalPhone}`;

  // Create lead. Paid orders skip qualification and go straight to
  // 'converted' (with a deal attached below). Form-only stays 'new'.
  const { data: lead, error: leadErr } = await admin.from("leads").insert({
    title: leadTitle,
    source: isPaidOrder ? "tilda_paid" : "website",
    status: isPaidOrder ? "converted" : "new",
    description,
    contact_id: contactId,
    company_id: companyId,
    funnel_id: leadFunnel?.id ?? null,
    stage_id: leadStageId,
    created_by: adminId,
  }).select("id").single();

  if (leadErr) {
    return NextResponse.json({ error: leadErr.message }, { status: 500 });
  }

  // lead_products принимает NULL product_id (см. existing schema), так что
  // непривязанные позиции тоже сохраняются как пользовательский ввод.
  if (lead?.id && resolved.length > 0) {
    for (const r of resolved) {
      await admin.from("lead_products").insert({
        lead_id: lead.id,
        product_id: r.productId,
        quantity: r.p.quantity || 1,
        unit_price: r.p.price,
        total_price: r.p.amount,
        product_block: "request",
      });
    }
  }

  // For PAID orders — also create a won deal so revenue dashboards and
  // sales reports include the sale immediately. Don't wait for someone
  // to manually "конвертировать" the lead.
  let dealId: string | null = null;
  if (isPaidOrder && lead?.id) {
    const { data: dealFunnel } = await admin.from("funnels").select("id").eq("type", "deal").eq("is_default", true).maybeSingle();
    let dealFunnelId: string | null = dealFunnel?.id ?? null;
    if (!dealFunnelId) {
      const { data: anyFunnel } = await admin.from("funnels").select("id").eq("type", "deal").order("created_at", { ascending: true }).limit(1).maybeSingle();
      dealFunnelId = anyFunnel?.id ?? null;
    }
    let wonStageId: string | null = null;
    if (dealFunnelId) {
      // Pick the success stage (is_success=true) — usually "Выиграна".
      // Fallback: by slug or by last sort_order.
      const { data: wonStage } = await admin.from("funnel_stages")
        .select("id")
        .eq("funnel_id", dealFunnelId)
        .eq("is_success", true)
        .limit(1).maybeSingle();
      if (wonStage) wonStageId = wonStage.id;
      else {
        const { data: bySlug } = await admin.from("funnel_stages")
          .select("id")
          .eq("funnel_id", dealFunnelId)
          .eq("slug", "won")
          .limit(1).maybeSingle();
        wonStageId = bySlug?.id ?? null;
      }
    }

    const { data: deal, error: dealErr } = await admin.from("deals").insert({
      title: leadTitle,
      contact_id: contactId,
      company_id: companyId,
      source: "tilda_paid",
      stage: "won",
      stage_id: wonStageId,
      funnel_id: dealFunnelId,
      amount: Number.isFinite(paidAmount) && paidAmount > 0 ? paidAmount : null,
      description,
      created_by: adminId,
      closed_at: new Date().toISOString(),
    }).select("id").single();

    if (!dealErr && deal) {
      dealId = deal.id;
      // deal_products.product_id is NOT NULL — кладём только те позиции
      // что удалось привязать к каталогу. Несопоставимые остаются в
      // lead_products + видны в секции «ЗАКАЗ» описания.
      const insertable = resolved.filter((r) => r.productId);
      if (insertable.length > 0) {
        // kind не передаём — у колонки DEFAULT 'purchase' (миграция v82),
        // а если v82 ещё не накатили — колонки нет и любое значение
        // вызовет 42703.
        await admin.from("deal_products").insert(
          insertable.map((r) => ({
            deal_id: deal.id,
            product_id: r.productId as string,
            quantity: r.p.quantity || 1,
            unit_price: r.p.price,
            total_price: r.p.amount,
            product_block: "order",
          }))
        );
      }
      if (unmatched.length > 0) {
        console.warn(`[TILDA] ${unmatched.length} позиций не привязаны к каталогу:`, unmatched.map((u) => u.p.sku || u.p.name).join(", "));
      }
    } else if (dealErr) {
      console.error("[TILDA] Failed to create won deal:", dealErr.message);
    }
  }

  return NextResponse.json({
    ok: true,
    lead_id: lead?.id,
    deal_id: dealId,
    contact_id: contactId,
    paid_order: isPaidOrder,
    order_id: orderId || null,
    amount: Number.isFinite(paidAmount) && paidAmount > 0 ? paidAmount : null,
  });
}

// Accept GET for Tilda test pings
export async function GET() {
  return NextResponse.json({ status: "ok", webhook: "tilda" });
}

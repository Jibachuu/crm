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
  const name = pick(body, KNOWN_NAME_KEYS);
  const phone = pick(body, KNOWN_PHONE_KEYS);
  const email = pick(body, KNOWN_EMAIL_KEYS);
  const company = pick(body, KNOWN_COMPANY_KEYS);
  const message = pick(body, KNOWN_MESSAGE_KEYS);
  const address = pick(body, KNOWN_ADDRESS_KEYS);
  const formName = body.formname || body.formid || body.form || "";
  const pageUrl = body.tranid || body.page || body.referer || "";

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

  // Detect paid order — Tilda payment webhook posts payment[orderid] etc.
  const orderId = body["payment[orderid]"] || body["payment[order]"] || "";
  const paidAmountStr = body["payment[amount]"] || body["payment[sum]"] || body["amount"] || "";
  const paidAmount = Number(String(paidAmountStr).replace(/[^\d.,]/g, "").replace(",", "."));
  const paymentSys = body["payment[sys]"] || body["payment[system]"] || "";
  const promocode = body["payment[promocode]"] || "";
  const isPaidOrder = !!orderId || (Number.isFinite(paidAmount) && paidAmount > 0) || !!paymentSys;

  // Parse products array from Tilda cart payload
  type IncomingProduct = { name: string; quantity: number; price: number; amount: number };
  const products: IncomingProduct[] = [];
  for (let i = 0; i < 50; i++) {
    const pName = body[`payment[products][${i}][name]`] || body[`products[${i}][name]`];
    if (!pName) break;
    const qty = Number(body[`payment[products][${i}][quantity]`] || body[`products[${i}][quantity]`] || 1);
    const price = Number(body[`payment[products][${i}][price]`] || body[`products[${i}][price]`] || 0);
    const amount = Number(body[`payment[products][${i}][amount]`] || body[`products[${i}][amount]`] || price * qty);
    products.push({ name: String(pName), quantity: qty, price, amount });
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

  if (message) sections.push(`КОММЕНТАРИЙ\n${message}`);

  if (products.length > 0) {
    const productLines = products.map((p, i) =>
      `${i + 1}. ${p.name} — ${p.quantity} шт × ${p.price} ₽ = ${p.amount} ₽`
    );
    const total = products.reduce((s, p) => s + p.amount, 0);
    sections.push(`ЗАКАЗ\n${productLines.join("\n")}\n────────\nИтого: ${total} ₽`);
  }

  if (isPaidOrder) {
    const payLines: string[] = ["✅ ОПЛАЧЕНО"];
    if (orderId) payLines.push(`Номер заказа: ${orderId}`);
    if (Number.isFinite(paidAmount) && paidAmount > 0) payLines.push(`Сумма: ${paidAmount.toFixed(0)} ₽`);
    if (paymentSys) payLines.push(`Платёжная система: ${paymentSys}`);
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

  // Persist products to lead_products so the lead detail page shows them
  if (lead?.id && products.length > 0) {
    for (const p of products) {
      // Try resolve to a catalog product by fuzzy name match
      const { data: dbProduct } = await admin.from("products").select("id").ilike("name", `%${p.name}%`).limit(1).single();
      await admin.from("lead_products").insert({
        lead_id: lead.id,
        product_id: dbProduct?.id ?? null,
        quantity: p.quantity || 1,
        unit_price: p.price,
        total_price: p.amount,
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
      // Copy products from lead_products → deal_products so the won deal
      // carries the same line items (and shows up in revenue per product
      // reports). Resolve product_id where possible.
      if (products.length > 0) {
        for (const p of products) {
          const { data: dbProduct } = await admin.from("products").select("id").ilike("name", `%${p.name}%`).limit(1).single();
          // deal_products.product_id is NOT NULL — only insert if matched.
          if (dbProduct?.id) {
            await admin.from("deal_products").insert({
              deal_id: deal.id,
              product_id: dbProduct.id,
              quantity: p.quantity || 1,
              unit_price: p.price,
              total_price: p.amount,
              product_block: "order",
            });
          }
        }
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

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Tilda webhook: receives form submissions, creates leads
// Configure in Tilda: Form → Data → Webhook URL:
//   https://crm-six-teal.vercel.app/api/webhooks/tilda?key=YOUR_KEY
// Set TILDA_WEBHOOK_KEY in Vercel env vars

const WEBHOOK_KEY = process.env.TILDA_WEBHOOK_KEY || "";

export async function POST(req: NextRequest) {
  const admin = createAdminClient();

  let body: Record<string, string>;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    body = await req.json();
  } else {
    // Tilda sends form-urlencoded
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  }

  // Auth: check key from query param, header, or POST body
  // Skip auth if TILDA_WEBHOOK_KEY env not set
  if (WEBHOOK_KEY) {
    const { searchParams } = new URL(req.url);
    const keyParam = searchParams.get("key") || "";
    const keyHeader = req.headers.get("x-webhook-key") || "";
    const keyBody = body["TILDA_WEBHOOK_KEY"] || body["api_key"] || "";
    if (keyParam !== WEBHOOK_KEY && keyHeader !== WEBHOOK_KEY && keyBody !== WEBHOOK_KEY) {
      return NextResponse.json({ error: "Invalid webhook key" }, { status: 403 });
    }
  }

  // Log all received fields for debugging — save to DB for inspection
  console.log("[TILDA] Received fields:", JSON.stringify(body));
  // Store raw webhook data in lead description for debugging
  const rawData = Object.entries(body).map(([k, v]) => `${k}: ${v}`).join("\n");

  // Extract fields — Tilda uses various naming conventions
  const name = body.Name || body.name || body.FIO || body.fio || body["Имя"] || body.firstname || body["Ваше имя"] || body["Как вас зовут?"] || "";
  const phone = body.Phone || body.phone || body["Телефон"] || body.tel || body["Ваш телефон"] || body["Номер телефона"] || "";
  const email = body.Email || body.email || body["Почта"] || body["Ваш email"] || body["E-mail"] || "";
  const company = body.Company || body.company || body["Компания"] || body["Название компании"] || "";
  const message = body.Message || body.message || body["Сообщение"] || body.comment || body["Комментарий"] || "";
  const source = body.formname || body.formid || body.form || "tilda";
  const pageUrl = body.tranid || body.page || "";

  // If no recognized fields, try to extract from any field that looks like contact data
  const allValues = Object.values(body).filter((v) => typeof v === "string" && v.length > 1) as string[];
  const anyPhone = allValues.find((v) => /^[\+\d\s\-\(\)]{7,}$/.test(v)) || "";
  const anyEmail = allValues.find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || "";
  const anyName = !name && !anyPhone && !anyEmail ? allValues[0] || "" : "";

  const finalName = name || anyName;
  const finalPhone = phone || anyPhone;
  const finalEmail = email || anyEmail;

  if (!finalName && !finalPhone && !finalEmail) {
    // Return 200 even for empty data (Tilda test pings) — otherwise Tilda marks webhook as broken
    return NextResponse.json({ ok: true, skipped: true, reason: "No contact data", receivedFields: Object.keys(body) });
  }

  // Get admin user for created_by
  const { data: adminUser } = await admin.from("users").select("id").eq("role", "admin").limit(1).single();
  const adminId = adminUser?.id;

  // Check if contact already exists by phone or email
  let contactId: string | null = null;
  if (finalEmail) {
    const { data } = await admin.from("contacts").select("id").ilike("email", finalEmail).limit(1).single();
    if (data) contactId = data.id;
  }
  if (!contactId && finalPhone) {
    const cleanPhone = finalPhone.replace(/\D/g, "");
    if (cleanPhone.length >= 7) {
      const { data } = await admin.from("contacts").select("id").ilike("phone", `%${cleanPhone.slice(-10)}%`).limit(1).single();
      if (data) contactId = data.id;
    }
  }

  // Create or update contact
  if (!contactId) {
    const { data: newContact } = await admin.from("contacts").insert({
      full_name: finalName || finalEmail || finalPhone,
      phone: finalPhone || null,
      email: finalEmail || null,
      created_by: adminId,
    }).select("id").single();
    contactId = newContact?.id ?? null;
  } else {
    // Update existing contact with missing data
    const updates: Record<string, string> = {};
    if (finalPhone) updates.phone = finalPhone;
    if (finalEmail) updates.email = finalEmail;
    if (finalName) updates.full_name = finalName;
    if (Object.keys(updates).length > 0) {
      await admin.from("contacts").update(updates).eq("id", contactId).is("phone", null);
      // Also update name/email if missing
      if (finalEmail) await admin.from("contacts").update({ email: finalEmail }).eq("id", contactId).is("email", null);
      if (finalName) await admin.from("contacts").update({ full_name: finalName }).eq("id", contactId);
    }
  }

  // Create company if provided
  let companyId: string | null = null;
  if (company) {
    const { data: existing } = await admin.from("companies").select("id").ilike("name", company).limit(1).single();
    if (existing) {
      companyId = existing.id;
    } else {
      const { data: newCompany } = await admin.from("companies").insert({
        name: company,
        created_by: adminId,
      }).select("id").single();
      companyId = newCompany?.id ?? null;
    }
  }

  // Get default funnel + first stage
  const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
  let stageId: string | null = null;
  if (funnel) {
    const { data: stage } = await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single();
    stageId = stage?.id ?? null;
  }

  // Create lead
  const leadTitle = `Заявка с сайта: ${finalName || finalEmail || finalPhone}`;
  const { data: lead, error } = await admin.from("leads").insert({
    title: leadTitle,
    source: "website",
    status: "new",
    description: [message, pageUrl ? `Страница: ${pageUrl}` : "", `Форма: ${source}`, `\n--- Сырые данные ---\n${rawData}`].filter(Boolean).join("\n"),
    contact_id: contactId,
    company_id: companyId,
    funnel_id: funnel?.id ?? null,
    stage_id: stageId,
    created_by: adminId,
  }).select("id").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Parse Tilda products/cart data and add to lead_products
  // Tilda sends: payment[products][0][name], payment[products][0][quantity], payment[products][0][price], payment[products][0][amount]
  if (lead?.id) {
    const products: { name: string; quantity: number; price: number }[] = [];
    // Try array format
    for (let i = 0; i < 20; i++) {
      const pName = body[`payment[products][${i}][name]`] || body[`products[${i}][name]`];
      if (!pName) break;
      const qty = Number(body[`payment[products][${i}][quantity]`] || body[`products[${i}][quantity]`] || 1);
      const price = Number(body[`payment[products][${i}][price]`] || body[`products[${i}][price]`] || 0);
      products.push({ name: pName, quantity: qty, price });
    }

    for (const p of products) {
      // Try to find product in DB by name
      const { data: dbProduct } = await admin.from("products").select("id").ilike("name", `%${p.name}%`).limit(1).single();
      await admin.from("lead_products").insert({
        lead_id: lead.id,
        product_id: dbProduct?.id ?? null,
        quantity: p.quantity || 1,
        unit_price: p.price,
        total_price: p.price * (p.quantity || 1),
        product_block: "request",
      });
    }
  }

  return NextResponse.json({ ok: true, lead_id: lead?.id, contact_id: contactId, products_count: 0 });
}

// Also accept GET for Tilda test pings
export async function GET() {
  return NextResponse.json({ status: "ok", webhook: "tilda" });
}

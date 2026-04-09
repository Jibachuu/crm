import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Tilda webhook: receives form submissions, creates leads
// Configure in Tilda: Form → Data → Webhook URL:
//   https://crm-six-teal.vercel.app/api/webhooks/tilda?key=YOUR_KEY
// Set TILDA_WEBHOOK_KEY in Vercel env vars

const WEBHOOK_KEY = process.env.TILDA_WEBHOOK_KEY || "";

export async function POST(req: NextRequest) {
  // Auth: check key from query param or header
  const { searchParams } = new URL(req.url);
  const keyParam = searchParams.get("key") || "";
  const keyHeader = req.headers.get("x-webhook-key") || "";

  if (WEBHOOK_KEY && keyParam !== WEBHOOK_KEY && keyHeader !== WEBHOOK_KEY) {
    return NextResponse.json({ error: "Invalid webhook key" }, { status: 403 });
  }

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

  // Log all received fields for debugging
  console.log("[TILDA] Received fields:", JSON.stringify(body));

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
    return NextResponse.json({ error: "No contact data", receivedFields: Object.keys(body) }, { status: 400 });
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

  // Create contact if not found
  if (!contactId) {
    const { data: newContact } = await admin.from("contacts").insert({
      full_name: finalName || finalEmail || finalPhone,
      phone: finalPhone || null,
      email: finalEmail || null,
      created_by: adminId,
    }).select("id").single();
    contactId = newContact?.id ?? null;
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
    description: [message, pageUrl ? `Страница: ${pageUrl}` : "", `Форма: ${source}`].filter(Boolean).join("\n"),
    contact_id: contactId,
    company_id: companyId,
    funnel_id: funnel?.id ?? null,
    stage_id: stageId,
    created_by: adminId,
  }).select("id").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lead_id: lead?.id, contact_id: contactId });
}

// Also accept GET for Tilda test pings
export async function GET() {
  return NextResponse.json({ status: "ok", webhook: "tilda" });
}

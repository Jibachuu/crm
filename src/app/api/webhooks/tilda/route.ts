import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Tilda webhook: receives form submissions, creates leads
// Configure in Tilda: Form → Data → Webhook URL → https://crm-six-teal.vercel.app/api/webhooks/tilda

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

  // Extract fields (Tilda field names vary, try common ones)
  const name = body.Name || body.name || body.FIO || body.fio || body["Имя"] || body.firstname || "";
  const phone = body.Phone || body.phone || body["Телефон"] || body.tel || "";
  const email = body.Email || body.email || body["Почта"] || "";
  const company = body.Company || body.company || body["Компания"] || "";
  const message = body.Message || body.message || body["Сообщение"] || body.comment || "";
  const source = body.formname || body.formid || body.form || "tilda";
  const pageUrl = body.tranid || body.page || "";

  if (!name && !phone && !email) {
    return NextResponse.json({ error: "No contact data" }, { status: 400 });
  }

  // Get admin user for created_by
  const { data: adminUser } = await admin.from("users").select("id").eq("role", "admin").limit(1).single();
  const adminId = adminUser?.id;

  // Check if contact already exists by phone or email
  let contactId: string | null = null;
  if (email) {
    const { data } = await admin.from("contacts").select("id").ilike("email", email).limit(1).single();
    if (data) contactId = data.id;
  }
  if (!contactId && phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    const { data } = await admin.from("contacts").select("id").ilike("phone", `%${cleanPhone.slice(-10)}%`).limit(1).single();
    if (data) contactId = data.id;
  }

  // Create contact if not found
  if (!contactId) {
    const { data: newContact } = await admin.from("contacts").insert({
      full_name: name || email || phone,
      phone: phone || null,
      email: email || null,
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
  const leadTitle = `Заявка с сайта: ${name || email || phone}`;
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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function verifyZadarmaSignature(params: URLSearchParams, secret: string): boolean {
  const paramsStr = Array.from(params.entries())
    .filter(([k]) => k !== "sign")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const hash = crypto.createHash("md5").update(paramsStr + secret).digest("hex");
  return hash === params.get("sign");
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params = new URLSearchParams();
  formData.forEach((v, k) => params.set(k, String(v)));

  const secret = process.env.ZADARMA_SECRET_KEY ?? "";
  if (secret && !verifyZadarmaSignature(params, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const event = params.get("event");
  const callId = params.get("call_id") ?? params.get("pbx_call_id");
  const callerNum = params.get("caller_id");
  const destination = params.get("destination");
  const duration = params.get("duration");

  const supabase = await createClient();

  if (event === "NOTIFY_END") {
    // Try to match caller/destination phone to a CRM contact
    const phoneToMatch = callerNum || destination || "";
    const cleanPhone = phoneToMatch.replace(/\D/g, "");
    let contactId: string | null = null;
    let companyId: string | null = null;

    if (cleanPhone.length >= 7) {
      // Search by phone, phone_mobile, phone_other (fuzzy match last 10 digits)
      const phoneSuffix = cleanPhone.slice(-10);
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, company_id")
        .or(`phone.ilike.%${phoneSuffix},phone_mobile.ilike.%${phoneSuffix},phone_other.ilike.%${phoneSuffix}`)
        .limit(1);
      if (contacts?.[0]) {
        contactId = contacts[0].id;
        companyId = contacts[0].company_id || null;
      }
    }

    // Call ended — log to communications
    await supabase.from("communications").insert({
      entity_type: contactId ? "contact" : "contact",
      entity_id: contactId || "00000000-0000-0000-0000-000000000000",
      contact_id: contactId,
      company_id: companyId,
      channel: "phone",
      direction: callerNum ? "inbound" : "outbound",
      subject: `Звонок ${callerNum ?? destination}`,
      body: `Продолжительность: ${duration ?? 0} сек.`,
      from_address: callerNum ?? "",
      to_address: destination ?? "",
      duration_seconds: duration ? Number(duration) : null,
      external_id: callId,
    });
  }

  if (event === "NOTIFY_RECORD") {
    const recordUrl = params.get("link");
    if (recordUrl && callId) {
      // Update recording URL in existing communication
      await supabase
        .from("communications")
        .update({ recording_url: recordUrl })
        .eq("external_id", callId);
    }
  }

  return NextResponse.json({ status: "ok" });
}

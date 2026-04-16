import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Novofon webhook handler — receives call events
// Configure in Novofon: Settings → API → Webhook URL: https://artevo-crm.ru/api/novofon/webhook

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

  const event = body.event;
  console.log(`[novofon] ${event}:`, JSON.stringify(body).slice(0, 500));

  // ── NOTIFY_START: Incoming call started ──
  if (event === "NOTIFY_START") {
    const callerNumber = body.caller_id || "";
    const calledNumber = body.called_did || "";
    const pbxCallId = body.pbx_call_id || "";

    // Find contact by phone
    const cleanPhone = callerNumber.replace(/\D/g, "").slice(-10);
    let contactId: string | null = null;
    let contactName: string | null = null;
    let companyId: string | null = null;

    if (cleanPhone.length >= 7) {
      const { data: contact } = await admin.from("contacts")
        .select("id, full_name, company_id")
        .or(`phone.ilike.%${cleanPhone},phone_mobile.ilike.%${cleanPhone}`)
        .limit(1)
        .single();
      if (contact) {
        contactId = contact.id;
        contactName = contact.full_name;
        companyId = contact.company_id;
      }
    }

    // Return caller name to Novofon PBX (shown on phone display)
    const response: Record<string, string> = {};
    if (contactName) {
      response.caller_name = contactName;
    }

    // Store call start in DB for pop-up notification
    await admin.from("communications").insert({
      channel: "phone",
      direction: "inbound",
      subject: `Входящий звонок ${callerNumber}`,
      body: contactName ? `Входящий от ${contactName}` : `Входящий от ${callerNumber}`,
      from_address: callerNumber,
      to_address: calledNumber,
      external_id: `novofon_${pbxCallId}`,
      contact_id: contactId,
      company_id: companyId,
      sender_name: contactName || callerNumber,
    });

    // If no contact found — create new contact + lead
    if (!contactId && cleanPhone.length >= 7) {
      const { data: newContact } = await admin.from("contacts").insert({
        full_name: callerNumber,
        phone: callerNumber,
      }).select("id").single();

      if (newContact) {
        contactId = newContact.id;
        // Update communication with contact_id
        await admin.from("communications").update({ contact_id: newContact.id }).eq("external_id", `novofon_${pbxCallId}`);

        // Create lead for first-time caller
        const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
        const { data: firstStage } = funnel
          ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
          : { data: null };

        await admin.from("leads").insert({
          title: `Звонок: ${callerNumber}`,
          source: "phone",
          status: "new",
          contact_id: newContact.id,
          funnel_id: funnel?.id ?? null,
          stage_id: firstStage?.id ?? null,
        });
      }
    }

    return NextResponse.json(response);
  }

  // ── NOTIFY_END: Call ended ──
  if (event === "NOTIFY_END") {
    const pbxCallId = body.pbx_call_id || "";
    const duration = body.duration || "0";
    const disposition = body.disposition || "";
    const isRecorded = body.is_recorded === "1";
    const callIdWithRec = body.call_id_with_rec || "";

    // Update existing communication record
    const { data: existing } = await admin.from("communications")
      .select("id")
      .eq("external_id", `novofon_${pbxCallId}`)
      .limit(1)
      .single();

    if (existing) {
      await admin.from("communications").update({
        body: `Звонок: ${duration} сек. (${disposition})`,
        duration_seconds: Number(duration) || null,
      }).eq("id", existing.id);
    }

    // If recorded, store call_id for later recording fetch
    if (isRecorded && callIdWithRec) {
      await admin.from("communications").update({
        recording_url: `pending:${callIdWithRec}`,
      }).eq("external_id", `novofon_${pbxCallId}`);
    }

    return NextResponse.json({});
  }

  // ── NOTIFY_OUT_START: Outbound call started ──
  if (event === "NOTIFY_OUT_START") {
    const destination = body.destination || "";
    const callerId = body.caller_id || "";
    const pbxCallId = body.pbx_call_id || "";
    const internal = body.internal || "";

    const cleanPhone = destination.replace(/\D/g, "").slice(-10);
    let contactId: string | null = null;
    let contactName: string | null = null;
    let companyId: string | null = null;

    if (cleanPhone.length >= 7) {
      const { data: contact } = await admin.from("contacts")
        .select("id, full_name, company_id")
        .or(`phone.ilike.%${cleanPhone},phone_mobile.ilike.%${cleanPhone}`)
        .limit(1)
        .single();
      if (contact) {
        contactId = contact.id;
        contactName = contact.full_name;
        companyId = contact.company_id;
      }
    }

    await admin.from("communications").insert({
      channel: "phone",
      direction: "outbound",
      subject: `Исходящий звонок ${destination}`,
      body: contactName ? `Исходящий: ${contactName}` : `Исходящий: ${destination}`,
      from_address: callerId,
      to_address: destination,
      external_id: `novofon_out_${pbxCallId}`,
      contact_id: contactId,
      company_id: companyId,
      sender_name: internal || callerId,
    });

    return NextResponse.json({});
  }

  // ── NOTIFY_OUT_END: Outbound call ended ──
  if (event === "NOTIFY_OUT_END") {
    const pbxCallId = body.pbx_call_id || "";
    const duration = body.duration || "0";
    const disposition = body.disposition || "";

    const { data: existing } = await admin.from("communications")
      .select("id")
      .eq("external_id", `novofon_out_${pbxCallId}`)
      .limit(1)
      .single();

    if (existing) {
      await admin.from("communications").update({
        body: `Исходящий: ${duration} сек. (${disposition})`,
        duration_seconds: Number(duration) || null,
      }).eq("id", existing.id);
    }

    return NextResponse.json({});
  }

  // ── NOTIFY_RECORD: Recording ready ──
  if (event === "NOTIFY_RECORD") {
    const pbxCallId = body.pbx_call_id || "";
    const callIdWithRec = body.call_id_with_rec || "";

    if (callIdWithRec) {
      // Fetch recording link from Novofon API
      try {
        const { getRecordingLink } = await import("@/lib/novofon");
        const result = await getRecordingLink(callIdWithRec);
        if (result?.link) {
          // Update both inbound and outbound records
          await admin.from("communications").update({ recording_url: result.link })
            .or(`external_id.eq.novofon_${pbxCallId},external_id.eq.novofon_out_${pbxCallId}`);
        }
      } catch (e) {
        console.error("[novofon] Recording fetch error:", e);
      }
    }

    return NextResponse.json({});
  }

  // ── SMS: Incoming SMS ──
  if (event === "SMS") {
    const callerNumber = body.caller_id || "";
    const text = body.text || "";

    const cleanPhone = callerNumber.replace(/\D/g, "").slice(-10);
    let contactId: string | null = null;
    if (cleanPhone.length >= 7) {
      const { data: contact } = await admin.from("contacts").select("id").or(`phone.ilike.%${cleanPhone},phone_mobile.ilike.%${cleanPhone}`).limit(1).single();
      if (contact) contactId = contact.id;
    }

    await admin.from("communications").insert({
      channel: "phone",
      direction: "inbound",
      subject: "SMS",
      body: text,
      from_address: callerNumber,
      contact_id: contactId,
      sender_name: callerNumber,
    });

    return NextResponse.json({});
  }

  return NextResponse.json({ ok: true });
}

// GET for testing webhook URL
export async function GET() {
  return NextResponse.json({ status: "ok", webhook: "novofon" });
}

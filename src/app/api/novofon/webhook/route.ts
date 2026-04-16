import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickAutoLeadAssignee } from "@/lib/auto-lead-assigner";

// Novofon webhook handler — receives notification events
// Each notification type is configured separately in Novofon panel
// Add &event_type=incoming / outgoing / end / record to the body template

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flatten(body: any): Record<string, string> {
  // Novofon sends nested contact_info object — flatten it
  const flat: Record<string, string> = {};
  for (const [key, val] of Object.entries(body)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [k2, v2] of Object.entries(val as Record<string, unknown>)) {
        flat[k2] = String(v2 ?? "");
      }
    } else {
      flat[key] = String(val ?? "");
    }
  }
  return flat;
}

export async function POST(req: NextRequest) {
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawBody: any;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    rawBody = await req.json();
  } else {
    const text = await req.text();
    rawBody = Object.fromEntries(new URLSearchParams(text));
  }

  const body = flatten(rawBody);
  console.log(`[novofon] webhook:`, JSON.stringify(body).slice(0, 500));

  // Detect event type from custom field or notification_name
  const eventType = (body.event_type || body.event || "").toLowerCase();
  const notifName = (body.notification_name || "").toLowerCase();

  // Determine type: incoming, outgoing, end, record
  let type = eventType;
  if (!type) {
    if (notifName.includes("входящ")) type = "incoming";
    else if (notifName.includes("исходящ")) type = "outgoing";
    else if (notifName.includes("заверш") || notifName.includes("оконч")) type = "end";
    else if (notifName.includes("запис")) type = "record";
    else type = "unknown";
  }

  const callerPhone = body.contact_phone_number || body.caller_id || body.caller_number || "";
  const calledNumber = body.virtual_phone_number || body.called_did || "";
  const callSessionId = body.call_session_id || body.pbx_call_id || "";
  const contactName = body.contact_full_name || "";
  const duration = body.duration || body.wait_time_duration || "0";

  // ── INCOMING CALL ──
  if (type === "incoming" || type === "notify_start") {
    const cleanPhone = callerPhone.replace(/\D/g, "").slice(-10);
    let contactId: string | null = null;
    let dbContactName: string | null = null;
    let companyId: string | null = null;

    if (cleanPhone.length >= 7) {
      const { data: contact } = await admin.from("contacts")
        .select("id, full_name, company_id")
        .or(`phone.ilike.%${cleanPhone},phone_mobile.ilike.%${cleanPhone}`)
        .limit(1).single();
      if (contact) {
        contactId = contact.id;
        dbContactName = contact.full_name;
        companyId = contact.company_id;
      }
    }

    // Store call for popup
    const { error: commErr } = await admin.from("communications").insert({
      channel: "phone",
      direction: "inbound",
      entity_type: contactId ? "contact" : "lead",
      entity_id: contactId || "00000000-0000-0000-0000-000000000000",
      subject: `Входящий звонок ${callerPhone}`,
      body: dbContactName ? `Входящий от ${dbContactName}` : `Входящий от ${callerPhone}`,
      from_address: callerPhone,
      to_address: calledNumber,
      external_id: `novofon_${callSessionId}`,
      contact_id: contactId,
      company_id: companyId,
      sender_name: dbContactName || contactName || callerPhone,
    });
    if (commErr) console.error("[novofon] comm insert error:", commErr.message);

    // If no contact — create contact + lead
    if (!contactId && cleanPhone.length >= 7) {
      const { data: newContact, error: contactErr } = await admin.from("contacts").insert({
        full_name: contactName || callerPhone,
        phone: callerPhone,
      }).select("id").single();
      if (contactErr) console.error("[novofon] contact insert error:", contactErr.message);

      if (newContact) {
        contactId = newContact.id;
        console.log("[novofon] created contact:", newContact.id, "for", callerPhone);
        await admin.from("communications").update({ contact_id: newContact.id }).eq("external_id", `novofon_${callSessionId}`);

        const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
        console.log("[novofon] funnel:", funnel?.id ?? "NONE");
        const { data: firstStage } = funnel
          ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
          : { data: null };
        const assignee = await pickAutoLeadAssignee(admin);

        const { data: newLead, error: leadErr } = await admin.from("leads").insert({
          title: `Звонок: ${contactName || callerPhone}`,
          source: "phone",
          status: "new",
          contact_id: newContact.id,
          funnel_id: funnel?.id ?? null,
          stage_id: firstStage?.id ?? null,
          assigned_to: assignee ?? null,
        }).select("id").single();
        if (leadErr) console.error("[novofon] lead insert error:", leadErr.message);
        else console.log("[novofon] created lead:", newLead?.id);
      }
    }

    return NextResponse.json({ caller_name: dbContactName || undefined });
  }

  // ── OUTGOING CALL ──
  if (type === "outgoing" || type === "notify_out_start") {
    const cleanPhone = callerPhone.replace(/\D/g, "").slice(-10);
    let contactId: string | null = null;
    let dbContactName: string | null = null;
    let companyId: string | null = null;

    if (cleanPhone.length >= 7) {
      const { data: contact } = await admin.from("contacts")
        .select("id, full_name, company_id")
        .or(`phone.ilike.%${cleanPhone},phone_mobile.ilike.%${cleanPhone}`)
        .limit(1).single();
      if (contact) {
        contactId = contact.id;
        dbContactName = contact.full_name;
        companyId = contact.company_id;
      }
    }

    await admin.from("communications").insert({
      channel: "phone",
      direction: "outbound",
      entity_type: contactId ? "contact" : "lead",
      entity_id: contactId || "00000000-0000-0000-0000-000000000000",
      subject: `Исходящий звонок ${callerPhone}`,
      body: dbContactName ? `Исходящий: ${dbContactName}` : `Исходящий: ${callerPhone}`,
      from_address: calledNumber,
      to_address: callerPhone,
      external_id: `novofon_out_${callSessionId}`,
      contact_id: contactId,
      company_id: companyId,
      sender_name: dbContactName || contactName || callerPhone,
    });

    return NextResponse.json({});
  }

  // ── CALL END ──
  if (type === "end" || type === "notify_end" || type === "notify_out_end") {
    if (callSessionId) {
      const { data: existing } = await admin.from("communications")
        .select("id")
        .or(`external_id.eq.novofon_${callSessionId},external_id.eq.novofon_out_${callSessionId}`)
        .limit(1).single();

      if (existing) {
        await admin.from("communications").update({
          body: `Звонок: ${duration} сек.`,
          duration_seconds: Number(duration) || null,
        }).eq("id", existing.id);
      }
    }
    return NextResponse.json({});
  }

  // ── RECORDING READY ──
  if (type === "record" || type === "notify_record") {
    const recordUrl = body.link || body.record_link || body.recording_url || "";
    if (callSessionId && recordUrl) {
      await admin.from("communications").update({ recording_url: recordUrl })
        .or(`external_id.eq.novofon_${callSessionId},external_id.eq.novofon_out_${callSessionId}`);
    } else if (callSessionId) {
      // Try to fetch recording via API
      try {
        const { getRecordingLink } = await import("@/lib/novofon");
        const result = await getRecordingLink(callSessionId);
        if (result?.link) {
          await admin.from("communications").update({ recording_url: result.link })
            .or(`external_id.eq.novofon_${callSessionId},external_id.eq.novofon_out_${callSessionId}`);
        }
      } catch (e) {
        console.error("[novofon] Recording fetch error:", e);
      }
    }
    return NextResponse.json({});
  }

  // Unknown event — log and accept
  console.log(`[novofon] unhandled type="${type}":`, JSON.stringify(body).slice(0, 300));
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", webhook: "novofon" });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sync chat messages into communications table for timeline
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, channel, entity_type, entity_id } = await req.json();

  if (!messages?.length || !channel || !entity_type || !entity_id) {
    return NextResponse.json({ error: "messages, channel, entity_type, entity_id required" }, { status: 400 });
  }

  let saved = 0;

  for (const msg of messages) {
    const externalId = `${channel}_${msg.id || msg.uid || msg.time || Date.now()}`;

    // Check if already saved
    const { data: existing } = await supabase
      .from("communications")
      .select("id")
      .eq("external_id", externalId)
      .limit(1)
      .single();

    if (existing) continue;

    // Set FK columns based on entity_type
    const fkFields: Record<string, string | null> = { contact_id: null, company_id: null, deal_id: null, lead_id: null };
    if (entity_type === "contact") {
      fkFields.contact_id = entity_id;
      // Also resolve company_id from contact
      try {
        const { data: ct } = await supabase.from("contacts").select("company_id").eq("id", entity_id).single();
        if (ct?.company_id) fkFields.company_id = ct.company_id;
      } catch { /* skip */ }
    } else if (entity_type === "company") fkFields.company_id = entity_id;
    else if (entity_type === "deal") fkFields.deal_id = entity_id;
    else if (entity_type === "lead") fkFields.lead_id = entity_id;

    await supabase.from("communications").insert({
      entity_type,
      entity_id,
      ...fkFields,
      channel,
      direction: msg.isMe || msg.direction === "outbound" ? "outbound" : "inbound",
      body: msg.text || msg.body || msg.preview || "",
      from_address: msg.sender || msg.from || msg.fromEmail || "",
      sender_name: msg.sender || msg.fromName || msg.from || null,
      subject: msg.subject || null,
      external_id: externalId,
      created_by: msg.isMe ? user.id : null,
      created_at: msg.time ? new Date(typeof msg.time === "number" && msg.time < 9999999999 ? msg.time * 1000 : msg.time).toISOString() : new Date().toISOString(),
    });
    saved++;
  }

  return NextResponse.json({ ok: true, saved });
}

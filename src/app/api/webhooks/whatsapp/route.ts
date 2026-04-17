import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const secret = process.env.WA_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers.get("x-webhook-secret") ?? "";
    if (got !== secret) return new NextResponse("forbidden", { status: 403 });
  }

  let body: {
    from?: string;
    text?: string;
    id?: string | null;
    timestamp?: number;
    mediaMimeType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const from = (body.from ?? "").replace(/\D/g, "");
  if (!from) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();

  const phoneSuffix = from.slice(-10);
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .or(`whatsapp_phone.eq.${from},phone.ilike.%${phoneSuffix},phone_mobile.ilike.%${phoneSuffix}`)
    .maybeSingle();

  await supabase.from("inbox_messages").insert({
    channel: "whatsapp",
    chat_id: from,
    external_id: body.id ?? null,
    direction: "inbound",
    text: body.text ?? "",
    attachments: body.mediaMimeType ? { mimetype: body.mediaMimeType } : null,
    sent_at: body.timestamp ? new Date(body.timestamp * 1000).toISOString() : new Date().toISOString(),
    contact_id: contact?.id ?? null,
  });

  if (contact?.id) {
    await supabase.from("communications").insert({
      entity_type: "contact",
      entity_id: contact.id,
      channel: "whatsapp",
      direction: "inbound",
      body: body.text ?? "",
      from_address: from,
      external_id: body.id ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}

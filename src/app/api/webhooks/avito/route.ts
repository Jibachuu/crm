import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Avito Messenger API v3 webhook.
// Register webhook via POST /messenger/v3/webhook with the public URL of this route.
// Optional AVITO_WEBHOOK_SECRET for shared-secret header check (x-webhook-secret).

interface AvitoPayload {
  id?: string;
  version?: string;
  timestamp?: number;
  payload?: {
    type?: string;
    value?: {
      id?: string;
      chat_id?: string;
      user_id?: number;
      author_id?: number;
      created?: number;
      type?: string;
      content?: { text?: string };
    };
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.AVITO_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers.get("x-webhook-secret") ?? "";
    if (got !== secret) return new NextResponse("forbidden", { status: 403 });
  }

  let body: AvitoPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const event = body.payload;
  if (event?.type !== "message") {
    return NextResponse.json({ ok: true });
  }

  const msg = event.value;
  if (!msg?.chat_id || !msg.id) return NextResponse.json({ ok: true });

  // Skip messages sent by our own account (author_id === user_id from OAuth)
  const myUserId = process.env.AVITO_USER_ID;
  const isOutbound = myUserId && String(msg.author_id) === String(myUserId);

  const supabase = createAdminClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("avito_profile_id", String(msg.author_id ?? ""))
    .maybeSingle();

  await supabase.from("inbox_messages").insert({
    channel: "avito",
    chat_id: msg.chat_id,
    external_id: msg.id,
    direction: isOutbound ? "outbound" : "inbound",
    text: msg.content?.text ?? "",
    sent_at: msg.created ? new Date(msg.created * 1000).toISOString() : new Date().toISOString(),
    contact_id: contact?.id ?? null,
  });

  if (contact?.id && !isOutbound) {
    await supabase.from("communications").insert({
      entity_type: "contact",
      entity_id: contact.id,
      channel: "avito",
      direction: "inbound",
      body: msg.content?.text ?? "",
      from_address: String(msg.author_id ?? ""),
      external_id: msg.id,
    });
  }

  return NextResponse.json({ ok: true });
}

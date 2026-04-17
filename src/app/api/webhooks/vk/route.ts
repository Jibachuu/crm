import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// VK Community Callback API webhook.
// Set VK_GROUP_TOKEN (community access token) and VK_CONFIRMATION_TOKEN in env.
// Optionally VK_SECRET_KEY — VK posts it as body.secret; we reject on mismatch.

export async function POST(req: NextRequest) {
  const confirmationToken = process.env.VK_CONFIRMATION_TOKEN ?? "";
  const secret = process.env.VK_SECRET_KEY ?? "";

  let body: {
    type?: string;
    object?: {
      message?: { from_id?: number; peer_id?: number; text?: string; id?: number; attachments?: unknown[]; date?: number };
    };
    secret?: string;
    group_id?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (secret && body.secret !== secret) {
    return new NextResponse("forbidden", { status: 403 });
  }

  // Step 1: confirmation challenge (respond with raw text, not JSON)
  if (body.type === "confirmation") {
    return new NextResponse(confirmationToken, { status: 200 });
  }

  // Step 2: incoming message
  if (body.type === "message_new" && body.object?.message) {
    const m = body.object.message;
    const fromId = String(m.from_id ?? m.peer_id ?? "");
    if (!fromId) return new NextResponse("ok");

    const supabase = createAdminClient();

    // Try to match existing contact by vk_id
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("vk_id", fromId)
      .maybeSingle();

    await supabase.from("inbox_messages").insert({
      channel: "vk",
      chat_id: fromId,
      external_id: m.id ? String(m.id) : null,
      direction: "inbound",
      text: m.text ?? "",
      attachments: m.attachments ?? null,
      sent_at: m.date ? new Date(m.date * 1000).toISOString() : new Date().toISOString(),
      contact_id: contact?.id ?? null,
    });

    // Also log to communications if matched to a contact
    if (contact?.id) {
      await supabase.from("communications").insert({
        entity_type: "contact",
        entity_id: contact.id,
        channel: "vk",
        direction: "inbound",
        body: m.text ?? "",
        from_address: fromId,
        external_id: m.id ? String(m.id) : null,
      });
    }
  }

  // VK expects plain "ok" response
  return new NextResponse("ok", { status: 200 });
}

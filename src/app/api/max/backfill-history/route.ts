import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Backfill MAX message history into communications table.
// Iterates all MAX chats from VPS proxy, fetches as many messages as possible per chat,
// and inserts them into communications with dedup by external_id.
//
// Requires the proxy /messages endpoint to honor a high count value (current implementation
// passes count through to opcode 50). For chats with thousands of messages, the proxy
// would need pagination support — we ask for count=2000 here as a best effort.

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proxyUrl = process.env.MAX_PROXY_URL;
  const proxyKey = process.env.MAX_PROXY_KEY;
  if (!proxyUrl || !proxyKey) return NextResponse.json({ error: "MAX proxy not configured" }, { status: 503 });

  const admin = createAdminClient();

  // 1) Get all MAX chats
  const chatsRes = await fetch(`${proxyUrl}/chats`, { headers: { Authorization: proxyKey } });
  if (!chatsRes.ok) return NextResponse.json({ error: "MAX proxy /chats returned " + chatsRes.status }, { status: 502 });
  const chatsData = await chatsRes.json();
  const chats: Array<{ chatId?: number | string; title?: string }> = chatsData.chats ?? [];

  let totalMessages = 0;
  let totalInserted = 0;
  let chatsProcessed = 0;
  const errors: string[] = [];

  for (const chat of chats) {
    const chatId = String(chat.chatId ?? "");
    if (!chatId || Number(chatId) < 0) continue;

    try {
      // Fetch as many messages as the proxy will give us
      const msgRes = await fetch(`${proxyUrl}/messages?chatId=${chatId}&count=2000`, {
        headers: { Authorization: proxyKey },
      });
      if (!msgRes.ok) {
        errors.push(`chat ${chatId}: messages HTTP ${msgRes.status}`);
        continue;
      }
      const msgData = await msgRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = msgData.messages ?? [];
      totalMessages += messages.length;
      chatsProcessed++;

      if (messages.length === 0) continue;

      // Find the contact linked to this chatId (by maks_id)
      const { data: contact } = await admin
        .from("contacts")
        .select("id")
        .eq("maks_id", chatId)
        .limit(1)
        .maybeSingle();

      const contactId = contact?.id ?? null;

      // Find a lead linked to this contact (so we can set entity_type=lead, entity_id=lead.id)
      let leadId: string | null = null;
      if (contactId) {
        const { data: lead } = await admin
          .from("leads")
          .select("id")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        leadId = lead?.id ?? null;
      }

      // Dedup: load existing external_ids for this chat (only MAX channel)
      const existingIds = new Set<string>();
      const externalIds = messages.map((m) => `max-${chatId}-${m.id ?? m.messageId ?? m.timestamp}`);
      // Query in chunks of 200 to avoid huge IN clauses
      for (let i = 0; i < externalIds.length; i += 200) {
        const slice = externalIds.slice(i, i + 200);
        const { data: existing } = await admin
          .from("communications")
          .select("external_id")
          .eq("channel", "maks")
          .in("external_id", slice);
        for (const r of existing ?? []) if (r.external_id) existingIds.add(r.external_id);
      }

      // Build inserts for new messages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inserts: any[] = [];
      for (const m of messages) {
        const externalId = `max-${chatId}-${m.id ?? m.messageId ?? m.timestamp}`;
        if (existingIds.has(externalId)) continue;

        const isMine = m.from === "me" || m.fromMe || m.outgoing || (m.senderId && String(m.senderId) === String(msgData.viewerId));
        const direction = isMine ? "outbound" : "inbound";
        const body = m.text || m.message || m.body || (m.attachments?.length ? "[вложение]" : "");
        const senderName = m.senderName || m.from || (isMine ? null : chat.title);
        const ts = m.time || m.timestamp || m.created_at;
        const createdAt = ts
          ? new Date(typeof ts === "number" ? (ts > 9999999999 ? ts : ts * 1000) : ts).toISOString()
          : new Date().toISOString();

        inserts.push({
          entity_type: leadId ? "lead" : "contact",
          entity_id: leadId ?? contactId ?? null,
          contact_id: contactId,
          channel: "maks",
          direction,
          body,
          sender_name: senderName,
          external_id: externalId,
          created_by: user.id,
          created_at: createdAt,
        });
      }

      // Skip rows without entity_id (DB requires it NOT NULL)
      const validInserts = inserts.filter((i) => i.entity_id);
      if (validInserts.length > 0) {
        // Insert in chunks
        for (let i = 0; i < validInserts.length; i += 100) {
          const chunk = validInserts.slice(i, i + 100);
          const { error: insErr } = await admin.from("communications").insert(chunk);
          if (insErr) {
            errors.push(`chat ${chatId}: insert ${insErr.message}`);
            break;
          }
          totalInserted += chunk.length;
        }
      }
    } catch (e) {
      errors.push(`chat ${chatId}: ${String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    chatsProcessed,
    totalMessages,
    totalInserted,
    errors: errors.slice(0, 30),
  });
}

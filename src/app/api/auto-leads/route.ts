import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Auto-create leads from new messages (Telegram, MAX, Email)
// Called by cron or manually

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ source: "all" }));
  const { source } = body;
  const admin = createAdminClient();
  const results: string[] = [];

  // Get all existing contacts by telegram_id, maks_id, email
  const { data: existingContacts } = await admin.from("contacts").select("id, telegram_id, maks_id, email, phone, full_name");
  const telegramIds = new Set((existingContacts ?? []).filter((c) => c.telegram_id).map((c) => c.telegram_id));
  const maksIds = new Set((existingContacts ?? []).filter((c) => c.maks_id).map((c) => c.maks_id));

  // ── TELEGRAM: check for new dialogs not in contacts ──
  if (source === "all" || source === "telegram") {
    try {
      const telegramProxy = process.env.TELEGRAM_PROXY_URL;
      if (telegramProxy) {
        const res = await fetch(`${telegramProxy}/dialogs`).catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const dialogs = data.dialogs ?? [];

          for (const dialog of dialogs) {
            const peerId = String(dialog.id ?? dialog.peerId ?? "");
            const name = dialog.name ?? dialog.title ?? peerId;
            if (!peerId || telegramIds.has(peerId)) continue;

            // Check if lead already exists for this telegram contact
            const { data: existingLead } = await admin.from("leads")
              .select("id")
              .eq("source", "telegram")
              .ilike("title", `%${peerId}%`)
              .limit(1)
              .single();
            if (existingLead) continue;

            // Create contact
            const { data: contact } = await admin.from("contacts")
              .insert({
                full_name: name,
                telegram_id: peerId,
                created_by: (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id,
              })
              .select("id")
              .single();

            if (contact) {
              // Get default funnel
              const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
              const { data: firstStage } = funnel
                ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
                : { data: null };

              // Create lead
              await admin.from("leads").insert({
                title: `Telegram: ${name}`,
                source: "telegram",
                status: "new",
                contact_id: contact.id,
                funnel_id: funnel?.id ?? null,
                stage_id: firstStage?.id ?? null,
                created_by: (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id,
              });
              results.push(`Lead created: Telegram ${name}`);
              telegramIds.add(peerId);
            }
          }
        }
      }
    } catch (e) {
      results.push(`Telegram error: ${e}`);
    }
  }

  // ── MAX: check for new chats not in contacts ──
  if (source === "all" || source === "max") {
    try {
      const maxProxy = process.env.MAX_PROXY_URL;
      const maxKey = process.env.MAX_PROXY_KEY;
      if (maxProxy && maxKey) {
        const res = await fetch(`${maxProxy}/chats`, { headers: { Authorization: maxKey } }).catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const chats = data.chats ?? [];

          for (const chat of chats) {
            const chatId = String(chat.chatId ?? "");
            const name = chat.title ?? chatId;
            if (!chatId || maksIds.has(chatId) || Number(chatId) < 0) continue; // Skip group chats (negative IDs)

            // Check if lead exists
            const { data: existingLead } = await admin.from("leads")
              .select("id")
              .eq("source", "maks")
              .ilike("title", `%${chatId}%`)
              .limit(1)
              .single();
            if (existingLead) continue;

            // Create contact
            const { data: contact } = await admin.from("contacts")
              .insert({
                full_name: name,
                maks_id: chatId,
                created_by: (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id,
              })
              .select("id")
              .single();

            if (contact) {
              const { data: funnel } = await admin.from("funnels").select("id").eq("type", "lead").eq("is_default", true).single();
              const { data: firstStage } = funnel
                ? await admin.from("funnel_stages").select("id").eq("funnel_id", funnel.id).order("sort_order").limit(1).single()
                : { data: null };

              await admin.from("leads").insert({
                title: `МАКС: ${name}`,
                source: "maks",
                status: "new",
                contact_id: contact.id,
                funnel_id: funnel?.id ?? null,
                stage_id: firstStage?.id ?? null,
                created_by: (await admin.from("users").select("id").eq("role", "admin").limit(1).single()).data?.id,
              });
              results.push(`Lead created: MAX ${name}`);
              maksIds.add(chatId);
            }
          }
        }
      }
    } catch (e) {
      results.push(`MAX error: ${e}`);
    }
  }

  return NextResponse.json({ ok: true, results, created: results.filter((r) => r.startsWith("Lead")).length });
}

// GET for cron trigger
export async function GET() {
  const res = await fetch(process.env.NEXT_PUBLIC_APP_URL + "/api/auto-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "all" }),
  }).catch(() => null);
  const data = res ? await res.json() : { error: "Failed" };
  return NextResponse.json(data);
}

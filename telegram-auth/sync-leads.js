// Telegram Auto-Lead Sync — runs on VPS
// Scans Telegram dialogs every 5 minutes, creates contacts/leads with phone-based dedup

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const SESSION = process.env.TELEGRAM_SESSION || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

async function sbQuery(path, method, body) {
  const url = SUPABASE_URL + path;
  const opts = {
    method: method || "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: method === "POST" || method === "PATCH" ? "return=representation" : "",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  try { const r = await fetch(url, opts); return r.json(); } catch { return []; }
}

async function syncTelegramLeads() {
  if (!API_ID || !API_HASH || !SESSION || !SUPABASE_KEY) {
    console.log("[TG-SYNC] Missing config");
    return;
  }

  let client = null;
  try {
    client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, { connectionRetries: 2 });
    await client.connect();

    if (!(await client.isUserAuthorized())) {
      console.log("[TG-SYNC] Not authorized");
      await client.disconnect();
      return;
    }

    const admins = await sbQuery("/rest/v1/users?role=eq.admin&select=id&limit=1");
    const adminId = admins?.[0]?.id;
    if (!adminId) { console.log("[TG-SYNC] No admin"); await client.disconnect(); return; }

    const funnels = await sbQuery("/rest/v1/funnels?type=eq.lead&is_default=eq.true&select=id&limit=1");
    const funnelId = funnels?.[0]?.id || null;
    let stageId = null;
    if (funnelId) {
      const stages = await sbQuery("/rest/v1/funnel_stages?funnel_id=eq." + funnelId + "&select=id&order=sort_order&limit=1");
      stageId = stages?.[0]?.id || null;
    }

    let processed = 0, created = 0, updated = 0;

    for await (const dialog of client.iterDialogs({ limit: 100 })) {
      if (!dialog.isUser) continue;
      const entity = dialog.entity;
      if (!entity) continue;

      const tgId = String(entity.id);
      const tgUsername = entity.username || null;
      const tgPhone = entity.phone ? String(entity.phone) : null;
      const tgName = [entity.firstName, entity.lastName].filter(Boolean).join(" ").trim() || tgUsername || tgId;

      if (!tgName && !tgPhone) continue;

      // Find existing contact: by telegram_id, then by phone
      let dbContact = null;
      const byTgId = await sbQuery("/rest/v1/contacts?telegram_id=eq." + encodeURIComponent(tgId) + "&select=id,full_name,phone,telegram_id,maks_id&limit=1");
      if (byTgId?.length > 0) dbContact = byTgId[0];

      if (!dbContact && tgPhone) {
        const cleanPhone = tgPhone.replace(/\D/g, "").slice(-10);
        const byPhone = await sbQuery("/rest/v1/contacts?phone=ilike.%25" + cleanPhone + "%25&select=id,full_name,phone,telegram_id,maks_id&limit=1");
        if (byPhone?.length > 0) dbContact = byPhone[0];
      }

      let contactId;
      if (dbContact) {
        // Update missing fields
        const updates = {};
        if (tgName && (!dbContact.full_name || dbContact.full_name === tgId || dbContact.full_name.match(/^\d+$/))) updates.full_name = tgName;
        if (tgPhone && !dbContact.phone) updates.phone = tgPhone;
        if (tgId && !dbContact.telegram_id) updates.telegram_id = tgId;
        if (tgUsername) updates.telegram_username = tgUsername;
        if (Object.keys(updates).length > 0) {
          await sbQuery("/rest/v1/contacts?id=eq." + dbContact.id, "PATCH", updates);
          updated++;
        }
        contactId = dbContact.id;
      } else {
        // Create new contact
        const nc = await sbQuery("/rest/v1/contacts", "POST", {
          full_name: tgName,
          phone: tgPhone,
          telegram_id: tgId,
          telegram_username: tgUsername,
          created_by: adminId,
        });
        contactId = nc?.[0]?.id;
        if (!contactId) continue;
      }

      // Check if lead exists for this contact via Telegram
      const leads = await sbQuery("/rest/v1/leads?source=eq.telegram&contact_id=eq." + contactId + "&select=id&limit=1");
      if (leads?.length > 0) { processed++; continue; }

      // Create lead
      await sbQuery("/rest/v1/leads", "POST", {
        title: "Telegram: " + tgName,
        source: "telegram",
        status: "new",
        contact_id: contactId,
        funnel_id: funnelId,
        stage_id: stageId,
        created_by: adminId,
      });
      created++;
      processed++;
    }

    await client.disconnect();
    console.log(`[TG-SYNC] processed=${processed} created=${created} updated=${updated}`);
  } catch (e) {
    console.log("[TG-SYNC] Error:", e.message);
    if (client) try { await client.disconnect(); } catch {}
  }
}

// Run every 5 minutes
syncTelegramLeads();
setInterval(syncTelegramLeads, 5 * 60 * 1000);
console.log("[TG-SYNC] Started, syncing every 5 minutes");

const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const http = require("https");

const IMAP_HOST = process.env.IMAP_HOST || "";
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
const IMAP_USER = process.env.IMAP_USER || "";
const IMAP_PASS = process.env.IMAP_PASS || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || ""; // service role key
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Track already-processed emails to avoid duplicates
const processedUids = new Set();

async function supabaseQuery(path, method = "GET", body = null) {
  const url = new URL(path, SUPABASE_URL);
  const opts = {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url.toString(), opts);
  return res.json();
}

async function checkInbox() {
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
    console.log("[EMAIL] IMAP not configured, skipping");
    return;
  }

  console.log("[EMAIL] Checking inbox...");
  let client = null;

  try {
    client = new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: true,
      auth: { user: IMAP_USER, pass: IMAP_PASS },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const mailbox = client.mailbox;
      const total = mailbox?.exists ?? 0;
      if (total === 0) { console.log("[EMAIL] Inbox empty"); return; }

      // Check last 15 emails
      const startSeq = Math.max(1, total - 15 + 1);

      for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, source: true })) {
        if (processedUids.has(msg.uid)) continue;
        processedUids.add(msg.uid);

        try {
          const parsed = await simpleParser(msg.source);
          const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
          const fromName = parsed.from?.value?.[0]?.name || parsed.from?.text || fromEmail || "";

          if (!fromEmail || fromEmail === IMAP_USER.toLowerCase()) continue;

          // Skip mail from any of our own users (admins replying from
          // jibachuu@gmail.com, etc.) — those flooded the leads table on
          // 2026-05-04 because the dedup below was broken.
          const ownUsers = await supabaseQuery(
            `/rest/v1/users?email=ilike.${encodeURIComponent(fromEmail)}&select=id&limit=1`
          );
          if (Array.isArray(ownUsers) && ownUsers.length > 0) continue;

          // Check if contact exists in Supabase (also via email_other / created_at)
          const existingContacts = await supabaseQuery(
            `/rest/v1/contacts?email=ilike.${encodeURIComponent(fromEmail)}&select=id,full_name,phone&limit=1&deleted_at=is.null`
          );
          let contactId = null;

          if (Array.isArray(existingContacts) && existingContacts.length > 0) {
            contactId = existingContacts[0].id;
            const current = existingContacts[0];
            if (fromName && fromName !== fromEmail && (!current.full_name || current.full_name === fromEmail || current.full_name.includes("@"))) {
              await supabaseQuery(`/rest/v1/contacts?id=eq.${contactId}`, "PATCH", { full_name: fromName });
            }
          }

          // Lead dedup — was looking up by title containing the email,
          // but titles are "Email: Имя", so the lookup never matched and
          // every poll spawned a fresh lead. Now: skip if any open
          // (non-converted/rejected) email-source lead already exists for
          // this contact within the last 30 days.
          if (contactId) {
            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const dupLeads = await supabaseQuery(
              `/rest/v1/leads?contact_id=eq.${contactId}&source=eq.email&created_at=gt.${encodeURIComponent(since)}&status=in.(new,callback,in_progress,samples,samples_shipped,invoice)&deleted_at=is.null&select=id&limit=1`
            );
            if (Array.isArray(dupLeads) && dupLeads.length > 0) continue;
          }

          // Get admin user ID
          const admins = await supabaseQuery(`/rest/v1/users?role=eq.admin&select=id&limit=1`);
          const adminId = admins?.[0]?.id;
          if (!adminId) { console.log("[EMAIL] No admin user found"); continue; }

          // Get default lead funnel
          const funnels = await supabaseQuery(`/rest/v1/funnels?type=eq.lead&is_default=eq.true&select=id&limit=1`);
          const funnelId = funnels?.[0]?.id || null;

          let stageId = null;
          if (funnelId) {
            const stages = await supabaseQuery(`/rest/v1/funnel_stages?funnel_id=eq.${funnelId}&select=id&order=sort_order&limit=1`);
            stageId = stages?.[0]?.id || null;
          }

          // Create contact if not found
          if (!contactId) {
            const newContacts = await supabaseQuery("/rest/v1/contacts", "POST", {
              full_name: fromName || fromEmail,
              email: fromEmail,
              created_by: adminId,
            });
            contactId = newContacts?.[0]?.id;
            if (!contactId) { console.log("[EMAIL] Failed to create contact for", fromEmail); continue; }
          }

          // Create lead
          await supabaseQuery("/rest/v1/leads", "POST", {
            title: `Email: ${fromName || fromEmail}`,
            source: "email",
            status: "new",
            contact_id: contactId,
            funnel_id: funnelId,
            stage_id: stageId,
            created_by: adminId,
          });

          console.log(`[EMAIL] Lead created: ${fromName} <${fromEmail}>`);
        } catch (e) {
          console.log("[EMAIL] Error processing message:", e.message);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log("[EMAIL] Check complete");
  } catch (e) {
    console.log("[EMAIL] Error:", e.message);
    if (client) try { await client.logout(); } catch {}
  }
}

// Keep processedUids from growing forever
function cleanupUids() {
  if (processedUids.size > 500) {
    const arr = [...processedUids];
    arr.splice(0, arr.length - 200);
    processedUids.clear();
    arr.forEach((uid) => processedUids.add(uid));
  }
}

// Run immediately, then every 5 minutes
checkInbox();
setInterval(() => {
  cleanupUids();
  checkInbox();
}, CHECK_INTERVAL);

console.log(`[EMAIL Watcher] Started. Checking every ${CHECK_INTERVAL / 1000}s`);
console.log(`[EMAIL Watcher] IMAP: ${IMAP_USER}@${IMAP_HOST}`);

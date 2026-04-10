const http = require("http");
const https = require("https");
const WebSocket = require("ws");
const WS_URL = "wss://ws-api.oneme.ru/websocket";
const PORT = 3100;
const API_KEY = process.env.API_KEY || "artevo-max-proxy-2026";
const MAX_TOKEN = process.env.MAX_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
let ws = null, seq = 0, connected = false, userId = null;
let cachedChats = [], cachedContacts = [];
const chatMessages = new Map();
const fileIndex = new Map();
let pingInterval = null;

// ── SEQ-BASED PENDING SYSTEM ──
const pending = new Map(); // seq -> { resolve, timer }

function send(op, p = {}) {
  if (!ws || ws.readyState !== 1) return -1;
  const s = seq++;
  ws.send(JSON.stringify({ ver: 11, cmd: 0, seq: s, opcode: op, payload: p }));
  return s;
}

function sendRaw(op, payloadJson) {
  if (!ws || ws.readyState !== 1) return -1;
  const s = seq++;
  ws.send(`{"ver":11,"cmd":0,"seq":${s},"opcode":${op},"payload":${payloadJson}}`);
  return s;
}

function request(op, p = {}, timeout = 8000) {
  const s = send(op, p);
  if (s < 0) return Promise.resolve(null);
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(s); resolve(null); }, timeout);
    pending.set(s, { resolve: m => { clearTimeout(timer); pending.delete(s); resolve(m); } });
  });
}

function requestRaw(op, payloadJson, timeout = 8000) {
  const s = sendRaw(op, payloadJson);
  if (s < 0) return Promise.resolve(null);
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(s); resolve(null); }, timeout);
    pending.set(s, { resolve: m => { clearTimeout(timer); pending.delete(s); resolve(m); } });
  });
}

function handleWsMessage(raw) {
  try {
    const safed = raw.replace(/:\s*(\d{16,})/g, ':"$1"');
    const m = JSON.parse(safed);
    // Route to pending by seq
    if ((m.cmd === 1 || m.cmd === 3) && pending.has(m.seq)) {
      pending.get(m.seq).resolve(m);
    }
    // Auth
    if (m.opcode === 6 && m.cmd === 1) send(19, { token: MAX_TOKEN, chatsCount: 40, chatsSync: 0, contactsSync: 0, draftsSync: 0, presenceSync: -1, lastLogin: Date.now(), interactive: false });
    if (m.opcode === 19 && m.cmd === 1 && m.payload?.profile) {
      connected = true; userId = m.payload?.profile?.id;
      cachedChats = m.payload?.chats || []; cachedContacts = m.payload?.contacts || [];
      // Warmup missing contacts after login (fire-and-forget, with small delay
      // so WS is fully ready). Done in background — doesn't block handshake.
      setTimeout(() => warmupContacts("login").catch(() => {}), 2000);
      // Preload chat histories in background (50 msgs each)
      setTimeout(() => preloadHistories("login").catch(() => {}), 3500);
      for (const chat of cachedChats) { const cid = chat.chatId || chat.id; if (chat.lastMessage) addMessage(cid, chat.lastMessage); }
      console.log("[MAX] OK! chats:", cachedChats.length, "msgs:", Array.from(chatMessages.values()).reduce((s,m)=>s+m.length,0));
      cachedChats.forEach(c => send(75, { chatId: c.chatId || c.id, subscribe: true }));
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => { if (ws && ws.readyState === 1) send(1, { interactive: true }); }, 25000);
    }
    if (m.opcode === 19 && m.cmd === 3) { connected = false; }
    if (m.opcode === 64 && m.cmd === 1 && m.payload?.message) addMessage(m.payload.chatId, m.payload.message);
  } catch {}
}

function getContactName(uid) { const c = cachedContacts.find(c => (c.id || c.userId) == uid); return c?.names?.[0]?.name || c?.names?.[0]?.firstName || String(uid); }

// ───────── Contact warmup ─────────
// Loads contact data (name, avatar) for any chat whose contact is missing in cache.
// MAX chatId = viewerId XOR contactId, so we try BOTH cid directly and the XOR result.
// Safe to call repeatedly — idempotent.
let warmupInFlight = false;
async function warmupContacts(reason = "manual") {
  if (warmupInFlight) return { skipped: "in-flight" };
  if (!connected || !ws || ws.readyState !== 1) return { skipped: "not-connected" };
  warmupInFlight = true;
  try {
    const knownIds = new Set(cachedContacts.map(c => String(c.id || c.userId)));
    const missing = new Set();
    for (const chat of cachedChats) {
      const cid = chat.chatId || chat.id;
      if (!cid || cid < 0) continue;
      if (!knownIds.has(String(cid))) missing.add(Number(cid));
      if (userId) {
        const xor = Number(BigInt(userId) ^ BigInt(cid));
        if (xor > 0 && !knownIds.has(String(xor))) missing.add(xor);
      }
    }
    if (missing.size === 0) return { reason, loaded: 0, alreadyKnown: cachedContacts.length };

    const ids = Array.from(missing);
    let totalLoaded = 0;
    // Batch in chunks of 50 to avoid huge single payloads
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      try {
        const r = await request(32, { contactIds: batch }, 10000);
        const newContacts = r?.payload?.contacts || [];
        for (const c of newContacts) {
          const existing = cachedContacts.find(ec => (ec.id || ec.userId) === (c.id || c.userId));
          if (!existing) {
            cachedContacts.push(c);
            totalLoaded++;
          }
        }
      } catch (e) {
        console.log("[WARMUP] batch error:", e.message);
      }
    }
    console.log(`[WARMUP:${reason}] loaded ${totalLoaded} of ${ids.length} candidates; total in cache: ${cachedContacts.length}`);
    return { reason, requested: ids.length, loaded: totalLoaded, totalInCache: cachedContacts.length };
  } finally {
    warmupInFlight = false;
  }
}

// ───────── History fetching ─────────
// MAX opcode 49 = GET_HISTORY. Fetches N messages backwards from a timestamp.
// We use it to populate chatMessages cache beyond just the one lastMessage
// from handshake, and to let CRM lazy-load older history on demand.
async function fetchHistory(chatId, before = Date.now(), count = 50) {
  if (!connected || !ws || ws.readyState !== 1) return [];
  try {
    const r = await request(49, { chatId: Number(chatId), from: Number(before), forward: 0, backward: Number(count), getMessages: true }, 10000);
    const msgs = r?.payload?.messages || [];
    // Add to cache (addMessage dedups by id)
    for (const m of msgs) addMessage(Number(chatId), m);
    return msgs;
  } catch (e) {
    console.log("[HISTORY]", chatId, "err:", e.message);
    return [];
  }
}

// Preload last N messages of every chat so CRM shows actual conversation
// instead of just the last message. Fire-and-forget, batched.
let preloadInFlight = false;
async function preloadHistories(reason = "manual", perChat = 50) {
  if (preloadInFlight) return { skipped: "in-flight" };
  if (!connected) return { skipped: "not-connected" };
  preloadInFlight = true;
  const start = Date.now();
  let totalLoaded = 0, processed = 0;
  try {
    for (const chat of cachedChats) {
      const cid = chat.chatId || chat.id;
      if (!cid || cid < 0) continue;
      const existing = chatMessages.get(cid) || [];
      if (existing.length >= perChat) { processed++; continue; }
      const msgs = await fetchHistory(cid, Date.now(), perChat);
      totalLoaded += msgs.length;
      processed++;
      // tiny delay between chats to avoid hammering the server
      await new Promise(r => setTimeout(r, 80));
    }
    console.log(`[PRELOAD:${reason}] ${processed} chats, loaded ${totalLoaded} msgs in ${Date.now() - start}ms`);
    return { reason, chats: processed, loaded: totalLoaded };
  } finally {
    preloadInFlight = false;
  }
}

function parseAttaches(attaches) {
  if (!attaches || !Array.isArray(attaches)) return [];
  return attaches.map(a => {
    // File IDs can come in different fields depending on attach type
    const fid = a.fileId || a.audioId || a.videoId || a.photoId || null;
    const token = a.token || a.photoToken || null;
    // Direct download URL for files/audio
    let url = a.url || (fid && token && a._type !== "PHOTO" ? "https://fu.oneme.ru/api/download.do?id=" + fid + "&token=" + token : null);
    // Photo preview (data URI) — inline thumbnail
    const previewData = a.preview?.previewData || a.previewData || null;
    // Photo full-res URL (image server)
    const photoUrl = a.baseUrl || a.sizes?.L?.url || a.sizes?.XL?.url || a.sizes?.ORIG?.url || null;
    // For photos, we want a usable href
    if (a._type === "PHOTO" || a._type === "IMAGE" || a._type === "STICKER") {
      url = url || photoUrl;
    }
    if (fid) fileIndex.set(String(fid), { token, name: a.name, size: a.size, type: a._type, url, preview: previewData || photoUrl });
    return {
      type: a._type,
      name: a.name,
      size: a.size,
      fileId: fid,
      duration: a.duration,
      url,
      preview: previewData || photoUrl,
      photoToken: a.photoToken || null,
      photoId: a.photoId || null,
    };
  });
}

// Store raw attaches per message id for debugging + for endpoints that need
// access to original MAX payload fields (e.g. photoToken for PHOTO downloads).
const rawAttaches = new Map(); // msg.id -> original attaches[]
const rawMessages = new Map(); // msg.id -> full original message (for fwd/reactions)

// Reactions parser — MAX puts them in reactionInfo: { counters: [{reaction: "❤", count: 2}], ... }
function parseReactions(reactionInfo) {
  if (!reactionInfo || typeof reactionInfo !== "object") return null;
  const counters = reactionInfo.counters || reactionInfo.reactions || [];
  if (!Array.isArray(counters) || counters.length === 0) return null;
  return counters.map(c => ({
    emoji: c.reaction || c.emoji || "👍",
    count: Number(c.count || 1),
  }));
}

// Forwarded-from parser — MAX puts forward chain in `link` (LinkedMessage) or `forwarded` field
function parseForwardedFrom(msg) {
  // Handle different MAX schemas: link.message, forwarded, or repliedTo
  const fwd = msg.link || msg.forwarded || msg.forward;
  if (!fwd) return null;
  // link can be a LinkedMessage with type:"FORWARD" and message/sender inside
  if (fwd.type && fwd.type !== "FORWARD" && fwd.type !== "QUOTE") return null;
  const inner = fwd.message || fwd;
  return {
    senderName: inner.senderName || (fwd.chat?.title) || (typeof inner.sender === "number" ? getContactName(inner.sender) : null),
    senderId: inner.sender || null,
    text: inner.text || null,
  };
}

// Reply parser — MAX puts replied message in `link` with type:"REPLY"
function parseReplyTo(msg) {
  const link = msg.link;
  if (!link || link.type !== "REPLY") return null;
  const inner = link.message;
  if (!inner) return null;
  return {
    id: String(inner.id || ""),
    senderName: typeof inner.sender === "number" ? getContactName(inner.sender) : null,
    text: inner.text || null,
  };
}

function addMessage(chatId, msg) {
  if (!msg || !msg.id) return;
  if (!chatMessages.has(chatId)) chatMessages.set(chatId, []);
  const msgs = chatMessages.get(chatId);
  if (msgs.find(m => m.id === msg.id)) return;
  if (msg.attaches && msg.attaches.length) rawAttaches.set(String(msg.id), msg.attaches);
  rawMessages.set(String(msg.id), msg);
  const att = parseAttaches(msg.attaches);
  for (const a of att) { if (a.fileId && fileIndex.has(String(a.fileId))) { const fi = fileIndex.get(String(a.fileId)); fi.chatId = chatId; fi.messageId = msg.id; } }
  msgs.push({
    id: msg.id,
    text: msg.text || "",
    sender: getContactName(msg.sender),
    senderId: msg.sender,
    time: msg.time,
    attaches: att,
    reactions: parseReactions(msg.reactionInfo),
    forwardedFrom: parseForwardedFrom(msg),
    replyTo: parseReplyTo(msg),
  });
  msgs.sort((a, b) => (a.time || 0) - (b.time || 0));
  if (msgs.length > 200) chatMessages.set(chatId, msgs.slice(-200));
}

function connect() {
  if (!MAX_TOKEN || (ws && ws.readyState === 1)) return;
  console.log("[MAX] Connecting...");
  ws = new WebSocket(WS_URL, { headers: { Origin: "https://web.max.ru", "User-Agent": "Mozilla/5.0 Chrome/146.0.0.0" } });
  ws.on("open", () => send(6, { deviceId: "web_crm_artevo", userAgent: { deviceType: "WEB", locale: "ru", deviceLocale: "ru", osVersion: "Android", deviceName: "Chrome" }, headerUserAgent: "Mozilla/5.0 Chrome/146.0.0.0" }));
  ws.on("message", r => handleWsMessage(r.toString()));
  ws.on("close", () => { console.log("[MAX] Disconnected"); connected = false; ws = null; if (pingInterval) { clearInterval(pingInterval); pingInterval = null; } for (const [,v] of pending) v.resolve(null); pending.clear(); setTimeout(connect, 5000); });
  ws.on("error", () => {});
}

function forceRefresh() {
  return new Promise(resolve => {
    if (ws) { ws.close(); ws = null; connected = false; }
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    for (const [,v] of pending) v.resolve(null); pending.clear();
    setTimeout(() => {
      const w = new WebSocket(WS_URL, { headers: { Origin: "https://web.max.ru", "User-Agent": "Mozilla/5.0 Chrome/146.0.0.0" } });
      const to = setTimeout(() => { w.close(); connect(); resolve(false); }, 12000);
      let s = 0;
      w.on("open", () => w.send(JSON.stringify({ ver: 11, cmd: 0, seq: s++, opcode: 6, payload: { deviceId: "web_crm_artevo", userAgent: { deviceType: "WEB", locale: "ru", deviceLocale: "ru", osVersion: "Android", deviceName: "Chrome" }, headerUserAgent: "Mozilla/5.0 Chrome/146.0.0.0" } })));
      w.on("message", d => {
        try {
          const safed = d.toString().replace(/:\s*(\d{16,})/g, ':"$1"');
          const m = JSON.parse(safed);
          if (m.opcode === 6 && m.cmd === 1) w.send(JSON.stringify({ ver: 11, cmd: 0, seq: s++, opcode: 19, payload: { token: MAX_TOKEN, chatsCount: 40, chatsSync: 0, contactsSync: 0, draftsSync: 0, presenceSync: -1, lastLogin: Date.now(), interactive: false } }));
          if (m.opcode === 19 && m.cmd === 1 && m.payload?.profile) {
            clearTimeout(to);
            cachedChats = m.payload?.chats || cachedChats;
            cachedContacts = m.payload?.contacts || cachedContacts;
            for (const chat of cachedChats) { const cid = chat.chatId || chat.id; if (chat.lastMessage) addMessage(cid, chat.lastMessage); }
            console.log("[Refresh] OK! msgs:", Array.from(chatMessages.values()).reduce((s,m)=>s+m.length,0));
            ws = w; connected = true; seq = s;
            cachedChats.forEach(c => send(75, { chatId: c.chatId || c.id, subscribe: true }));
            pingInterval = setInterval(() => { if (ws && ws.readyState === 1) send(1, { interactive: true }); }, 25000);
            ws.removeAllListeners("message"); ws.removeAllListeners("close");
            ws.on("message", r => handleWsMessage(r.toString()));
            ws.on("close", () => { connected = false; ws = null; if (pingInterval) { clearInterval(pingInterval); pingInterval = null; } for (const [,v] of pending) v.resolve(null); pending.clear(); setTimeout(connect, 5000); });
            // Warmup after successful reconnect
            setTimeout(() => warmupContacts("refresh").catch(() => {}), 2000);
            resolve(true);
          }
        } catch {}
      });
      w.on("error", () => { clearTimeout(to); connect(); resolve(false); });
    }, 1000);
  });
}

async function getFileUploadUrl() {
  for (let i = 0; i < 3; i++) {
    if (!ws || ws.readyState !== 1) { await new Promise(r => setTimeout(r, 2000)); continue; }
    const r = await request(87, { count: 1 }, 8000);
    if (r?.payload?.info?.[0]) return r.payload.info[0];
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

function uploadFileToMax(info, buf, name, ct) {
  return new Promise((resolve, reject) => {
    const u = new URL(info.url);
    const r = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method: "POST", headers: { "Content-Type": ct || "application/octet-stream", "Content-Disposition": "attachment; filename=" + encodeURIComponent(name), "Content-Range": "0-" + (buf.length-1) + "/" + buf.length, "Content-Length": buf.length, Origin: "https://web.max.ru" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => resolve({ status: res.statusCode, body: b, fileId: info.fileId })); });
    r.on("error", reject); r.write(buf); r.end();
  });
}

function tryDownload(urls, idx, info, res) {
  if (idx >= urls.length) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Download failed" })); return; }
  const url = urls[idx];
  const p = new URL(url);
  const r = https.request({ hostname: p.hostname, port: 443, path: p.pathname + p.search, method: "GET", headers: { "User-Agent": "Mozilla/5.0 Chrome/146.0.0.0", Origin: "https://web.max.ru", Referer: "https://web.max.ru/" } }, dl => {
    if (dl.statusCode === 301 || dl.statusCode === 302 || dl.statusCode === 307) { const loc = dl.headers.location; if (loc) urls.splice(idx+1,0,loc); let b=""; dl.on("data",c=>b+=c); dl.on("end",()=>tryDownload(urls,idx+1,info,res)); return; }
    if (dl.statusCode === 200 && dl.headers["content-type"] && !dl.headers["content-type"].includes("text/html")) {
      const fn = info?.name || "file"; const h = { "Content-Type": dl.headers["content-type"], "Content-Disposition": "attachment; filename=\"" + encodeURIComponent(fn) + "\"", "Access-Control-Allow-Origin": "*" };
      if (dl.headers["content-length"]) h["Content-Length"] = dl.headers["content-length"];
      res.writeHead(200, h); dl.pipe(res);
    } else { let b=""; dl.on("data",c=>b+=c); dl.on("end",()=>tryDownload(urls,idx+1,info,res)); }
  });
  r.on("error", () => tryDownload(urls,idx+1,info,res)); r.end();
}

// ── HTTP SERVER ──
const srv = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }
  if (req.headers.authorization !== API_KEY) { res.writeHead(401); res.end('{"error":"Unauthorized"}'); return; }
  const u = new URL(req.url, "http://localhost:" + PORT);

  if (u.pathname === "/status") { const t = Array.from(chatMessages.values()).reduce((s,m)=>s+m.length,0); res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ connected, userId, chatsCount: cachedChats.length, contactsCount: cachedContacts.length, totalMessages: t, filesIndexed: fileIndex.size })); return; }
  if (u.pathname === "/refresh") { const t = Array.from(chatMessages.values()).reduce((s,m)=>s+m.length,0); res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ ok: true, totalMessages: t })); return; }
  // Fetch missing contacts by IDs (opcode 32)
  // Mark chat as read/unread (opcode 50)
  if (u.pathname === "/mark-read" && req.method === "POST") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    let b = ""; req.on("data", c => b += c); req.on("end", async () => {
      try {
        const { chatId, messageId } = JSON.parse(b);
        if (!chatId) { res.writeHead(400); res.end('{"error":"chatId required"}'); return; }
        const chat = cachedChats.find(c => (c.chatId||c.id) == chatId);
        const lastMsgId = messageId || chat?.lastMessage?.id;
        const r = await request(50, { type: "READ_MESSAGE", chatId: Number(chatId), messageId: lastMsgId, mark: chat?.lastMessage?.time || Date.now() }, 5000);
        if (chat) { chat.markedAsUnread = false; if (chat.participants) chat.participants[String(userId)] = chat.lastMessage?.time || Date.now(); }
        res.writeHead(200, {"Content-Type":"application/json"});
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }

  if (u.pathname === "/mark-unread" && req.method === "POST") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    let b = ""; req.on("data", c => b += c); req.on("end", async () => {
      try {
        const { chatId } = JSON.parse(b);
        if (!chatId) { res.writeHead(400); res.end('{"error":"chatId required"}'); return; }
        const chat = cachedChats.find(c => (c.chatId||c.id) == chatId);
        const r = await request(50, { type: "SET_AS_UNREAD", chatId: Number(chatId), mark: 1 }, 5000);
        if (chat) chat.markedAsUnread = true;
        res.writeHead(200, {"Content-Type":"application/json"});
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }

  if (u.pathname === "/load-contacts" && req.method === "POST") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    let b = ""; req.on("data", c => b += c); req.on("end", async () => {
      try {
        const { ids } = JSON.parse(b);
        if (!Array.isArray(ids)) { res.writeHead(400); res.end('{"error":"ids array required"}'); return; }
        const r = await request(32, { contactIds: ids }, 8000);
        console.log("[LOAD-CONTACTS] result has", r?.payload?.contacts?.length || 0, "contacts");
        const contacts = r?.payload?.contacts || [];
        // Add to cache
        for (const c of contacts) {
          const existing = cachedContacts.find(ec => (ec.id||ec.userId) === (c.id||c.userId));
          if (!existing) cachedContacts.push(c);
        }
        res.writeHead(200, {"Content-Type":"application/json"});
        res.end(JSON.stringify({ ok: true, count: contacts.length, contacts: contacts.map(c => ({ id: c.id||c.userId, name: c.names?.[0]?.name||c.names?.[0]?.firstName||"", phone: c.phone, avatar: c.baseUrl||null })) }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }

  if (u.pathname === "/debug-raw") {
    const chatId = Number(u.searchParams.get("chatId"));
    if (!chatId) { res.writeHead(400); res.end('{"error":"chatId required"}'); return; }
    const msgs = chatMessages.get(chatId) || [];
    const samples = [];
    for (const m of msgs.slice(-20)) {
      const raw = rawMessages.get(String(m.id));
      if (raw) samples.push(raw);
      if (samples.length >= 10) break;
    }
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({ chatId, samples }));
    return;
  }

  if (u.pathname === "/debug-attach") {
    const chatId = Number(u.searchParams.get("chatId"));
    if (!chatId) { res.writeHead(400); res.end('{"error":"chatId required"}'); return; }
    const msgs = chatMessages.get(chatId) || [];
    const samples = [];
    for (const m of msgs.slice(-30)) {
      const raw = rawAttaches.get(String(m.id));
      if (raw && raw.length) samples.push({ msgId: m.id, senderId: m.senderId, raw });
      if (samples.length >= 5) break;
    }
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({ chatId, samples }));
    return;
  }

  if (u.pathname === "/warmup") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    const result = await warmupContacts("manual");
    res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify(result)); return;
  }

  if (u.pathname === "/chats") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    // Build contactId -> contact lookup for fast avatar/name resolution
    const contactMap = new Map();
    for (const c of cachedContacts) contactMap.set(String(c.id || c.userId), c);
    const e = cachedChats.map(c => {
      const cid = c.chatId || c.id;
      const msgs = chatMessages.get(cid) || [];
      const xorUserId = userId ? Number(BigInt(userId) ^ BigInt(cid)) : null;
      // Try both: direct chatId as userId, then XOR result
      let contact = contactMap.get(String(cid)) || (xorUserId ? contactMap.get(String(xorUserId)) : null);
      const name = contact?.names?.[0]?.name || contact?.names?.[0]?.firstName || c.title || getContactName(cid);
      const phone = contact?.phone || null;
      const avatar = contact?.baseUrl || c.icon || null;
      // Unread detection: lastMessage.time > my readMark
      const myReadMark = c.participants?.[String(userId)] || 0;
      const lastMsgTime = c.lastMessage?.time || 0;
      const lastMsgFromMe = c.lastMessage?.sender === userId;
      const isUnread = !lastMsgFromMe && lastMsgTime > myReadMark;
      const markedAsUnread = !!c.markedAsUnread;
      return {
        chatId: cid,
        title: name,
        avatar,
        phone,
        lastMessage: msgs[msgs.length-1] || null,
        messageCount: msgs.length,
        unread: isUnread || markedAsUnread,
        unreadCount: c.newMessages || (isUnread ? 1 : 0),
      };
    });
    // Lazy warmup: if >30% of chats are still numeric (no contact found), kick off
    // a background warmup so next /chats call has them.
    const numericTitles = e.filter((x) => x.title && /^\d+$/.test(String(x.title))).length;
    if (numericTitles > 0 && numericTitles / e.length > 0.3) {
      warmupContacts("lazy-chats").catch(() => {});
    }
    res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ chats: e })); return;
  }
  if (u.pathname === "/messages") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    const cid = Number(u.searchParams.get("chatId"));
    const count = Number(u.searchParams.get("count") || "50");
    if (!cid) { res.writeHead(400); res.end('{"error":"chatId required"}'); return; }
    // Lazy-load: if cache has fewer than requested, fetch more via opcode 49
    const cached = chatMessages.get(cid) || [];
    if (cached.length < count) {
      await fetchHistory(cid, Date.now(), count);
    }
    const result = (chatMessages.get(cid) || []).slice(-count);
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({ messages: result }));
    return;
  }

  // Explicit history fetch — load older messages before a timestamp
  if (u.pathname === "/history") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    const cid = Number(u.searchParams.get("chatId"));
    const before = Number(u.searchParams.get("before") || Date.now());
    const count = Number(u.searchParams.get("count") || "50");
    if (!cid) { res.writeHead(400); res.end('{"error":"chatId required"}'); return; }
    const msgs = await fetchHistory(cid, before, count);
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({ fetched: msgs.length, messages: (chatMessages.get(cid) || []) }));
    return;
  }

  // Manual preload all histories (for UI button)
  if (u.pathname === "/preload-histories") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    const result = await preloadHistories("manual", 100);
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify(result));
    return;
  }

  if (u.pathname === "/download-url") {
    const fid = u.searchParams.get("fileId"); let cid = u.searchParams.get("chatId")||"0"; let mid = u.searchParams.get("messageId")||"0";
    if (!fid) { res.writeHead(400); res.end('{"error":"fileId required"}'); return; }
    const info = fileIndex.get(String(fid));
    if ((!cid||cid==="0") && info?.chatId) cid = String(info.chatId);
    if ((!mid||mid==="0") && info?.messageId) mid = String(info.messageId);
    const url = await requestRaw(88, `{"fileId":${fid},"chatId":${cid},"messageId":${mid}}`, 8000);
    res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ url: url?.payload?.url||null, fileId: fid })); return;
  }

  if (u.pathname === "/download") {
    const fid = u.searchParams.get("fileId"); const cid = u.searchParams.get("chatId")||"0"; const mid = u.searchParams.get("messageId")||"0";
    if (!fid) { res.writeHead(400); res.end('{"error":"fileId required"}'); return; }
    const info = fileIndex.get(String(fid)); const urls = [];
    const signedUrl = await requestRaw(88, `{"fileId":${fid},"chatId":${cid},"messageId":${mid}}`, 8000);
    if (signedUrl?.payload?.url) urls.push(signedUrl.payload.url);
    if (info?.url) urls.push(info.url);
    if (info?.preview) urls.push(info.preview);
    if (urls.length === 0) { res.writeHead(404, {"Content-Type":"application/json"}); res.end(JSON.stringify({ error: "No download URL" })); return; }
    tryDownload(urls, 0, info, res); return;
  }

  if (u.pathname === "/files") { const f = {}; fileIndex.forEach((v,k) => { f[k] = { name: v.name, type: v.type, url: v.url, preview: v.preview }; }); res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ count: fileIndex.size, files: f })); return; }

  // Add contact by phone
  if (u.pathname === "/add-contact" && req.method === "POST") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    let b = ""; req.on("data", c => b += c); req.on("end", async () => {
      try {
        const { phone, firstName, lastName } = JSON.parse(b);
        if (!phone) { res.writeHead(400); res.end('{"error":"phone required"}'); return; }
        const clean = phone.replace(/\D/g, "");
        // Try opcode 46 (search by phone), then 41 (add by phone)
        let result = await request(46, { phone: clean }, 6000);
        if (!result?.payload?.contact) {
          result = await request(41, { phone: clean, firstName: firstName||"", lastName: lastName||"" }, 6000);
        }
        if (result?.payload?.contact) {
          const c = result.payload.contact;
          const chatId = Number(BigInt(userId) ^ BigInt(c.id));
          res.writeHead(200, {"Content-Type":"application/json"});
          res.end(JSON.stringify({ ok: true, contact: { id: c.id, name: c.names?.[0]?.name || c.names?.[0]?.firstName || firstName || phone, phone: c.phone, avatar: c.baseUrl || null }, chatId }));
        } else {
          res.writeHead(200, {"Content-Type":"application/json"});
          res.end(JSON.stringify({ ok: false, error: "Contact not found by phone" }));
        }
      } catch (e) { res.writeHead(500, {"Content-Type":"application/json"}); res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }

  // Send message
  if (u.pathname === "/send" && req.method === "POST") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    let b = ""; req.on("data", c => b += c); req.on("end", async () => {
      try {
        const { chatId, text, fileId } = JSON.parse(b);
        const msg = { cid: -Date.now(), elements: [], attaches: [] };
        if (text) msg.text = text;
        if (fileId) msg.attaches = [{ _type: "FILE", fileId: Number(fileId) }];
        const r = await request(64, { chatId: Number(chatId), message: msg, notify: true }, 15000);
        if (r && r.cmd === 3) { res.writeHead(400); res.end(JSON.stringify({ error: r.payload?.message || "Failed" })); return; }
        if (r?.payload?.message) addMessage(chatId, r.payload.message);
        res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }

  // Upload
  if (u.pathname === "/upload" && req.method === "POST") {
    if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; }
    const ch = []; req.on("data", c => ch.push(c)); req.on("end", async () => {
      try {
        const buf = Buffer.concat(ch); const nm = u.searchParams.get("name")||"file"; const ct = req.headers["content-type"]||"application/octet-stream";
        const info = await getFileUploadUrl();
        if (!info) { res.writeHead(500); res.end('{"error":"No URL"}'); return; }
        const r = await uploadFileToMax(info, buf, nm, ct);
        if (r.status !== 200) { res.writeHead(500); res.end('{"error":"Upload failed"}'); return; }
        await new Promise(r => setTimeout(r, 3000));
        res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ fileId: r.fileId }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }

  if (u.pathname === "/contacts") { if (!connected) { res.writeHead(503); res.end('{"error":"Not connected"}'); return; } res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ contacts: cachedContacts.map(c => ({ id: c.id||c.userId, name: c.names?.[0]?.name||c.names?.[0]?.firstName||"?", phone: c.phone, avatar: c.baseUrl||null })) })); return; }

  res.writeHead(404); res.end('{"error":"Not found"}');
});

srv.listen(PORT, () => { console.log("[Proxy] Port", PORT); connect(); });

// Auto-refresh every 60s
setInterval(async () => {
  await forceRefresh();
  const t = Array.from(chatMessages.values()).reduce((s,m)=>s+m.length,0);
  console.log("[Auto] msgs:", t);
  await checkNewContacts();
}, 60000);

// Periodic contact warmup every 5 min — catches contacts added to chats after
// initial login and prevents the "names disappeared after a while" problem.
setInterval(() => {
  warmupContacts("periodic").catch((e) => console.log("[WARMUP:periodic] err:", e.message));
}, 5 * 60 * 1000);

// ── AUTO-LEAD CREATION FROM MAX CONTACTS ──
async function sbQuery(path, method, body) {
  if (!SUPABASE_KEY) return [];
  const url = SUPABASE_URL + path;
  const opts = { method: method || "GET", headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", Prefer: method === "POST" || method === "PATCH" ? "return=representation" : "" } };
  if (body) opts.body = JSON.stringify(body);
  try { const r = await fetch(url, opts); return r.json(); } catch { return []; }
}

let lastAutoLeadCheck = 0;
async function checkNewContacts() {
  if (!SUPABASE_KEY || Date.now() - lastAutoLeadCheck < 300000) return;
  lastAutoLeadCheck = Date.now();
  try {
    const admins = await sbQuery("/rest/v1/users?role=eq.admin&select=id&limit=1");
    const adminId = admins?.[0]?.id;
    if (!adminId) return;
    const funnels = await sbQuery("/rest/v1/funnels?type=eq.lead&is_default=eq.true&select=id&limit=1");
    const funnelId = funnels?.[0]?.id || null;
    let stageId = null;
    if (funnelId) { const stages = await sbQuery("/rest/v1/funnel_stages?funnel_id=eq." + funnelId + "&select=id&order=sort_order&limit=1"); stageId = stages?.[0]?.id || null; }

    // Build contact lookup
    const contactMap = new Map();
    for (const c of cachedContacts) contactMap.set(String(c.id || c.userId), c);

    for (const chat of cachedChats) {
      const cid = String(chat.chatId || chat.id);
      if (!cid || Number(cid) < 0) continue;

      // Get the other user ID
      const xorUserId = userId ? Number(BigInt(userId) ^ BigInt(cid)) : null;
      // Try both: direct chatId as userId, then XOR result
      let contact = contactMap.get(String(cid)) || (xorUserId ? contactMap.get(String(xorUserId)) : null);
      const name = contact?.names?.[0]?.name || contact?.names?.[0]?.firstName || chat.title || "";
      const phone = contact?.phone ? String(contact.phone) : null;
      const avatarUrl = contact?.baseUrl || null;

      if (!name && !phone) continue;

      // Check if contact already exists by phone or maks_id
      let dbContact = null;
      if (phone) {
        const cleanPhone = phone.replace(/\D/g, "").slice(-10);
        const byPhone = await sbQuery("/rest/v1/contacts?phone=ilike.%25" + cleanPhone + "%25&select=id,full_name,phone,maks_id&limit=1");
        if (byPhone?.length > 0) dbContact = byPhone[0];
      }
      if (!dbContact) {
        const byMaks = await sbQuery("/rest/v1/contacts?maks_id=eq." + cid + "&select=id,full_name,phone,maks_id&limit=1");
        if (byMaks?.length > 0) dbContact = byMaks[0];
      }

      let contactId;
      if (dbContact) {
        // Update missing fields
        const updates = {};
        if (name && (!dbContact.full_name || dbContact.full_name === cid || dbContact.full_name.match(/^\d+$/))) updates.full_name = name;
        if (phone && !dbContact.phone) updates.phone = phone;
        if (!dbContact.maks_id) updates.maks_id = cid;
        if (Object.keys(updates).length > 0) {
          await sbQuery("/rest/v1/contacts?id=eq." + dbContact.id, "PATCH", updates);
        }
        contactId = dbContact.id;
      } else {
        // Create new contact
        const nc = await sbQuery("/rest/v1/contacts", "POST", {
          full_name: name || phone || cid,
          phone: phone || null,
          maks_id: cid,
          created_by: adminId,
        });
        contactId = nc?.[0]?.id;
        if (!contactId) continue;
      }

      // Check if lead already exists
      const leads = await sbQuery("/rest/v1/leads?source=eq.maks&contact_id=eq." + contactId + "&select=id&limit=1");
      if (leads?.length > 0) continue;

      // Create lead
      await sbQuery("/rest/v1/leads", "POST", {
        title: "МАКС: " + (name || phone || cid),
        source: "maks",
        status: "new",
        contact_id: contactId,
        funnel_id: funnelId,
        stage_id: stageId,
        created_by: adminId,
      });
      console.log("[AUTO-LEAD] Created: МАКС " + (name || phone || cid));
    }
  } catch (e) { console.log("[AUTO-LEAD] Error:", e.message); }
}

// Long-lived Telegram proxy for Artevo CRM
// Single gramJS client, runs as systemd service on VPS.
// Vercel calls this over HTTP to avoid AUTH_KEY_DUPLICATED from multiple lambdas.

const http = require("http");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const { ConnectionTCPFull } = require("telegram/network");
const bigInt = require("big-integer");

const PORT = Number(process.env.PORT || 3300);
const API_KEY = process.env.API_KEY || "artevo-tg-proxy-2026";
const API_ID = Number(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const SESSION = process.env.TELEGRAM_SESSION || "";

if (!API_ID || !API_HASH || !SESSION) {
  console.error("Missing TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION");
  process.exit(1);
}

const session = new StringSession(SESSION);

const client = new TelegramClient(session, API_ID, API_HASH, {
  connectionRetries: 999,
  retryDelay: 2000,
  autoReconnect: true,
  useWSS: false,
  // TCPFull — needed because RU ISPs block the Telegram-specific obfuscated
  // transport on 443. Port 80 is open here.
  connection: ConnectionTCPFull,
});

// MONKEY-PATCH: gramJS hardcodes port 443 in getDC(). Force port 80.
// RU networks block 443 for Telegram DCs but leave 80 open.
const origGetDC = client.getDC.bind(client);
client.getDC = async function (dcId, downloadDC = false, web = false) {
  const dc = await origGetDC(dcId, downloadDC, web);
  if (dc && dc.port === 443) dc.port = 80;
  return dc;
};

// Force session port 80 on startup
try {
  const anyS = session;
  if (anyS._port && anyS._port !== 80) anyS._port = 80;
} catch {}

try { client.setLogLevel("error"); } catch {}

let connected = false;
let connecting = false;
let connectError = null;

async function ensureConnected() {
  if (connected) return;
  if (connecting) {
    for (let i = 0; i < 100 && connecting; i++) await new Promise((r) => setTimeout(r, 100));
    return;
  }
  connecting = true;
  connectError = null;
  try {
    await client.connect();
    connected = true;
    const me = await client.getMe();
    console.log("[telegram-proxy] connected as", me?.username || me?.firstName || "user");
    // Preload all dialogs into entity cache so numeric-id lookups work
    warmupEntities("connect").catch(() => {});
  } catch (e) {
    connectError = String(e);
    console.error("[telegram-proxy] connect failed:", connectError);
  } finally {
    connecting = false;
  }
}

// Periodic ping to detect disconnects
setInterval(async () => {
  try {
    if (!connected) return;
    await client.invoke(new Api.help.GetNearestDc());
  } catch (e) {
    console.error("[telegram-proxy] ping failed:", String(e).slice(0, 200));
    connected = false;
  }
}, 60000);

// Periodic entity-cache warmup — catches new incoming chats
setInterval(() => {
  if (connected) warmupEntities("periodic").catch(() => {});
}, 10 * 60 * 1000);

// ───────── helpers ─────────

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function extractMediaInfo(msg) {
  const media = msg.media;
  if (!media) return null;
  const className = media.className ?? media.constructor?.name ?? "";

  if (className === "MessageMediaPhoto") {
    return { type: "photo", fileName: null, mimeType: "image/jpeg", duration: null };
  }
  if (className === "MessageMediaDocument") {
    const doc = media.document;
    const attrs = doc?.attributes ?? [];
    const isVoice = attrs.some((a) => a.className === "DocumentAttributeAudio" && a.voice);
    const isAudio = attrs.some((a) => a.className === "DocumentAttributeAudio");
    const isVideo = attrs.some((a) => a.className === "DocumentAttributeVideo");
    const isSticker = attrs.some((a) => a.className === "DocumentAttributeSticker");
    const fileAttr = attrs.find((a) => a.className === "DocumentAttributeFilename");
    const audioAttr = attrs.find((a) => a.className === "DocumentAttributeAudio");
    let type = "document";
    if (isVoice) type = "voice";
    else if (isAudio) type = "audio";
    else if (isVideo) type = "video";
    else if (isSticker) type = "sticker";
    return {
      type,
      fileName: fileAttr?.fileName ?? null,
      mimeType: doc?.mimeType ?? "application/octet-stream",
      duration: audioAttr?.duration ?? null,
    };
  }
  if (className === "MessageMediaWebPage") {
    const page = media.webpage;
    return {
      type: "webpage",
      fileName: null,
      mimeType: null,
      duration: null,
      url: page?.url ?? null,
      title: page?.title ?? null,
      description: page?.description ?? null,
    };
  }
  return { type: "unsupported", fileName: null, mimeType: null, duration: null };
}

// ───────── Entity cache ─────────
// gramJS can only resolve a user/chat by numeric ID if it has already seen
// the corresponding InputPeer (with access_hash). We proactively iterate
// dialogs on startup and cache every entity by its id string so CRM can look
// up chats by plain numeric peer without hitting "Could not find input entity".
const entityCache = new Map(); // id(string) -> InputPeer / entity
let lastWarmup = 0;

async function warmupEntities(reason = "manual") {
  const start = Date.now();
  let count = 0;
  try {
    for await (const dialog of client.iterDialogs({ limit: 500 })) {
      if (!dialog.entity) continue;
      const id = String(dialog.id);
      entityCache.set(id, dialog.entity);
      // Also cache by username for faster lookups
      if (dialog.entity.username) {
        entityCache.set("@" + String(dialog.entity.username).toLowerCase(), dialog.entity);
      }
      count++;
    }
    // Also include contacts not yet in dialogs (saved contacts without chats)
    try {
      const res = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
      for (const u of res.users ?? []) {
        entityCache.set(String(u.id), u);
        if (u.username) entityCache.set("@" + String(u.username).toLowerCase(), u);
        count++;
      }
    } catch {}
    lastWarmup = Date.now();
    console.log(`[tg-warmup:${reason}] cached ${count} entities in ${Date.now() - start}ms`);
  } catch (e) {
    console.error("[tg-warmup] error:", e?.message || String(e));
  }
}

async function resolvePeer(peer) {
  // 1) Exact entity cache hit (by numeric id or @username)
  const key = String(peer);
  if (entityCache.has(key)) return entityCache.get(key);
  const lowered = key.toLowerCase();
  if (entityCache.has(lowered)) return entityCache.get(lowered);
  if (lowered.startsWith("@") && entityCache.has(lowered)) return entityCache.get(lowered);

  // 2) If looks like @username, let gramJS resolve it (doesn't need access_hash)
  if (/^@?[a-zA-Z][a-zA-Z0-9_]{3,}$/.test(key)) {
    try {
      const e = await client.getEntity(key);
      entityCache.set(String(e.id), e);
      return e;
    } catch {}
  }

  // 3) Numeric-only input: re-warmup (maybe dialog appeared since last cache)
  //    but only if last warmup was >30s ago to avoid hammering
  if (/^-?\d+$/.test(key) && Date.now() - lastWarmup > 30000) {
    await warmupEntities("miss-" + key);
    if (entityCache.has(key)) return entityCache.get(key);
  }

  // 4) Last resort: let gramJS try directly. May fail with "input entity" error.
  return await client.getEntity(peer);
}

async function downloadProfilePhotoBase64(entity) {
  try {
    if (!entity || !entity.photo) return null;
    const buf = await client.downloadProfilePhoto(entity, { isBig: false });
    if (buf && buf.length > 0) {
      return `data:image/jpeg;base64,${Buffer.from(buf).toString("base64")}`;
    }
  } catch {}
  return null;
}

// ───────── routes ─────────

const routes = {
  "GET /status": async () => ({ ok: true, connected, error: connectError }),

  "GET /dialogs": async () => {
    await ensureConnected();
    const dialogs = [];
    for await (const dialog of client.iterDialogs({ limit: 100 })) {
      const entity = dialog.entity;
      if (!entity) continue;
      // Cache entity by numeric id for later resolvePeer lookups
      entityCache.set(String(dialog.id), entity);
      if (entity.username) entityCache.set("@" + String(entity.username).toLowerCase(), entity);
      const photoUrl = await downloadProfilePhotoBase64(entity);
      dialogs.push({
        id: dialog.id?.toString(),
        name: dialog.name ?? "Unknown",
        username: entity.username ?? null,
        phone: entity.phone ?? null,
        photoUrl,
        unreadCount: dialog.unreadCount ?? 0,
        lastMessage: dialog.message?.message ?? "",
        lastDate: dialog.message?.date ?? null,
        isUser: !!dialog.isUser,
        isGroup: !!dialog.isGroup,
        isChannel: !!dialog.isChannel,
      });
    }
    return { dialogs };
  },

  "POST /messages": async (body) => {
    await ensureConnected();
    const { peer, limit = 50, offsetId } = body;
    if (!peer) throw new Error("peer required");

    const entity = await resolvePeer(peer);
    const opts = { limit };
    if (offsetId && offsetId > 0) opts.offsetId = offsetId;

    const messages = [];
    for await (const m of client.iterMessages(entity, opts)) {
      // Reactions: m.reactions.results = [{ reaction: { emoticon: "👍" }, count: 2 }]
      let reactions = null;
      if (m.reactions?.results?.length) {
        reactions = m.reactions.results.map((r) => ({
          emoji: r.reaction?.emoticon || r.reaction?.documentId || "👍",
          count: Number(r.count || 1),
        }));
      }
      // Forwarded-from: m.fwdFrom = MessageFwdHeader
      let forwardedFrom = null;
      if (m.fwdFrom) {
        const fh = m.fwdFrom;
        forwardedFrom = {
          senderName: fh.fromName || null,
          senderId: fh.fromId ? String(fh.fromId.userId || fh.fromId.channelId || "") : null,
          date: fh.date || null,
        };
        // Try to resolve human-readable name from cached entity
        if (!forwardedFrom.senderName && forwardedFrom.senderId) {
          const cached = entityCache.get(forwardedFrom.senderId);
          if (cached) {
            forwardedFrom.senderName = [cached.firstName, cached.lastName].filter(Boolean).join(" ").trim() || cached.username || null;
          }
        }
      }
      // Reply: m.replyTo = MessageReplyHeader; m.replyToMsgId
      let replyTo = null;
      if (m.replyTo?.replyToMsgId || m.replyToMsgId) {
        replyTo = {
          id: String(m.replyTo?.replyToMsgId || m.replyToMsgId),
        };
      }
      messages.push({
        id: m.id,
        text: m.message ?? "",
        date: m.date,
        out: m.out ?? false,
        fromName: m.sender?.firstName ?? m.sender?.username ?? null,
        media: extractMediaInfo(m),
        reactions,
        forwardedFrom,
        replyTo,
      });
    }
    return { messages };
  },

  "POST /send": async (body) => {
    await ensureConnected();
    const { peer, message } = body;
    if (!peer || !message) throw new Error("peer and message required");
    const entity = await resolvePeer(peer);
    const sent = await client.sendMessage(entity, { message });
    return { ok: true, id: sent.id };
  },

  "POST /add-contact": async (body) => {
    await ensureConnected();
    const { phone, username, firstName, lastName } = body;
    if (!phone && !username) throw new Error("phone or username required");

    if (username && !phone) {
      const handle = String(username).replace(/^@/, "").trim();
      const result = await client.invoke(new Api.contacts.ResolveUsername({ username: handle }));
      const u = result.users?.[0];
      if (!u) return { ok: false, error: "Username not found" };
      return {
        ok: true,
        user: {
          id: String(u.id),
          firstName: u.firstName ?? "",
          lastName: u.lastName ?? "",
          username: u.username ?? handle,
          phone: u.phone ? String(u.phone) : null,
        },
      };
    }

    const cleanPhone = String(phone).replace(/[^\d+]/g, "");
    const contact = new Api.InputPhoneContact({
      clientId: bigInt(Date.now()),
      phone: cleanPhone,
      firstName: String(firstName || cleanPhone),
      lastName: String(lastName || ""),
    });
    const importRes = await client.invoke(new Api.contacts.ImportContacts({ contacts: [contact] }));
    const u = importRes.users?.[0];
    if (!u) return { ok: false, error: "Telegram не нашёл пользователя по этому номеру" };
    return {
      ok: true,
      user: {
        id: String(u.id),
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? "",
        username: u.username ?? null,
        phone: u.phone ? String(u.phone) : cleanPhone,
      },
    };
  },

  "POST /mark-unread": async (body) => {
    await ensureConnected();
    const { peer } = body;
    if (!peer) throw new Error("peer required");
    const entity = await resolvePeer(peer);
    await client.invoke(new Api.messages.MarkDialogUnread({ unread: true, peer: entity }));
    return { ok: true };
  },

  "POST /mark-read": async (body) => {
    await ensureConnected();
    const { peer } = body;
    if (!peer) throw new Error("peer required");
    const entity = await resolvePeer(peer);
    await client.invoke(new Api.messages.ReadHistory({ peer: entity, maxId: 0 }));
    return { ok: true };
  },

  // Note: /media is handled separately below as raw binary, not JSON
};

// Raw binary upload (file or voice). Body: raw bytes. Query: peer, kind, caption
async function handleUpload(req, res, url) {
  await ensureConnected();
  const peer = url.searchParams.get("peer");
  const kind = url.searchParams.get("kind") || "file";  // "file" or "voice"
  const caption = url.searchParams.get("caption") || "";
  if (!peer) return json(res, 400, { error: "peer required" });

  try {
    const entity = await resolvePeer(peer);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const buffer = Buffer.concat(chunks);

    if (kind === "voice") {
      await client.sendFile(entity, { file: buffer, voiceNote: true });
    } else {
      await client.sendFile(entity, { file: buffer, caption });
    }
    json(res, 200, { ok: true });
  } catch (e) {
    console.error("[/upload]", e);
    json(res, 500, { error: e?.message || String(e) });
  }
}

// Raw binary media download (handled outside the JSON router)
async function handleMediaDownload(req, res, url) {
  await ensureConnected();
  const peer = url.searchParams.get("peer");
  const msgId = Number(url.searchParams.get("msgId"));
  if (!peer || !msgId) {
    return json(res, 400, { error: "peer and msgId required" });
  }
  try {
    const entity = await resolvePeer(peer);
    const [message] = await client.getMessages(entity, { ids: [msgId] });
    if (!message?.media) return json(res, 404, { error: "Медиа не найдено" });

    const media = message.media;
    const className = media.className ?? "";
    let mimeType = "application/octet-stream";
    if (className === "MessageMediaPhoto") mimeType = "image/jpeg";
    else if (className === "MessageMediaDocument") mimeType = media.document?.mimeType ?? "application/octet-stream";

    const buffer = await client.downloadMedia(message, {});
    if (!buffer) return json(res, 500, { error: "Не удалось загрузить медиа" });

    res.writeHead(200, {
      "Content-Type": mimeType,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  } catch (e) {
    console.error("[/media]", e);
    json(res, 500, { error: e?.message || String(e) });
  }
}

// ───────── server ─────────

const server = http.createServer(async (req, res) => {
  if (req.headers.authorization !== API_KEY) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Special: binary media download
  if (req.method === "GET" && url.pathname === "/media") {
    return handleMediaDownload(req, res, url);
  }
  // Special: binary upload (file/voice)
  if (req.method === "POST" && url.pathname === "/upload") {
    return handleUpload(req, res, url);
  }

  const key = `${req.method} ${url.pathname}`;
  const handler = routes[key];

  if (!handler) {
    return json(res, 404, { error: "Not found", route: key });
  }

  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const result = await handler(body);
    json(res, 200, result);
  } catch (e) {
    console.error(`[${key}]`, e);
    const msg = e?.message || String(e);
    if (/AUTH_KEY|UNAUTHORIZED|disconnected/i.test(msg)) {
      connected = false;
    }
    json(res, 500, { error: msg });
  }
});

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`[telegram-proxy] listening on port ${PORT}`);
  await ensureConnected();
});

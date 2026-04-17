// WhatsApp proxy — whatsapp-web.js on a VPS behind HTTP.
// On first run it prints a QR to the console. Scan with WhatsApp → Linked Devices.
// Session is persisted via LocalAuth (./wwebjs_auth/).
// Incoming messages are forwarded to CRM_WEBHOOK_URL as JSON.
//
// Env:
//   PORT             (default 3400)
//   API_KEY          required; clients pass it in Authorization header
//   CRM_WEBHOOK_URL  required; POSTs JSON { from, text, id, timestamp, mediaMimeType, mediaBase64? }
//   CRM_WEBHOOK_SECRET optional; sent as x-webhook-secret

"use strict";

const http = require("http");
const { URL } = require("url");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const PORT = Number(process.env.PORT || 3400);
const API_KEY = process.env.API_KEY || "";
const CRM_WEBHOOK_URL = process.env.CRM_WEBHOOK_URL || "";
const CRM_WEBHOOK_SECRET = process.env.CRM_WEBHOOK_SECRET || "";

let ready = false;
let lastQr = null;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  lastQr = qr;
  console.log("[WA] QR received. Scan from WhatsApp mobile → Linked Devices:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  ready = true;
  lastQr = null;
  console.log("[WA] Client ready as", client.info?.wid?.user);
});

client.on("authenticated", () => console.log("[WA] Authenticated"));
client.on("auth_failure", (m) => console.error("[WA] Auth failure:", m));
client.on("disconnected", (r) => {
  ready = false;
  console.warn("[WA] Disconnected:", r);
});

client.on("message", async (msg) => {
  if (!CRM_WEBHOOK_URL) return;
  try {
    const from = String(msg.from || "").replace("@c.us", "");
    const payload = {
      from,
      text: msg.body || "",
      id: msg.id?._serialized || msg.id?.id || null,
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
    };
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          payload.mediaMimeType = media.mimetype;
          // Skip base64 for large files to keep webhook light
          if (media.data && media.data.length < 1_000_000) payload.mediaBase64 = media.data;
        }
      } catch (e) {
        console.warn("[WA] Media download failed:", e?.message);
      }
    }

    const headers = { "Content-Type": "application/json" };
    if (CRM_WEBHOOK_SECRET) headers["x-webhook-secret"] = CRM_WEBHOOK_SECRET;
    await fetch(CRM_WEBHOOK_URL, { method: "POST", headers, body: JSON.stringify(payload) });
  } catch (e) {
    console.error("[WA] Webhook error:", e);
  }
});

client.initialize();

function authorized(req) {
  if (!API_KEY) return true;
  const got = req.headers.authorization || req.headers["x-api-key"] || "";
  return got === API_KEY;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

const server = http.createServer(async (req, res) => {
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
  const u = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (u.pathname === "/status" && req.method === "GET") {
      return json(res, 200, { ready, hasQr: !!lastQr, me: client.info?.wid?.user ?? null });
    }

    if (u.pathname === "/qr" && req.method === "GET") {
      if (!lastQr) return json(res, 404, { error: "no QR pending; already authenticated or not yet generated" });
      return json(res, 200, { qr: lastQr });
    }

    if (u.pathname === "/send" && req.method === "POST") {
      if (!ready) return json(res, 503, { error: "client not ready" });
      const body = JSON.parse(await readBody(req));
      const { phone, text } = body;
      if (!phone || typeof text !== "string") return json(res, 400, { error: "phone and text required" });
      const cleanPhone = String(phone).replace(/\D/g, "");
      const chatId = cleanPhone.includes("@") ? cleanPhone : `${cleanPhone}@c.us`;
      const sent = await client.sendMessage(chatId, text);
      return json(res, 200, { ok: true, id: sent.id?._serialized ?? null });
    }

    if (u.pathname === "/check-number" && req.method === "POST") {
      if (!ready) return json(res, 503, { error: "client not ready" });
      const body = JSON.parse(await readBody(req));
      const { phone } = body;
      if (!phone) return json(res, 400, { error: "phone required" });
      const cleanPhone = String(phone).replace(/\D/g, "");
      const result = await client.getNumberId(cleanPhone);
      return json(res, 200, { registered: !!result, id: result?._serialized ?? null });
    }

    return json(res, 404, { error: "not found" });
  } catch (e) {
    console.error("[WA] Handler error:", e);
    return json(res, 500, { error: e?.message || String(e) });
  }
});

server.listen(PORT, () => console.log(`[WA] HTTP listening on :${PORT}`));

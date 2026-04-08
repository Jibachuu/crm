// MAX Messenger WebSocket Proxy for CRM
// Runs on VPS, provides HTTP API for Vercel CRM

const http = require("http");
const WebSocket = require("ws");

const WS_URL = "wss://ws-api.oneme.ru/websocket";
const PORT = process.env.PORT || 3100;
const API_KEY = process.env.API_KEY || "artevo-max-proxy-secret-2026";
const MAX_TOKEN = process.env.MAX_TOKEN || "";

let ws = null;
let seqCounter = 0;
let connected = false;
let userId = null;
let pendingCallbacks = new Map();

// WebSocket helpers
function send(opcode, payload = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return null;
  const seq = seqCounter++;
  ws.send(JSON.stringify({ ver: 11, cmd: 0, seq, opcode, payload }));
  return seq;
}

function waitForResponse(opcode, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingCallbacks.delete(opcode);
      resolve(null);
    }, timeoutMs);

    pendingCallbacks.set(opcode, (msg) => {
      clearTimeout(timeout);
      pendingCallbacks.delete(opcode);
      resolve(msg);
    });
  });
}

// Connect to MAX
function connectMax() {
  if (!MAX_TOKEN) { console.log("No MAX_TOKEN set"); return; }
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log("[MAX] Connecting...");
  ws = new WebSocket(WS_URL, {
    headers: {
      "Origin": "https://web.max.ru",
      "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 Chrome/146.0.0.0 Mobile Safari/537.36",
    },
  });

  ws.on("open", () => {
    console.log("[MAX] WebSocket open, authenticating...");
    send(19, { token: MAX_TOKEN });
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Auth response
      if (msg.opcode === 19 && msg.cmd === 1 && msg.payload?.profile) {
        connected = true;
        userId = msg.payload?.contact?.userId;
        console.log("[MAX] Authenticated! userId:", userId);
      }

      // Route to pending callbacks
      if (msg.cmd === 1 && pendingCallbacks.has(msg.opcode)) {
        pendingCallbacks.get(msg.opcode)(msg);
      }

      // Store incoming messages for polling
      if (msg.opcode === 64 && msg.cmd === 1) {
        // Incoming message - could store for webhook/polling
      }
    } catch {}
  });

  ws.on("close", () => {
    console.log("[MAX] Disconnected, reconnecting in 5s...");
    connected = false;
    ws = null;
    setTimeout(connectMax, 5000);
  });

  ws.on("error", (err) => {
    console.log("[MAX] Error:", err.message);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  // Auth check
  const auth = req.headers.authorization;
  if (auth !== API_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // GET /status
  if (path === "/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected, userId }));
    return;
  }

  // GET /chats
  if (path === "/chats" && req.method === "GET") {
    if (!connected) { res.writeHead(503); res.end(JSON.stringify({ error: "Not connected" })); return; }
    send(48, { chatIds: [0] });
    const response = await waitForResponse(48);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response?.payload ?? {}));
    return;
  }

  // POST /send
  if (path === "/send" && req.method === "POST") {
    if (!connected) { res.writeHead(503); res.end(JSON.stringify({ error: "Not connected" })); return; }
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", async () => {
      try {
        const { chatId, text } = JSON.parse(body);
        if (!chatId || !text) { res.writeHead(400); res.end(JSON.stringify({ error: "chatId and text required" })); return; }

        send(64, {
          chatId: Number(chatId),
          message: { text, cid: -Date.now(), elements: [], attaches: [] },
          notify: true,
        });

        const response = await waitForResponse(64);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, message: response?.payload?.message }));
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /messages?chatId=xxx&count=50
  if (path === "/messages" && req.method === "GET") {
    if (!connected) { res.writeHead(503); res.end(JSON.stringify({ error: "Not connected" })); return; }
    const chatId = Number(url.searchParams.get("chatId"));
    const count = Number(url.searchParams.get("count") || "50");
    if (!chatId) { res.writeHead(400); res.end(JSON.stringify({ error: "chatId required" })); return; }

    // Subscribe to chat
    send(75, { chatId, subscribe: true });
    // Request history
    send(79, { forward: false, count });
    const response = await waitForResponse(79);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response?.payload ?? {}));
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[Proxy] Running on port ${PORT}`);
  connectMax();
});

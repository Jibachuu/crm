// MAX Messenger WebSocket client (oneme.ru protocol)
// Auth flow: WebSocket → QR code → scan → token

import WebSocket from "ws";

const WS_URL = "wss://ws-api.oneme.ru/websocket";

interface MaxMessage {
  ver: number;
  cmd: number; // 0 = client→server, 1 = server→client
  seq: number;
  opcode: number;
  payload: Record<string, unknown>;
}

let wsClient: WebSocket | null = null;
let seqCounter = 0;
let sessionToken: string | null = null;
let sessionUserId: number | null = null;

// Stored in memory (per-process). For production, use Redis/DB.
let storedToken: string | null = process.env.MAX_SESSION_TOKEN ?? null;

function send(ws: WebSocket, opcode: number, payload: Record<string, unknown> = {}) {
  const msg: MaxMessage = { ver: 11, cmd: 0, seq: seqCounter++, opcode, payload };
  ws.send(JSON.stringify(msg));
  return msg.seq;
}

// Parse incoming message
function parse(data: string): MaxMessage | null {
  try { return JSON.parse(data); } catch { return null; }
}

// Step 1: Connect and request QR
export async function requestQR(): Promise<{ qrLink: string; trackId: string; pollingInterval: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: {
        "Origin": "https://web.max.ru",
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 Chrome/146.0.0.0 Mobile Safari/537.36",
      },
    });
    const timeout = setTimeout(() => { ws.close(); reject(new Error("Timeout connecting to MAX")); }, 15000);

    ws.on("open", () => {
      // Send device info first (opcode 6)
      send(ws, 6, { userAgent: { deviceType: "WEB", locale: "ru", deviceLocale: "ru", osVersion: "Android", deviceName: "Chrome" } });
    });

    ws.on("message", (raw) => {
      const msg = parse(raw.toString());
      if (!msg) return;

      // Server hello
      if (msg.opcode === 6) {
        send(ws, 288, {}); // Request QR
      }

      // QR response
      if (msg.opcode === 288 && msg.cmd === 1) {
        const p = msg.payload as { qrLink?: string; trackId?: string; pollingInterval?: number };
        if (p.qrLink && p.trackId) {
          clearTimeout(timeout);
          // Keep ws alive for polling
          (globalThis as Record<string, unknown>).__maxAuthWs = ws;
          (globalThis as Record<string, unknown>).__maxTrackId = p.trackId;
          resolve({ qrLink: p.qrLink, trackId: p.trackId, pollingInterval: p.pollingInterval ?? 5000 });
        }
      }
    });

    ws.on("error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

// Step 2: Poll for QR scan result
export async function pollQRStatus(trackId: string): Promise<{ status: "waiting" | "scanned" | "authorized"; token?: string; userId?: number }> {
  const ws = (globalThis as Record<string, unknown>).__maxAuthWs as WebSocket | undefined;
  if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket not connected");

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ status: "waiting" }), 8000);

    const handler = (raw: WebSocket.Data) => {
      const msg = parse(raw.toString());
      if (!msg) return;

      // Status update
      if (msg.opcode === 289 && msg.cmd === 1) {
        const p = msg.payload as { status?: { loginAvailable?: boolean; expiresAt?: number } };
        if (p.status?.loginAvailable) {
          // QR scanned! Request token
          send(ws, 291, { trackId });
        }
      }

      // Token received
      if (msg.opcode === 291 && msg.cmd === 1) {
        const p = msg.payload as { tokenAttrs?: { LOGIN?: { token?: string } }; userId?: number };
        const token = p.tokenAttrs?.LOGIN?.token;
        if (token) {
          clearTimeout(timeout);
          ws.removeListener("message", handler);
          sessionToken = token;
          storedToken = token;
          sessionUserId = p.userId ?? null;
          resolve({ status: "authorized", token, userId: p.userId ?? undefined });
          return;
        }
      }
    };

    ws.on("message", handler);
    // Send poll request
    send(ws, 289, { trackId });
  });
}

// Step 3: Connect with token for messaging
export async function connectWithToken(token?: string): Promise<void> {
  const t = token ?? storedToken;
  if (!t) throw new Error("No token available");

  return new Promise((resolve, reject) => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) { resolve(); return; }

    wsClient = new WebSocket(WS_URL, {
      headers: {
        "Origin": "https://web.max.ru",
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 Chrome/146.0.0.0 Mobile Safari/537.36",
      },
    });
    const timeout = setTimeout(() => { wsClient?.close(); reject(new Error("Timeout")); }, 10000);

    wsClient.on("open", () => {
      // Send auth with token (opcode 19)
      send(wsClient!, 19, { token: t });
    });

    wsClient.on("message", (raw) => {
      const msg = parse(raw.toString());
      if (!msg) return;

      // Auth success — profile loaded (opcode 19 response) or NAV event (opcode 5)
      if ((msg.opcode === 19 && msg.cmd === 1) || msg.opcode === 5 || msg.opcode === 32) {
        clearTimeout(timeout);
        if (msg.opcode === 5) {
          const p = msg.payload as { events?: { userId?: number; sessionId?: number }[] };
          sessionUserId = (p.events?.[0] as { userId?: number })?.userId ?? null;
        }
        resolve();
      }
    });

    wsClient.on("error", (err) => { clearTimeout(timeout); reject(err); });
    wsClient.on("close", () => { wsClient = null; });
  });
}

// Get chats
export async function getChats(): Promise<unknown[]> {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) await connectWithToken();
  if (!wsClient) throw new Error("Not connected");
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve([]), 8000);
    const handler = (raw: WebSocket.Data) => {
      const msg = parse(raw.toString());
      if (!msg) return;
      if (msg.opcode === 48 && msg.cmd === 1) {
        clearTimeout(timeout);
        wsClient?.removeListener("message", handler);
        const payload = msg.payload as unknown;
        resolve(Array.isArray(payload) ? payload : [payload]);
      }
    };
    wsClient!.on("message", handler);
    send(wsClient!, 48, { chatIds: [0] });
  });
}

// Send message — opcode 64
export async function sendMaxMessage(chatId: number, text: string): Promise<{ id?: string }> {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) await connectWithToken();
  if (!wsClient) throw new Error("Not connected");

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({}), 8000);
    const handler = (raw: WebSocket.Data) => {
      const msg = parse(raw.toString());
      if (!msg) return;
      if (msg.opcode === 64 && msg.cmd === 1) {
        clearTimeout(timeout);
        wsClient?.removeListener("message", handler);
        const p = msg.payload as { message?: { id?: string } };
        resolve({ id: p.message?.id });
      }
    };
    wsClient!.on("message", handler);
    send(wsClient!, 64, {
      chatId,
      message: { text, cid: -Date.now(), elements: [], attaches: [] },
      notify: true,
    });
  });
}

// Get message history — opcode 79
export async function getMessageHistory(chatId: number, count = 50): Promise<unknown[]> {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) await connectWithToken();
  if (!wsClient) throw new Error("Not connected");

  // Subscribe to chat first
  send(wsClient!, 75, { chatId, subscribe: true });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve([]), 8000);
    const handler = (raw: WebSocket.Data) => {
      const msg = parse(raw.toString());
      if (!msg) return;
      if (msg.opcode === 79 && msg.cmd === 1) {
        clearTimeout(timeout);
        wsClient?.removeListener("message", handler);
        const p = msg.payload as { history?: unknown[] };
        resolve(p.history ?? []);
      }
    };
    wsClient!.on("message", handler);
    send(wsClient!, 79, { forward: false, count });
  });
}

// Get stored token
export function getToken(): string | null { return storedToken; }
export function getUserId(): number | null { return sessionUserId; }
export function isConnected(): boolean { return (wsClient?.readyState === WebSocket.OPEN) || false; }

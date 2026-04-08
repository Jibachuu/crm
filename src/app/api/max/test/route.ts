import { NextResponse } from "next/server";
import WebSocket from "ws";

const WS_URL = "wss://ws-api.oneme.ru/websocket";

export async function GET() {
  const token = process.env.MAX_SESSION_TOKEN;
  if (!token) return NextResponse.json({ error: "MAX_SESSION_TOKEN not set" });

  try {
    const result = await new Promise<{ success: boolean; userId?: number; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ success: false, error: "Timeout 10s" });
      }, 10000);

      const ws = new WebSocket(WS_URL, {
        headers: {
          "Origin": "https://web.max.ru",
          "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 Chrome/146.0.0.0 Mobile Safari/537.36",
        },
      });

      let seq = 0;

      ws.on("open", () => {
        // Send auth with token (opcode 19)
        ws.send(JSON.stringify({ ver: 11, cmd: 0, seq: seq++, opcode: 19, payload: { token } }));
      });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          // Auth response
          if (msg.opcode === 19 && msg.cmd === 1 && msg.payload?.profile) {
            clearTimeout(timeout);
            ws.close();
            resolve({ success: true, userId: msg.payload?.contact?.userId });
          }
          // Error
          if (msg.opcode === 19 && msg.cmd === 1 && msg.payload?.error) {
            clearTimeout(timeout);
            ws.close();
            resolve({ success: false, error: msg.payload.error });
          }
        } catch {}
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: `WS Error: ${err.message}` });
      });
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) });
  }
}

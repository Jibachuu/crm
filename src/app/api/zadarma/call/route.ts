import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function zadarmaSign(endpoint: string, params: Record<string, string>, secret: string): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const str = endpoint + sorted.map(([k, v]) => `${k}=${v}`).join("&");
  const hash = crypto.createHash("sha1").update(str + crypto.createHash("md5").update(str).digest("hex")).digest("base64");
  return hash;
}

export async function POST(req: NextRequest) {
  const { phone } = await req.json();

  const key = process.env.ZADARMA_API_KEY;
  const secret = process.env.ZADARMA_SECRET_KEY;
  const sip = process.env.ZADARMA_SIP; // внутренний номер оператора

  if (!key || !secret) {
    return NextResponse.json({ error: "Zadarma не настроена" }, { status: 503 });
  }

  const params: Record<string, string> = {
    from: sip ?? "",
    to: phone,
    predicted: "1",
  };

  const endpoint = "/v1/request/callback/";
  const sign = zadarmaSign(endpoint, params, secret);

  const qs = new URLSearchParams({ ...params, key, sign }).toString();
  const res = await fetch(`https://api.zadarma.com${endpoint}?${qs}`);
  const data = await res.json();

  if (data.status !== "success") {
    return NextResponse.json({ error: data.message ?? "Ошибка Zadarma" }, { status: 400 });
  }

  return NextResponse.json({ status: "calling", phone });
}

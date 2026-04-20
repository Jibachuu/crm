// Novofon API client for CRM telephony integration
// Docs: https://novofon.com/instructions/api/

import crypto from "crypto";

const API_BASE = "https://api.novofon.com/v1";

function getCredentials() {
  const userKey = process.env.NOVOFON_USER_KEY;
  const secretKey = process.env.NOVOFON_SECRET_KEY;
  if (!userKey || !secretKey) throw new Error("NOVOFON_USER_KEY and NOVOFON_SECRET_KEY required");
  return { userKey, secretKey };
}

function sign(method: string, params: Record<string, string>, secretKey: string): string {
  // 1. Sort params alphabetically
  const sorted = Object.keys(params).sort();
  const queryString = sorted.map((k) => `${k}=${params[k]}`).join("&");
  // 2. Build string to sign: method + queryString + md5(queryString)
  const md5Hash = crypto.createHash("md5").update(queryString).digest("hex");
  const stringToSign = method + queryString + md5Hash;
  // 3. HMAC-SHA1 hex, then base64-encode the hex string (matches PHP hash_hmac behavior)
  const hmacHex = crypto.createHmac("sha1", secretKey).update(stringToSign).digest("hex");
  return Buffer.from(hmacHex).toString("base64");
}

export async function novofonApi(method: string, params: Record<string, string> = {}) {
  const { userKey, secretKey } = getCredentials();
  // Sign with full path including /v1/ prefix (Novofon requires this)
  const fullMethod = `/v1${method}/`;
  const signature = sign(fullMethod, params, secretKey);
  const queryString = Object.keys(params).sort().map((k) => `${k}=${encodeURIComponent(params[k])}`).join("&");
  const url = `${API_BASE}${method}/${queryString ? "?" + queryString : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `${userKey}:${signature}` },
  });
  return res.json();
}

// Initiate callback: CRM calls manager first, then connects to client
export async function initiateCall(from: string, to: string, sip?: string) {
  const params: Record<string, string> = { from, to };
  if (sip) params.sip = sip;
  return novofonApi("/request/callback", params);
}

// Get call recording link
export async function getRecordingLink(callId: string) {
  return novofonApi("/pbx/record/request", { call_id: callId, lifetime: "3600" });
}

// Get call statistics
export async function getCallStats(dateFrom: string, dateTo: string) {
  return novofonApi("/statistics/pbx", { start: dateFrom, end: dateTo, version: "2" });
}

// Get PBX internal extensions
export async function getPbxInternals() {
  return novofonApi("/pbx/internal");
}

// Verify webhook signature
export function verifyWebhookSignature(params: Record<string, string>, signature: string): boolean {
  const secretKey = process.env.NOVOFON_SECRET_KEY;
  if (!secretKey) return false;

  const sorted = Object.keys(params).filter((k) => k !== "signature").sort();
  const queryString = sorted.map((k) => `${k}=${params[k]}`).join("&");
  const md5Hash = crypto.createHash("md5").update(queryString).digest("hex");
  const expected = crypto.createHmac("sha1", secretKey).update(queryString + md5Hash).digest("base64");

  return expected === signature;
}

// HTTP client for the Telegram VPS proxy at /opt/telegram-proxy.
// Vercel never instantiates gramJS — it only talks to this single long-lived
// service, which keeps one Telegram session alive 24/7.

const URL = process.env.TG_PROXY_URL || "http://72.56.243.123:3300";
const KEY = process.env.TG_PROXY_KEY || "artevo-tg-proxy-2026";

export async function tgProxy<T = unknown>(
  path: string,
  options?: { method?: "GET" | "POST"; body?: unknown; timeout?: number }
): Promise<T> {
  const method = options?.method ?? "GET";
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), options?.timeout ?? 30000);
  try {
    const res = await fetch(`${URL}${path}`, {
      method,
      headers: { Authorization: KEY, "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(options?.body ?? {}) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error((data as any)?.error || `HTTP ${res.status}`);
    }
    return data as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

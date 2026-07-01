import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// R3b: Server-Sent Events для инбокса. Серверный роут внутри опрашивает
// tg-proxy и max-proxy каждые POLL_INTERVAL_MS секунд, сравнивает с
// прошлым снимком, и стримит клиенту только дельты. Клиент открывает
// EventSource и получает события без периодических HTTP-запросов из
// браузера — снижает нагрузку и даёт «почти-real-time» ощущение.
//
// Почему SSE, а не WebSocket:
// - Работает через nginx/CDN без спец-настроек (обычный HTTP)
// - Auto-reconnect из коробки в браузере
// - Проще auth (обычный fetch/cookie)
// - Для одностороннего потока «сервер → клиент» ничего не теряем

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 3000;       // опрос прокси каждые 3 сек
const HEARTBEAT_MS = 15000;          // ping для keep-alive nginx/прокси
const MAX_SESSION_MS = 55 * 60 * 1000; // 55 мин — Timeweb/AEZA закрывают idle 60 мин

type Dialog = {
  id: string;
  name: string;
  channel: "telegram" | "maks";
  lastMessage: string;
  lastTime: number;
  unreadCount?: number;
  unread?: boolean;
  peer?: string;
  chatId?: string;
  avatar?: string;
  phone?: string;
  username?: string;
};

// Ключ снимка чата, по которому определяем «изменилось ли». Не используем
// объект целиком — при рефетче меняются non-semantic поля (порядок
// props при JSON.stringify — не гарантирован для всех рантаймов).
function snapshotKey(d: Dialog): string {
  return `${d.id}|${d.lastTime}|${d.lastMessage.length}|${d.unreadCount ?? 0}|${d.unread ? 1 : 0}`;
}

async function fetchTelegramDialogs(baseUrl: string, cookie: string): Promise<Dialog[]> {
  try {
    const res = await fetch(`${baseUrl}/api/telegram/dialogs`, {
      headers: { Cookie: cookie },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.dialogs ?? []).map((d: any) => ({
      id: `tg_${d.id}`,
      name: d.name || d.username || String(d.id),
      channel: "telegram" as const,
      lastMessage: d.lastMessage || "",
      lastTime: d.lastDate || 0,
      unreadCount: d.unreadCount || 0,
      peer: d.username || d.phone || String(d.id),
      avatar: d.photoUrl || d.avatar || undefined,
      phone: d.phone || undefined,
      username: d.username || undefined,
    }));
  } catch { return []; }
}

async function fetchMaxChats(baseUrl: string, cookie: string): Promise<Dialog[]> {
  try {
    const res = await fetch(`${baseUrl}/api/max?action=chats`, {
      headers: { Cookie: cookie },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list: Dialog[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of data.chats ?? []) {
      const chatId = String(c.chatId ?? c.id ?? "");
      if (!chatId || Number(chatId) < 0) continue;
      list.push({
        id: `max_${chatId}`,
        name: c.title || chatId,
        channel: "maks" as const,
        lastMessage: c.lastMessage?.text || "",
        lastTime: c.lastMessage?.time || 0,
        chatId,
        avatar: c.avatar || undefined,
        phone: c.phone ? String(c.phone) : undefined,
        username: c.username || undefined,
        unread: c.unread || false,
        unreadCount: c.unreadCount || 0,
      });
    }
    return list;
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  // Проверка аутентификации через тот же supabase-server как и обычные API.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const cookieHeader = req.headers.get("cookie") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "artevo-crm.ru";
  const baseUrl = `${proto}://${host}`;

  const encoder = new TextEncoder();

  let poller: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let sessionTimeout: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const previousSnapshot = new Map<string, string>();

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* controller closed — ignore */ }
      }

      function cleanup() {
        if (closed) return;
        closed = true;
        if (poller) clearInterval(poller);
        if (heartbeat) clearInterval(heartbeat);
        if (sessionTimeout) clearTimeout(sessionTimeout);
        try { controller.close(); } catch { /* already closed */ }
      }

      // Клиент отвалился — прибираемся
      req.signal.addEventListener("abort", cleanup);

      // Максимальная длительность сессии — сбрасываем клиента, он
      // сам передоткроет EventSource. Иначе nginx-proxy закрывает
      // подключение по read-timeout и клиент видит ошибку.
      sessionTimeout = setTimeout(() => {
        send("bye", { reason: "session-timeout" });
        cleanup();
      }, MAX_SESSION_MS);

      // Первое приветствие
      send("connected", { ts: Date.now() });

      // Heartbeat: комментарий-строка `: ping\n\n` — не отдаётся клиенту
      // как событие, но nginx считает трафик живым.
      heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* skip */ }
      }, HEARTBEAT_MS);

      async function tick() {
        if (closed) return;
        const [tg, mx] = await Promise.all([
          fetchTelegramDialogs(baseUrl, cookieHeader),
          fetchMaxChats(baseUrl, cookieHeader),
        ]);
        const all = [...tg, ...mx];
        // Нормализуем timestamps до секунд (TG уже, MAX бывает в мс)
        for (const d of all) if (d.lastTime > 9999999999) d.lastTime = Math.floor(d.lastTime / 1000);
        all.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));

        // Определяем что изменилось
        const currentKeys = new Map<string, string>();
        const changed: Dialog[] = [];
        for (const d of all) {
          const key = snapshotKey(d);
          currentKeys.set(d.id, key);
          if (previousSnapshot.get(d.id) !== key) changed.push(d);
        }
        // Также определяем удалённые (были в snapshot, нет сейчас)
        const removed: string[] = [];
        for (const [id] of previousSnapshot) if (!currentKeys.has(id)) removed.push(id);

        previousSnapshot.clear();
        for (const [k, v] of currentKeys) previousSnapshot.set(k, v);

        // Первый прогон (previousSnapshot был пуст) — отдаём всё
        // как «полный набор», не как «дельту». Клиент по этому событию
        // делает полную замену state. Так стартовое состояние гарантированно
        // синкается с сервером даже если через SSR был другой набор.
        const isFirstTick = previousSnapshot.size === all.length && changed.length === all.length;
        if (isFirstTick) {
          send("full", { dialogs: all });
        } else if (changed.length > 0 || removed.length > 0) {
          send("delta", { changed, removed });
        }
      }

      // Мгновенный первый тик
      tick().catch(() => {});
      poller = setInterval(() => { tick().catch(() => {}); }, POLL_INTERVAL_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // отключаем буферизацию nginx
    },
  });
}

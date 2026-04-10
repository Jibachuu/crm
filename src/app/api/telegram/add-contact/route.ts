import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TG_AUTH_URL = process.env.TG_AUTH_URL || "http://72.56.243.123:3200";
const TG_AUTH_KEY = process.env.TG_AUTH_KEY || "artevo-tg-auth-2026";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, username, firstName, lastName } = await req.json();
  if (!phone && !username) return NextResponse.json({ error: "phone or username required" }, { status: 400 });

  const session = process.env.TELEGRAM_SESSION ?? "";
  if (!session) return NextResponse.json({ error: "Telegram not connected" }, { status: 503 });

  // Username path: resolve via gramJS directly (no need for VPS proxy)
  if (username && !phone) {
    try {
      const { getTelegramClient } = await import("@/lib/telegram/client");
      const { Api } = await import("telegram");
      const client = await getTelegramClient();
      const handle = String(username).replace(/^@/, "").trim();
      const result = await client.invoke(new Api.contacts.ResolveUsername({ username: handle }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = (result as any).users?.[0];
      if (!u) return NextResponse.json({ ok: false, error: "Username not found" });
      return NextResponse.json({
        ok: true,
        user: {
          id: String(u.id),
          firstName: u.firstName ?? "",
          lastName: u.lastName ?? "",
          username: u.username ?? handle,
          phone: u.phone ? String(u.phone) : null,
        },
      });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e) });
    }
  }

  // Phone path: proxy through VPS telegram-auth (which has SMS code support)
  try {
    const res = await fetch(`${TG_AUTH_URL}/add-contact`, {
      method: "POST",
      headers: { Authorization: TG_AUTH_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, firstName, lastName, session }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

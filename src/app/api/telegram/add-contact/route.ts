import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, username, firstName, lastName } = await req.json();
  if (!phone && !username) return NextResponse.json({ error: "phone or username required" }, { status: 400 });

  const session = process.env.TELEGRAM_SESSION ?? "";
  if (!session) return NextResponse.json({ error: "Telegram not connected" }, { status: 503 });

  // Both username and phone paths use local gramJS (Vercel) — no VPS proxy.
  // VPS telegram-auth was sharing the same TELEGRAM_SESSION which caused
  // AUTH_KEY_DUPLICATED. Single client = stable session.
  try {
    const { getTelegramClient } = await import("@/lib/telegram/client");
    const { Api } = await import("telegram");
    const client = await getTelegramClient();

    // Username path
    if (username && !phone) {
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
    }

    // Phone path: ImportContacts to add contact and resolve user
    const cleanPhone = String(phone).replace(/[^\d+]/g, "");
    const contact = new Api.InputPhoneContact({
      clientId: BigInt(Date.now()) as unknown as bigint,
      phone: cleanPhone,
      firstName: String(firstName || cleanPhone),
      lastName: String(lastName || ""),
    });
    const importRes = await client.invoke(new Api.contacts.ImportContacts({ contacts: [contact] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = (importRes as any).users?.[0];
    if (!u) {
      return NextResponse.json({ ok: false, error: "Telegram не нашёл пользователя по этому номеру" });
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: String(u.id),
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? "",
        username: u.username ?? null,
        phone: u.phone ? String(u.phone) : cleanPhone,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

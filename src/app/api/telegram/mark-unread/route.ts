import { NextRequest, NextResponse } from "next/server";
import { Api } from "telegram";
import { getTelegramClient } from "@/lib/telegram/client";

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const { peer } = await req.json();
  if (!peer) return NextResponse.json({ error: "peer required" }, { status: 400 });

  try {
    const client = await getTelegramClient();
    const entity = await client.getEntity(peer);
    await client.invoke(new Api.messages.MarkDialogUnread({ unread: true, peer: entity as never }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

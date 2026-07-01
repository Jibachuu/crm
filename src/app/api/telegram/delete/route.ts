import { NextRequest, NextResponse } from "next/server";
import { tgProxy } from "@/lib/telegram/proxy";

export const maxDuration = 15;

// Удаление TG-сообщений. revoke=true → «удалить у всех» (по умолчанию).
// Работает в личных чатах и в группах где отправитель имеет право.
export async function POST(req: NextRequest) {
  const { peer, message_ids, revoke } = await req.json();
  if (!peer) return NextResponse.json({ error: "peer required" }, { status: 400 });
  const ids = Array.isArray(message_ids) ? message_ids : (message_ids ? [message_ids] : []);
  if (ids.length === 0) return NextResponse.json({ error: "message_ids required" }, { status: 400 });

  try {
    const data = await tgProxy("/delete-message", {
      method: "POST",
      body: { peer, message_ids: ids, revoke: revoke !== false },
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

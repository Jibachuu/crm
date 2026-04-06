import { NextRequest, NextResponse } from "next/server";
import { getTelegramClient } from "@/lib/telegram/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const peer = searchParams.get("peer");
  const msgId = Number(searchParams.get("msgId"));

  if (!peer || !msgId) {
    return NextResponse.json({ error: "peer и msgId обязательны" }, { status: 400 });
  }

  try {
    const client = await getTelegramClient();
    const [message] = await client.getMessages(peer, { ids: [msgId] });

    if (!message?.media) {
      return NextResponse.json({ error: "Медиа не найдено" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const media = message.media as any;
    const className = media.className ?? "";

    let mimeType = "application/octet-stream";
    if (className === "MessageMediaPhoto") {
      mimeType = "image/jpeg";
    } else if (className === "MessageMediaDocument") {
      mimeType = media.document?.mimeType ?? "application/octet-stream";
    }

    const buffer = await client.downloadMedia(message, {}) as Buffer | null;
    if (!buffer) {
      return NextResponse.json({ error: "Не удалось загрузить медиа" }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getTelegramClient } from "@/lib/telegram/client";

function getMediaInfo(msg: { media?: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const media = msg.media as any;
  if (!media) return null;

  const className = media.className ?? media.constructor?.name ?? "";

  if (className === "MessageMediaPhoto") {
    return { type: "photo" as const, fileName: null, mimeType: "image/jpeg", duration: null };
  }

  if (className === "MessageMediaDocument") {
    const doc = media.document;
    const attrs: { className: string; fileName?: string; voice?: boolean; duration?: number }[] = doc?.attributes ?? [];
    const isVoice = attrs.some((a) => a.className === "DocumentAttributeAudio" && a.voice);
    const isAudio = attrs.some((a) => a.className === "DocumentAttributeAudio");
    const isVideo = attrs.some((a) => a.className === "DocumentAttributeVideo");
    const isSticker = attrs.some((a) => a.className === "DocumentAttributeSticker");
    const fileAttr = attrs.find((a) => a.className === "DocumentAttributeFilename");
    const audioAttr = attrs.find((a) => a.className === "DocumentAttributeAudio");

    let type: "voice" | "audio" | "video" | "sticker" | "document" = "document";
    if (isVoice) type = "voice";
    else if (isAudio) type = "audio";
    else if (isVideo) type = "video";
    else if (isSticker) type = "sticker";

    return {
      type,
      fileName: fileAttr?.fileName ?? null,
      mimeType: doc?.mimeType ?? "application/octet-stream",
      duration: audioAttr?.duration ?? null,
    };
  }

  if (className === "MessageMediaWebPage") {
    const page = media.webpage;
    return {
      type: "webpage" as const,
      fileName: null,
      mimeType: null,
      duration: null,
      url: page?.url ?? null,
      title: page?.title ?? null,
      description: page?.description ?? null,
    };
  }

  return { type: "unsupported" as const, fileName: null, mimeType: null, duration: null };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const peer = searchParams.get("peer");
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);
  const offsetId = Number(searchParams.get("offsetId") ?? "0");

  if (!peer) return NextResponse.json({ error: "peer обязателен" }, { status: 400 });

  try {
    const client = await getTelegramClient();

    const messages: unknown[] = [];
    for await (const msg of client.iterMessages(peer, {
      limit,
      ...(offsetId > 0 ? { offsetId } : {}),
    })) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = msg as any;
      messages.push({
        id: m.id,
        text: m.message ?? "",
        date: m.date,
        out: m.out ?? false,
        fromName: m.sender?.firstName ?? m.sender?.username ?? null,
        media: getMediaInfo(m),
      });
    }

    return NextResponse.json({ messages });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

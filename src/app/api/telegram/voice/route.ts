import { NextRequest, NextResponse } from "next/server";
import { getTelegramClient } from "@/lib/telegram/client";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const voice = formData.get("voice") as File | null;
  const peer = formData.get("peer") as string | null;

  if (!voice || !peer) {
    return NextResponse.json({ error: "voice и peer обязательны" }, { status: 400 });
  }

  try {
    const client = await getTelegramClient();
    const bytes = await voice.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await client.sendFile(peer, {
      file: buffer,
      voiceNote: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return NextResponse.json({ status: "sent" });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

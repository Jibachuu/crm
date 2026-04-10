import { NextResponse } from "next/server";
import { getTelegramClient } from "@/lib/telegram/client";

export const maxDuration = 30;

export async function GET() {
  try {
    const client = await getTelegramClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dialogs: any[] = [];
    for await (const dialog of client.iterDialogs({ limit: 100 })) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entity = dialog.entity as any;

      // Get profile photo URL (avatar)
      let photoUrl: string | null = null;
      try {
        if (entity && entity.photo) {
          // Use Telegram CDN URL via getProfilePhoto
          const buf = await client.downloadProfilePhoto(entity, { isBig: false });
          if (buf && buf.length > 0) {
            photoUrl = `data:image/jpeg;base64,${Buffer.from(buf).toString("base64")}`;
          }
        }
      } catch { /* skip */ }

      dialogs.push({
        id: dialog.id?.toString(),
        name: dialog.name ?? "Unknown",
        username: entity?.username ?? null,
        phone: entity?.phone ?? null,
        photoUrl,
        unreadCount: dialog.unreadCount ?? 0,
        lastMessage: dialog.message?.message ?? "",
        lastDate: dialog.message?.date ?? null,
        isUser: dialog.isUser,
        isGroup: dialog.isGroup,
        isChannel: dialog.isChannel,
      });
    }

    return NextResponse.json({ dialogs });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

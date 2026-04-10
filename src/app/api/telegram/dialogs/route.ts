import { NextResponse } from "next/server";
import { tgProxy } from "@/lib/telegram/proxy";

export const maxDuration = 30;

export async function GET() {
  try {
    const data = await tgProxy<{ dialogs: unknown[] }>("/dialogs");
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  }
}

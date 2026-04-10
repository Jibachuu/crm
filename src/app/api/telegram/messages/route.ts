import { NextRequest, NextResponse } from "next/server";
import { tgProxy } from "@/lib/telegram/proxy";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const peer = searchParams.get("peer");
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);
  const offsetId = Number(searchParams.get("offsetId") ?? "0");

  if (!peer) return NextResponse.json({ error: "peer обязателен" }, { status: 400 });

  try {
    const data = await tgProxy("/messages", {
      method: "POST",
      body: { peer, limit, offsetId },
    });
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { tgProxy } from "@/lib/telegram/proxy";

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const { peer } = await req.json();
  if (!peer) return NextResponse.json({ error: "peer required" }, { status: 400 });

  try {
    const data = await tgProxy("/mark-unread", { method: "POST", body: { peer } });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

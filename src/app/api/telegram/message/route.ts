import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tgProxy } from "@/lib/telegram/proxy";

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { peer, messageId, text } = await req.json();
  if (!peer || !messageId || typeof text !== "string") {
    return NextResponse.json({ error: "peer, messageId, text required" }, { status: 400 });
  }

  try {
    await tgProxy("/edit-message", { method: "POST", body: { peer, messageId, text } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { peer, messageId } = await req.json();
  if (!peer || !messageId) {
    return NextResponse.json({ error: "peer and messageId required" }, { status: 400 });
  }

  try {
    await tgProxy("/delete-message", { method: "POST", body: { peer, messageId, revoke: true } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

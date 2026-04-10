import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tgProxy } from "@/lib/telegram/proxy";

export async function POST(req: NextRequest) {
  const { to, message, entityType, entityId } = await req.json();

  if (!to || !message) return NextResponse.json({ error: "to and message required" }, { status: 400 });

  try {
    await tgProxy("/send", { method: "POST", body: { peer: to, message } });

    if (entityType && entityId) {
      const supabase = await createClient();
      await supabase.from("communications").insert({
        entity_type: entityType,
        entity_id: entityId,
        channel: "telegram",
        direction: "outbound",
        body: message,
        to_address: to,
      });
    }

    return NextResponse.json({ status: "sent" });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

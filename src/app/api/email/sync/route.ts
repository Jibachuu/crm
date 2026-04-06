import { NextResponse } from "next/server";
import Imap from "imap-simple";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  const port = Number(process.env.IMAP_PORT ?? "993");

  if (!host || !user || !pass) {
    return NextResponse.json({ error: "IMAP не настроен" }, { status: 503 });
  }

  try {
    const connection = await Imap.connect({
      imap: { host, port, tls: port === 993, authTimeout: 10000, user, password: pass },
    });

    await connection.openBox("INBOX");

    const since = new Date();
    since.setDate(since.getDate() - 7); // last 7 days

    const results = await connection.search(["UNSEEN", ["SINCE", since.toDateString()]], {
      bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)", "TEXT"],
      markSeen: true,
      struct: true,
    });

    const supabase = await createClient();
    let saved = 0;

    for (const msg of results) {
      const header = msg.parts.find((p: { which: string }) => p.which.startsWith("HEADER"));
      const text = msg.parts.find((p: { which: string }) => p.which === "TEXT");
      if (!header) continue;

      const from = (header.body as { from?: string[] }).from?.[0] ?? "";
      const subject = (header.body as { subject?: string[] }).subject?.[0] ?? "(без темы)";
      const body = (text?.body as string) ?? "";

      // check if already stored
      const { data: existing } = await supabase
        .from("communications")
        .select("id")
        .eq("channel", "email")
        .eq("from_address", from)
        .eq("subject", subject)
        .limit(1);

      if (existing?.length) continue;

      await supabase.from("communications").insert({
        entity_type: "contact",
        entity_id: "00000000-0000-0000-0000-000000000000", // placeholder — needs matching
        channel: "email",
        direction: "inbound",
        subject,
        body: body.slice(0, 5000),
        from_address: from,
      });
      saved++;
    }

    connection.end();
    return NextResponse.json({ status: "synced", saved });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

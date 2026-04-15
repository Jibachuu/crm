import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface FilePayload {
  name: string;
  type: string;
  data: string; // base64
}

export async function POST(req: NextRequest) {
  const { to, subject, body, entityType, entityId, files } = await req.json() as {
    to: string;
    subject: string;
    body: string;
    entityType?: string;
    entityId?: string;
    files?: FilePayload[];
  };

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "to, subject, body обязательны" }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "info@art-evo.ru";
  const fromName = process.env.SMTP_FROM_NAME ?? "Artevo";
  const from = `${fromName} <${fromAddr}>`;

  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY не настроен" }, { status: 503 });
  }

  try {
    const resend = new Resend(resendKey);

    const attachments = (files ?? [])
      .filter((f) => f.data && f.name)
      .map((f) => ({
        filename: f.name,
        content: Buffer.from(f.data, "base64"),
      }));

    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
      attachments,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Save sent email to DB
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const admin = createAdminClient();
      await admin.from("sent_emails").insert({
        user_id: authUser.id,
        to_address: to,
        subject,
        body,
        attachments: (files ?? []).filter((f) => f.data && f.name).map((f) => ({ filename: f.name, size: Math.round(f.data.length * 3 / 4) })),
      });
    }

    // Log to communications
    if (entityType && entityId) {
      await supabase.from("communications").insert({
        entity_type: entityType,
        entity_id: entityId,
        channel: "email",
        direction: "outbound",
        subject, body,
        from_address: from,
        to_address: to,
      });
    }

    return NextResponse.json({ status: "sent", attachmentCount: attachments.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

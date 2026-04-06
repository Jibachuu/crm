import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const to = formData.get("to") as string;
  const subject = formData.get("subject") as string;
  const body = formData.get("body") as string;
  const entityType = formData.get("entityType") as string | null;
  const entityId = formData.get("entityId") as string | null;

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "to, subject, body обязательны" }, { status: 400 });
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  if (!host || !user || !pass) {
    return NextResponse.json({ error: "Email (SMTP) не настроен" }, { status: 503 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    // Collect file attachments from FormData
    const attachments: { filename: string; content: Buffer; contentDisposition: "attachment" }[] = [];
    for (const [key, value] of formData.entries()) {
      if (key !== "files") continue;
      if (typeof value === "string") continue;
      const file = value as File;
      if (!file.size || !file.name) continue;
      const arrayBuf = await file.arrayBuffer();
      const buf = Buffer.from(new Uint8Array(arrayBuf));
      if (buf.length === 0) continue;
      attachments.push({
        filename: file.name,
        content: buf,
        contentDisposition: "attachment",
      });
    }

    await transporter.sendMail({
      from,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
      attachments,
    });

    // Save sent email to DB (IMAP server has no Sent folder)
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const admin = createAdminClient();
      await admin.from("sent_emails").insert({
        user_id: authUser.id,
        to_address: to,
        subject,
        body,
        attachments: attachments.map((a) => ({ filename: a.filename, size: a.content.length })),
      });
    }

    // Log to communications
    if (entityType && entityId) {
      await supabase.from("communications").insert({
        entity_type: entityType,
        entity_id: entityId,
        channel: "email",
        direction: "outbound",
        subject,
        body,
        from_address: from,
        to_address: to,
      });
    }

    return NextResponse.json({ status: "sent", attachmentCount: attachments.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const to = formData.get("to") as string;
  const subject = formData.get("subject") as string;
  const body = formData.get("body") as string;
  const entityType = formData.get("entityType") as string | null;
  const entityId = formData.get("entityId") as string | null;
  const files = formData.getAll("files") as File[];

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

    const attachments = await Promise.all(
      files.filter((f) => f.size > 0).map(async (f) => ({
        filename: f.name,
        content: Buffer.from(await f.arrayBuffer()),
        contentType: f.type,
      }))
    );

    await transporter.sendMail({
      from,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
      attachments,
    });

    // Log to communications
    if (entityType && entityId) {
      const supabase = await createClient();
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

    return NextResponse.json({ status: "sent" });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

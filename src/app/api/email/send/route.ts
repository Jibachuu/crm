import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
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

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromAddr = process.env.SMTP_FROM ?? user;
  const fromName = process.env.SMTP_FROM_NAME ?? "Artevo";
  const from = `"${fromName}" <${fromAddr}>`;

  if (!host || !user || !pass) {
    return NextResponse.json({ error: "Email (SMTP) не настроен" }, { status: 503 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });

    const attachments = (files ?? [])
      .filter((f) => f.data && f.name)
      .map((f) => ({
        filename: f.name,
        content: f.data,
        encoding: "base64" as const,
      }));

    // Body comes from the rich-text editor as HTML (with <b>/<i>/<a>),
    // OR from API callers as plain text. Detect: contains < tag.
    const isHtml = /<\w+[^>]*>/.test(body);
    let html: string;
    if (isHtml) {
      // Already HTML from contenteditable. Auto-link any bare URLs that
      // the user typed without using the link button.
      html = body.replace(
        /(?<!href=["'])(https?:\/\/[^\s<>"')\]]+)/g,
        '<a href="$1" target="_blank" rel="noopener">$1</a>'
      );
    } else {
      const escaped = body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const linkified = escaped.replace(
        /(https?:\/\/[^\s<>"')\]]+)/g,
        '<a href="$1" target="_blank" rel="noopener">$1</a>'
      );
      html = linkified.replace(/\n/g, "<br>");
    }
    // Plain text fallback for email clients that don't render HTML.
    const text = isHtml
      ? body.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      : body;

    await transporter.sendMail({
      from, to, subject,
      text,
      html,
      attachments,
    });

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

    // Log to communications — store the plain-text version so the
    // timeline doesn't display raw HTML tags.
    if (entityType && entityId) {
      await supabase.from("communications").insert({
        entity_type: entityType,
        entity_id: entityId,
        channel: "email",
        direction: "outbound",
        subject, body: text,
        from_address: from,
        to_address: to,
      });
    }

    return NextResponse.json({ status: "sent", attachmentCount: attachments.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

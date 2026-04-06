import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

function replaceVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => variables[key] ?? match);
}

interface AttachmentMeta {
  filename: string;
  url: string;
  contentType: string;
  size: number;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const contentType = req.headers.get("content-type") ?? "";

  // ── Create campaign (FormData — may include files) ──────────────────
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const action = formData.get("action") as string;
    if (action !== "create") return NextResponse.json({ error: "FormData only for create" }, { status: 400 });

    const name = formData.get("name") as string;
    const subject = formData.get("subject") as string;
    const body_template = formData.get("body_template") as string;
    const from_name = formData.get("from_name") as string | null;
    const from_email = formData.get("from_email") as string | null;
    const recipientsJson = formData.get("recipients") as string;
    const files = formData.getAll("files") as File[];

    const recipients = JSON.parse(recipientsJson || "[]");
    if (!name || !subject || !body_template || !recipients.length) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    // Upload attachment files to Supabase Storage
    const attachments: AttachmentMeta[] = [];
    for (const file of files) {
      if (file.size === 0) continue;
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `campaigns/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const buffer = Buffer.from(bytes);

      const { error: uploadErr } = await admin.storage
        .from("attachments")
        .upload(path, buffer, { contentType: file.type, upsert: false });

      if (uploadErr) {
        if (uploadErr.message?.includes("not found") || uploadErr.message?.includes("Bucket")) {
          await admin.storage.createBucket("attachments", { public: true });
          const { error: retryErr } = await admin.storage
            .from("attachments")
            .upload(path, buffer, { contentType: file.type, upsert: false });
          if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
        } else {
          return NextResponse.json({ error: uploadErr.message }, { status: 500 });
        }
      }

      const { data: urlData } = admin.storage.from("attachments").getPublicUrl(path);
      attachments.push({
        filename: file.name,
        url: urlData.publicUrl,
        contentType: file.type,
        size: file.size,
      });
    }

    const { data: campaign, error } = await admin
      .from("email_campaigns")
      .insert({
        name, subject, body_template,
        from_name: from_name || null,
        from_email: from_email || null,
        total_recipients: recipients.length,
        created_by: user.id,
        attachments,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const recipientRows = recipients.map((r: { email: string; variables: Record<string, string> }) => ({
      campaign_id: campaign.id,
      email: r.email,
      variables: r.variables ?? {},
    }));

    await admin.from("email_recipients").insert(recipientRows);
    return NextResponse.json({ campaign });
  }

  // ── JSON actions ────────────────────────────────────────────────────
  const body = await req.json();
  const { action } = body;

  // ── Send campaign ───────────────────────────────────────────────────
  if (action === "send") {
    const { campaign_id } = body;

    const { data: campaign } = await admin
      .from("email_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (!campaign) return NextResponse.json({ error: "Кампания не найдена" }, { status: 404 });

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json({ error: "SMTP не настроен. Добавьте SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS в переменные окружения" }, { status: 503 });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await admin.from("email_campaigns").update({ status: "sending" }).eq("id", campaign_id);

    const { data: recipients } = await admin
      .from("email_recipients")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    // Prepare attachments: download from storage once
    const campaignAttachments = (campaign.attachments as AttachmentMeta[]) ?? [];
    const mailAttachments = await Promise.all(
      campaignAttachments.map(async (a) => {
        const res = await fetch(a.url);
        return {
          filename: a.filename,
          content: Buffer.from(await res.arrayBuffer()),
          contentType: a.contentType,
        };
      })
    );

    let sentCount = 0;
    let failedCount = 0;
    const fromAddr = campaign.from_email || smtpUser;
    const fromName = campaign.from_name || "CRM";

    for (const recipient of recipients ?? []) {
      const vars = recipient.variables as Record<string, string>;
      const subj = replaceVariables(campaign.subject, vars);
      const html = replaceVariables(campaign.body_template, vars).replace(/\n/g, "<br>");

      try {
        const info = await transporter.sendMail({
          from: `"${fromName}" <${fromAddr}>`,
          to: recipient.email,
          subject: subj,
          html,
          attachments: mailAttachments,
        });
        const messageId = info.messageId?.replace(/^<|>$/g, "") ?? null;
        await admin.from("email_recipients").update({ status: "sent", sent_at: new Date().toISOString(), message_id: messageId }).eq("id", recipient.id);
        sentCount++;
      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? String(err);
        await admin.from("email_recipients").update({ status: "failed", error: msg }).eq("id", recipient.id);
        failedCount++;
      }
    }

    await admin.from("email_campaigns").update({
      status: failedCount === (recipients?.length ?? 0) ? "failed" : "sent",
      sent_count: sentCount,
      failed_count: failedCount,
      sent_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    return NextResponse.json({ sent: sentCount, failed: failedCount });
  }

  // ── Check replies (IMAP scan) ────────────────────────────────────────
  if (action === "check_replies") {
    const { campaign_id } = body;

    const { data: campaign } = await admin
      .from("email_campaigns")
      .select("subject")
      .eq("id", campaign_id)
      .single();

    const { data: recipients } = await admin
      .from("email_recipients")
      .select("id, email, message_id, replied_at")
      .eq("campaign_id", campaign_id)
      .eq("status", "sent");

    const pending = (recipients ?? []).filter((r) => !r.replied_at);
    if (!pending.length) return NextResponse.json({ replied: 0, message: "Нет получателей для проверки" });

    const imapHost = process.env.IMAP_HOST || process.env.SMTP_HOST;
    const imapPort = Number(process.env.IMAP_PORT || 993);
    const imapUser = process.env.IMAP_USER || process.env.SMTP_USER;
    const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS;

    if (!imapHost || !imapUser || !imapPass) {
      return NextResponse.json({ error: "IMAP не настроен" }, { status: 503 });
    }

    // Match by message_id (In-Reply-To header)
    const messageIdMap = new Map<string, string>();
    // Match by email address (fallback for old campaigns without message_id)
    const emailMap = new Map<string, string>();
    const campaignSubject = (campaign?.subject ?? "").toLowerCase();

    for (const r of pending) {
      if (r.message_id) messageIdMap.set(r.message_id, r.id);
      emailMap.set(r.email.toLowerCase(), r.id);
    }

    let client: ImapFlow | null = null;
    let repliedCount = 0;
    const matched = new Set<string>();

    try {
      client = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: true,
        auth: { user: imapUser, pass: imapPass },
        logger: false,
      });

      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        const mailbox = client.mailbox as { exists?: number } | false;
        const total = (mailbox && typeof mailbox === "object") ? (mailbox.exists ?? 0) : 0;
        if (total === 0) return NextResponse.json({ replied: 0 });

        const startSeq = Math.max(1, total - 200 + 1);

        for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, source: true })) {
          try {
            const parsed = await simpleParser(msg.source as Buffer);
            const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
            const inReplyTo = parsed.inReplyTo?.replace(/^<|>$/g, "");
            const subj = (parsed.subject ?? "").toLowerCase();

            let recipientId: string | undefined;

            // Method 1: In-Reply-To header matches message_id
            if (inReplyTo && messageIdMap.has(inReplyTo)) {
              recipientId = messageIdMap.get(inReplyTo);
            }
            // Method 2: From email matches recipient + subject contains campaign subject (Re: ...)
            if (!recipientId && emailMap.has(fromEmail) && subj.includes(campaignSubject)) {
              recipientId = emailMap.get(fromEmail);
            }

            if (recipientId && !matched.has(recipientId)) {
              matched.add(recipientId);
              await admin
                .from("email_recipients")
                .update({ replied_at: parsed.date?.toISOString() ?? new Date().toISOString() })
                .eq("id", recipientId);
              repliedCount++;
            }
          } catch { /* skip unparseable */ }
        }
      } finally {
        lock.release();
      }

      if (repliedCount > 0) {
        const { data: cam } = await admin
          .from("email_campaigns")
          .select("replied_count")
          .eq("id", campaign_id)
          .single();
        await admin
          .from("email_campaigns")
          .update({ replied_count: (cam?.replied_count ?? 0) + repliedCount })
          .eq("id", campaign_id);
      }

      return NextResponse.json({ replied: repliedCount });
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? String(err);
      return NextResponse.json({ error: `IMAP: ${msg}` }, { status: 500 });
    } finally {
      if (client) {
        try { await client.logout(); } catch { /* ignore */ }
      }
    }
  }

  // ── Delete campaign ──────────────────────────────────────────────────
  if (action === "delete") {
    const { campaign_id } = body;
    const { error: delErr } = await admin.from("email_campaigns").delete().eq("id", campaign_id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

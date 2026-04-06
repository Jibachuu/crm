import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import nodemailer from "nodemailer";

function replaceVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => variables[key] ?? match);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const admin = createAdminClient();

  // ── Create campaign ─────────────────────────────────────────────────
  if (action === "create") {
    const { name, subject, body_template, from_name, from_email, recipients } = body;
    if (!name || !subject || !body_template || !recipients?.length) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    const { data: campaign, error } = await admin
      .from("email_campaigns")
      .insert({
        name, subject, body_template,
        from_name: from_name || null,
        from_email: from_email || null,
        total_recipients: recipients.length,
        created_by: user.id,
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

    let sentCount = 0;
    let failedCount = 0;
    const fromAddr = campaign.from_email || smtpUser;
    const fromName = campaign.from_name || "CRM";

    for (const recipient of recipients ?? []) {
      const vars = recipient.variables as Record<string, string>;
      const subj = replaceVariables(campaign.subject, vars);
      const html = replaceVariables(campaign.body_template, vars).replace(/\n/g, "<br>");

      try {
        await transporter.sendMail({
          from: `"${fromName}" <${fromAddr}>`,
          to: recipient.email,
          subject: subj,
          html,
        });
        await admin.from("email_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", recipient.id);
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

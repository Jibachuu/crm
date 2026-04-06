import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const recipientId = url.searchParams.get("rid");
  const isClick = url.searchParams.get("click") === "1";

  if (recipientId) {
    const admin = createAdminClient();

    // Update recipient: mark opened
    const { data: recipient } = await admin
      .from("email_recipients")
      .select("campaign_id, opened_at, open_count")
      .eq("id", recipientId)
      .single();

    if (recipient) {
      const isFirstOpen = !recipient.opened_at;
      await admin
        .from("email_recipients")
        .update({
          opened_at: recipient.opened_at ?? new Date().toISOString(),
          open_count: (recipient.open_count ?? 0) + 1,
        })
        .eq("id", recipientId);

      // Increment campaign opened_count only on first open
      if (isFirstOpen) {
        const { data: campaign } = await admin
          .from("email_campaigns")
          .select("opened_count")
          .eq("id", recipient.campaign_id)
          .single();
        if (campaign) {
          await admin
            .from("email_campaigns")
            .update({ opened_count: (campaign.opened_count ?? 0) + 1 })
            .eq("id", recipient.campaign_id);
        }
      }
    }
  }

  if (isClick) {
    // Redirect to a "thank you" page or back to app
    return NextResponse.redirect(new URL("/api/email/track/confirmed", req.url));
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

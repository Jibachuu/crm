import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestQR, pollQRStatus, getToken, getUserId } from "@/lib/max-client";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = await req.json();

  try {
    if (action === "request_qr") {
      const { qrLink, trackId, pollingInterval } = await requestQR();
      return NextResponse.json({ qrLink, trackId, pollingInterval });
    }

    if (action === "poll") {
      const { trackId } = await req.json().catch(() => ({ trackId: "" }));
      // trackId comes from the initial request_qr response
      const result = await pollQRStatus(trackId);
      return NextResponse.json(result);
    }

    if (action === "status") {
      const token = getToken();
      const userId = getUserId();
      return NextResponse.json({
        connected: !!token,
        userId,
        hasToken: !!token,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  }
}

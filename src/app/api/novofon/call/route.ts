import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initiateCall } from "@/lib/novofon";

// Click-to-call: initiate callback from CRM
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, sip } = await req.json();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  try {
    // Get manager's SIP from user profile.
    // Novofon callback semantics:
    //   from = PBX extension / SIP login to call FIRST (the operator)
    //   to   = client phone number to connect to after operator picks up
    //   sip  = optional, used only for CallerID display
    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("sip_login, sip_number").eq("id", user.id).single();
    const fromNumber = sip || profile?.sip_number || profile?.sip_login || process.env.NOVOFON_DEFAULT_SIP || "";

    if (!fromNumber) {
      return NextResponse.json({ error: "SIP/внутренний номер не настроен. Укажите его в настройках профиля." }, { status: 400 });
    }

    console.log("[novofon/call] from:", fromNumber, "to:", phone);
    const result = await initiateCall(fromNumber, phone);
    console.log("[novofon/call] result:", JSON.stringify(result));
    return NextResponse.json({ ...result, _debug: { from: fromNumber, to: phone } });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

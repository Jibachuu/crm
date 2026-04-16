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
    // Get manager's SIP from user profile
    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("sip_number").eq("id", user.id).single();
    const managerSip = sip || profile?.sip_number || process.env.NOVOFON_DEFAULT_SIP || "";

    if (!managerSip) {
      return NextResponse.json({ error: "SIP номер не настроен. Укажите его в настройках профиля." }, { status: 400 });
    }

    const result = await initiateCall(managerSip, phone);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

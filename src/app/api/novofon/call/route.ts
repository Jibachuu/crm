import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { initiateCall } from "@/lib/novofon";

// Click-to-call: initiate callback from CRM
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, sip } = await req.json();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  try {
    // "from" is the manager's SIP/number, "to" is the client
    // Novofon calls the manager first, then connects to client
    const managerSip = sip || process.env.NOVOFON_DEFAULT_SIP || "";
    const result = await initiateCall(managerSip, phone);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message }, { status: 500 });
  }
}

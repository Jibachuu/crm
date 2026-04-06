import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function verifyZadarmaSignature(params: URLSearchParams, secret: string): boolean {
  const paramsStr = Array.from(params.entries())
    .filter(([k]) => k !== "sign")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const hash = crypto.createHash("md5").update(paramsStr + secret).digest("hex");
  return hash === params.get("sign");
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params = new URLSearchParams();
  formData.forEach((v, k) => params.set(k, String(v)));

  const secret = process.env.ZADARMA_SECRET_KEY ?? "";
  if (secret && !verifyZadarmaSignature(params, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const event = params.get("event");
  const callId = params.get("call_id") ?? params.get("pbx_call_id");
  const callerNum = params.get("caller_id");
  const destination = params.get("destination");
  const duration = params.get("duration");

  const supabase = await createClient();

  if (event === "NOTIFY_END") {
    // Call ended — log to communications
    await supabase.from("communications").insert({
      entity_type: "contact",
      entity_id: "00000000-0000-0000-0000-000000000000", // placeholder — match by phone
      channel: "phone",
      direction: callerNum ? "inbound" : "outbound",
      subject: `Звонок ${callerNum ?? destination}`,
      body: `Продолжительность: ${duration ?? 0} сек.`,
      from_address: callerNum ?? "",
      to_address: destination ?? "",
      duration_seconds: duration ? Number(duration) : null,
      external_id: callId,
    });
  }

  if (event === "NOTIFY_RECORD") {
    const recordUrl = params.get("link");
    if (recordUrl && callId) {
      // Update recording URL in existing communication
      await supabase
        .from("communications")
        .update({ recording_url: recordUrl })
        .eq("external_id", callId);
    }
  }

  return NextResponse.json({ status: "ok" });
}

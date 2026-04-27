import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { communicationId, recordingUrl } = await req.json();
  if (!recordingUrl) return NextResponse.json({ error: "recordingUrl required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  try {
    // 1. Download the recording
    const audioRes = await fetch(recordingUrl);
    if (!audioRes.ok) return NextResponse.json({ error: "Failed to download recording" }, { status: 502 });
    const audioBuffer = await audioRes.arrayBuffer();

    // 2. Send to Whisper API
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: "audio/mp3" }), "recording.mp3");
    formData.append("model", "whisper-1");
    formData.append("language", "ru");

    // Allow swapping the upstream — RU IPs are blocked by OpenAI
    // directly, so OPENAI_BASE_URL pointed at a reseller (bothub.chat
    // / proxyapi.ru / vsegpt.ru / WG-tunneled gateway) lets the same
    // Whisper code path work without touching every endpoint.
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
    const whisperRes = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      return NextResponse.json({ error: `Whisper error: ${err}` }, { status: 502 });
    }

    const result = await whisperRes.json();
    const transcript = result.text || "";

    // 3. Save transcript to communication record
    if (communicationId) {
      const admin = createAdminClient();
      await admin.from("communications").update({ transcript }).eq("id", communicationId);
    }

    return NextResponse.json({ ok: true, transcript });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

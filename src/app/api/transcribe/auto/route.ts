import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Bulk auto-transcribe pending call recordings.
// Called from a VPS cron (every N minutes) — no user auth, secured
// with X-Cron-Token header that matches CRON_SECRET env var. The
// browser STT button still uses /api/transcribe with auth.
//
// Process: find communications with channel=phone, recording_url set,
// transcript IS NULL, recording_url not "pending:" — limit per call
// to avoid Whisper rate limits. Newest first so today's calls
// transcribe quickly even when there's a backlog.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-token") || req.nextUrl.searchParams.get("token");
  if (cronSecret && provided !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const limit = Number(req.nextUrl.searchParams.get("limit") || "10");

  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("communications")
    .select("id, recording_url")
    .eq("channel", "phone")
    .is("transcript", null)
    .not("recording_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of pending ?? []) {
    if (!row.recording_url || row.recording_url.startsWith("pending:")) continue;
    try {
      const audioRes = await fetch(row.recording_url);
      if (!audioRes.ok) {
        results.push({ id: row.id, ok: false, error: `download ${audioRes.status}` });
        continue;
      }
      const audioBuffer = await audioRes.arrayBuffer();
      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer], { type: "audio/mp3" }), "recording.mp3");
      formData.append("model", "whisper-1");
      formData.append("language", "ru");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
      if (!whisperRes.ok) {
        const err = await whisperRes.text();
        results.push({ id: row.id, ok: false, error: `whisper ${whisperRes.status}: ${err.slice(0, 200)}` });
        continue;
      }
      const data = await whisperRes.json();
      const transcript = (data.text || "").trim();
      await admin.from("communications").update({ transcript }).eq("id", row.id);
      results.push({ id: row.id, ok: true });
    } catch (e) {
      results.push({ id: row.id, ok: false, error: String(e) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ scanned: pending?.length ?? 0, transcribed: okCount, results });
}

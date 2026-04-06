import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.TELEMOST_OAUTH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEMOST_OAUTH_TOKEN не настроен" }, { status: 503 });
  }

  const res = await fetch("https://cloud-api.yandex.net/v1/telemost-api/conferences", {
    method: "POST",
    headers: {
      "Authorization": `OAuth ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ waiting_room_level: "PUBLIC" }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Telemost API: ${res.status} ${text}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({ join_url: data.join_url, id: data.id });
}

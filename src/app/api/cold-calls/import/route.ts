import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await req.json();
  if (!rows?.length) return NextResponse.json({ error: "No rows" }, { status: 400 });

  const admin = createAdminClient();
  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { data, error } = await admin.from("cold_calls").insert(batch).select("id");
    if (data) imported += data.length;
    if (error) { errors.push(`Batch ${Math.floor(i/500)+1}: ${error.message}`); break; }
  }

  return NextResponse.json({ imported, total: rows.length, errors });
}

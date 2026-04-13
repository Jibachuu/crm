import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Generic search endpoint for dropdowns — returns {value, label} pairs.
// Supports contacts (with company name) and companies.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table") ?? "contacts";
  const field = searchParams.get("field") ?? "full_name";
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? "30"), 100);

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  if (table === "contacts") {
    const { data } = await supabase
      .from("contacts")
      .select("id, full_name, companies(name)")
      .ilike("full_name", `%${q}%`)
      .order("full_name")
      .limit(limit);

    const results = (data ?? []).map((c: { id: string; full_name: string; companies?: { name: string } | { name: string }[] | null }) => {
      const coName = Array.isArray(c.companies) ? c.companies[0]?.name : c.companies?.name;
      return { value: c.id, label: c.full_name + (coName ? ` · ${coName}` : "") };
    });

    return NextResponse.json({ results });
  }

  if (table === "companies") {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(limit);

    const results = (data ?? []).map((c: { id: string; name: string }) => ({
      value: c.id,
      label: c.name,
    }));

    return NextResponse.json({ results });
  }

  return NextResponse.json({ error: "Unknown table" }, { status: 400 });
}

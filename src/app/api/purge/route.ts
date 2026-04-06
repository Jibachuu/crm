import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_TABLES = ["leads", "deals", "contacts", "companies", "products"] as const;
type Table = typeof ALLOWED_TABLES[number];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admins can purge
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { table } = await req.json() as { table: Table };
  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    // Nullify FK references first
    if (table === "companies") {
      await admin.from("contacts").update({ company_id: null }).not("company_id", "is", null);
      await admin.from("leads").update({ company_id: null }).not("company_id", "is", null);
      await admin.from("deals").update({ company_id: null }).not("company_id", "is", null);
    }
    if (table === "contacts") {
      await admin.from("leads").update({ contact_id: null }).not("contact_id", "is", null);
      await admin.from("deals").update({ contact_id: null }).not("contact_id", "is", null);
    }
    if (table === "leads") {
      await admin.from("lead_products").delete().not("lead_id", "is", null);
    }
    if (table === "deals") {
      await admin.from("deal_products").delete().not("deal_id", "is", null);
    }
    if (table === "products") {
      await admin.from("deal_products").delete().not("product_id", "is", null);
      await admin.from("lead_products").delete().not("product_id", "is", null);
      await admin.from("product_variants").delete().not("product_id", "is", null);
      await admin.from("product_attributes").delete().not("product_id", "is", null);
    }

    // Delete all rows (in batches via neq to match all)
    const { error } = await admin.from(table).delete().not("id", "is", null);

    if (error) {
      console.error("Purge error:", table, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = (e as { message?: string }).message ?? String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

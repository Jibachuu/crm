import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_TABLES = ["leads", "deals", "contacts", "companies", "products", "tasks", "samples"] as const;
type AllowedTable = typeof ALLOWED_TABLES[number];

export async function POST(req: NextRequest) {
  // Verify the caller is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table, ids }: { table: AllowedTable; ids: string[] } = await req.json();

  if (!ALLOWED_TABLES.includes(table as AllowedTable)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
  if (!ids?.length) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  // Use admin client to bypass RLS
  const admin = createAdminClient();

  // PostgREST has a URL length limit — batch to avoid "Bad Request" on large selections
  const CHUNK = 50;

  function chunks<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
  }

  try {
    // For companies and contacts — nullify FK references before deleting (schema has ON DELETE SET NULL,
    // but explicit nullification is safer and avoids trigger/RLS edge cases)
    for (const chunk of chunks(ids, CHUNK)) {
      if (table === "companies") {
        await admin.from("contacts").update({ company_id: null }).in("company_id", chunk);
        await admin.from("leads").update({ company_id: null }).in("company_id", chunk);
        await admin.from("deals").update({ company_id: null }).in("company_id", chunk);
      }
      if (table === "contacts") {
        await admin.from("leads").update({ contact_id: null }).in("contact_id", chunk);
        await admin.from("deals").update({ contact_id: null }).in("contact_id", chunk);
      }
      if (table === "products") {
        await admin.from("deal_products").delete().in("product_id", chunk);
        await admin.from("lead_products").delete().in("product_id", chunk);
      }
    }

    // Delete in batches to stay within PostgREST URL length limit
    for (const chunk of chunks(ids, CHUNK)) {
      const { error } = await admin.from(table).delete().in("id", chunk);
      if (error) {
        console.error("Delete error:", table, JSON.stringify(error));
        return NextResponse.json({ error: error.message ?? error.code ?? JSON.stringify(error) }, { status: 500 });
      }
    }

    return NextResponse.json({ deleted: ids.length });
  } catch (e: unknown) {
    const msg = (e as { message?: string }).message ?? String(e);
    console.error("Delete exception:", table, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

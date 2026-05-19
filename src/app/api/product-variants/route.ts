import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// product_variants — варианты товаров (объём/аромат + остаток). Этап 4.
//
// GET ?product_id=X       → варианты конкретного товара
// PUT { id, stock | ... } → частичное обновление (остатки)

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("product_variants").select("*").eq("product_id", productId).order("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ variants: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};
  for (const f of ["stock", "name", "sku", "price", "volume_ml", "flavor"]) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  const { data, error } = await admin.from("product_variants").update(updates).eq("id", body.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

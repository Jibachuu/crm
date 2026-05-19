import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// All product mutations go through the admin client so non-admin users can
// create/edit products. RLS on public.products allows admin only — keeping
// the table policy strict and routing through this API matches the pattern
// established in the April 27 sweep (companies, leads, deals).
//
// Backlog v5 §1.2.2: manager Рустем got "new row violates row-level
// security policy for table products" trying to add a new product.
//
// GET добавлен 19.05: некоторые модалки (AddProductModal в сделке)
// дёргали supabase из браузера напрямую — Supabase на AWS, российские
// провайдеры блочат AWS IP без VPN, поэтому товары не подгружались
// до включения VPN. Теперь идём через VPS (RU IP, чистый путь).

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const onlyActive = searchParams.get("active") !== "false";
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(Number(searchParams.get("limit") || "2000"), 5000);

  const admin = createAdminClient();
  let query = admin.from("products").select("*").order("name").limit(limit);
  if (onlyActive) query = query.eq("is_active", true);
  if (q) {
    // OR по name/sku — для AddProductModal поиск идёт локально по
    // подгруженному списку, но возможность сузить через ?q= есть на
    // случай очень больших каталогов.
    query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ products: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();
  const { data, error } = await admin.from("products").insert(body).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ product: data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("products").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ product: data });
}

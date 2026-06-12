import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/admin/approve-user
// Body: { user_id: string, approved: boolean }
// Только admin может вызвать. Меняет users.is_approved для целевого юзера.
// Используется со страницы /admin/pending для аппрува новых аккаунтов.
//
// SECURITY: проверяем роль вызывающего НА СЕРВЕРЕ через user-client
// (current_user_role() и RLS), а не доверяем чему-то из body/cookies.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("users").select("role").eq("id", authUser.id).single();
  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Только админ может утверждать пользователей" }, { status: 403 });
  }

  const body = await req.json();
  const userId = body?.user_id;
  const approved = body?.approved !== false;
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const { error } = await admin
    .from("users")
    .update({ is_approved: approved })
    .eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Returns the most recent incoming call in last 30 seconds (for pop-up)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ call: null });

  const admin = createAdminClient();
  const since = new Date(Date.now() - 30000).toISOString();

  // ВАЖНО (#39, Рустем 22.06.2026): фильтр по created_by = текущий юзер.
  // Раньше endpoint возвращал последний inbound звонок ЛЮБОМУ авторизо-
  // ванному → попап вылезал у всех у кого открыт CRM, а звонок реально
  // принимал кто-то один. Жиба видела попап чужого звонка, Рустем
  // принимал на ноуте звонок который пошёл на телефон.
  // webhook ставит created_by на assignee из существующего лида или
  // round-robin — для не-привязанных звонков created_by может быть NULL.
  // Такие показываем admin/supervisor чтобы они могли распределить.
  const { data: me } = await admin.from("users").select("role").eq("id", user.id).single();
  const isLead = me?.role === "admin" || me?.role === "supervisor";

  let query = admin.from("communications")
    .select("id, channel, direction, subject, body, sender_name, from_address, contact_id, created_at, created_by")
    .eq("channel", "phone")
    .eq("direction", "inbound")
    .gte("created_at", since);
  // admin/supervisor видят все звонки (включая «бесхозные» created_by=null),
  // обычные менеджеры — только те где created_by совпадает с их id.
  if (!isLead) query = query.eq("created_by", user.id);
  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return NextResponse.json({ call: null });

  // Get contact details
  let contactName = data.sender_name;
  let companyName: string | null = null;
  let contactLink: string | null = null;

  if (data.contact_id) {
    const { data: contact } = await admin.from("contacts")
      .select("full_name, company_id, companies(name)")
      .eq("id", data.contact_id)
      .single();
    if (contact) {
      contactName = contact.full_name || contactName;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      companyName = (contact.companies as any)?.name || null;
      contactLink = `/contacts/${data.contact_id}`;
    }
  }

  return NextResponse.json({
    call: {
      id: data.id,
      phone: data.from_address,
      contactName,
      companyName,
      contactLink,
      time: data.created_at,
    },
  });
}

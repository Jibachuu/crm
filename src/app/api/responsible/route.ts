import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const admin = createAdminClient();

  // ── CASCADE: change responsible on company → all linked entities ──
  if (action === "cascade_company") {
    const { company_id, new_assigned_to } = body;
    if (!company_id || !new_assigned_to) return NextResponse.json({ error: "company_id and new_assigned_to required" }, { status: 400 });

    // Get old assigned_to for notification
    const { data: company } = await admin.from("companies").select("assigned_to, name").eq("id", company_id).single();
    const oldAssignedTo = company?.assigned_to;

    // Update company
    await admin.from("companies").update({ assigned_to: new_assigned_to }).eq("id", company_id);

    // Update all linked contacts
    const { data: updatedContacts } = await admin.from("contacts").update({ assigned_to: new_assigned_to }).eq("company_id", company_id).select("id");

    // Update all linked leads
    const { data: updatedLeads } = await admin.from("leads").update({ assigned_to: new_assigned_to }).eq("company_id", company_id).select("id");

    // Update all linked deals
    const { data: updatedDeals } = await admin.from("deals").update({ assigned_to: new_assigned_to }).eq("company_id", company_id).select("id");

    return NextResponse.json({
      ok: true,
      updated: {
        contacts: updatedContacts?.length ?? 0,
        leads: updatedLeads?.length ?? 0,
        deals: updatedDeals?.length ?? 0,
      },
    });
  }

  // ── CASCADE: change responsible on deal → company + all linked entities ──
  if (action === "cascade_deal") {
    const { deal_id, new_assigned_to } = body;
    if (!deal_id || !new_assigned_to) return NextResponse.json({ error: "deal_id and new_assigned_to required" }, { status: 400 });

    // Get deal's company_id
    const { data: deal } = await admin.from("deals").select("company_id, assigned_to").eq("id", deal_id).single();

    // Update deal
    await admin.from("deals").update({ assigned_to: new_assigned_to }).eq("id", deal_id);

    // If deal has company, cascade to company and all linked
    if (deal?.company_id) {
      await admin.from("companies").update({ assigned_to: new_assigned_to }).eq("id", deal.company_id);
      await admin.from("contacts").update({ assigned_to: new_assigned_to }).eq("company_id", deal.company_id);
      await admin.from("leads").update({ assigned_to: new_assigned_to }).eq("company_id", deal.company_id);
      await admin.from("deals").update({ assigned_to: new_assigned_to }).eq("company_id", deal.company_id);
    }

    return NextResponse.json({ ok: true });
  }

  // ── BULK TRANSFER: all entities from one manager to another ──
  if (action === "bulk_transfer") {
    const { from_user_id, to_user_id } = body;
    if (!from_user_id || !to_user_id) return NextResponse.json({ error: "from_user_id and to_user_id required" }, { status: 400 });

    const [companies, contacts, leads, deals] = await Promise.all([
      admin.from("companies").update({ assigned_to: to_user_id }).eq("assigned_to", from_user_id).select("id"),
      admin.from("contacts").update({ assigned_to: to_user_id }).eq("assigned_to", from_user_id).select("id"),
      admin.from("leads").update({ assigned_to: to_user_id }).eq("assigned_to", from_user_id).select("id"),
      admin.from("deals").update({ assigned_to: to_user_id }).eq("assigned_to", from_user_id).select("id"),
    ]);

    // Transfer pending tasks too
    const { data: tasks } = await admin.from("tasks").update({ assigned_to: to_user_id }).eq("assigned_to", from_user_id).neq("status", "done").select("id");

    return NextResponse.json({
      ok: true,
      transferred: {
        companies: companies.data?.length ?? 0,
        contacts: contacts.data?.length ?? 0,
        leads: leads.data?.length ?? 0,
        deals: deals.data?.length ?? 0,
        tasks: tasks?.length ?? 0,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

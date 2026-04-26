import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Resolve a phone number to a known contact (last-10-digit ILIKE match).
// Used by:
//   - WebPhone to show the saved name on incoming calls (Novofon's
//     remote_identity.display_name is usually empty)
//   - PhoneLink to attribute click-to-call attempts to a contact id
//
// Matches ANY phone column on contacts (phone / phone_mobile / phone_other).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const raw = (url.searchParams.get("phone") ?? "").trim();
  if (!raw) return NextResponse.json({ contact: null });

  const tail = raw.replace(/\D/g, "").slice(-10);
  if (tail.length < 7) return NextResponse.json({ contact: null });
  const pat = `%${tail}`;

  const admin = createAdminClient();
  const { data } = await admin
    .from("contacts")
    .select("id, full_name, phone, phone_mobile, phone_other, company_id, companies(name)")
    .or(`phone.ilike.${pat},phone_mobile.ilike.${pat},phone_other.ilike.${pat}`)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (!data) return NextResponse.json({ contact: null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const co = (data as any).companies;
  const companyName = Array.isArray(co) ? co[0]?.name : co?.name;

  return NextResponse.json({
    contact: {
      id: data.id,
      full_name: data.full_name,
      company_id: data.company_id,
      company_name: companyName ?? null,
    },
  });
}

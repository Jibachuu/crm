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

  // Жиба 15.05: «дай поиск не только по имени, по почте, телефону и
  // компании». Раньше поиск шёл строго по full_name и менеджер не мог
  // найти контакт по «+7…» или email. Теперь — OR по full_name / email
  // / phone / phone_mobile / position; компания ищется в отдельном
  // под-запросе (PostgREST не поддерживает OR через JOIN-таблицу).
  if (table === "contacts") {
    const pattern = `%${q}%`;
    // Цифры из запроса (для поиска по телефону — нормализуем «+7 (843) 123»)
    const digits = q.replace(/\D/g, "");
    const phoneSuffix = digits.length >= 5 ? `%${digits.slice(-10)}%` : null;

    const orParts = [
      `full_name.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `position.ilike.${pattern}`,
      `telegram_username.ilike.${pattern}`,
    ];
    if (phoneSuffix) {
      orParts.push(`phone.ilike.${phoneSuffix}`);
      orParts.push(`phone_mobile.ilike.${phoneSuffix}`);
    }

    const { data: direct } = await supabase
      .from("contacts")
      .select("id, full_name, phone, phone_mobile, email, companies(name)")
      .or(orParts.join(","))
      .order("full_name")
      .limit(limit);

    // Контакты, чья КОМПАНИЯ матчит запрос — второй запрос
    const { data: byCompany } = await supabase
      .from("contacts")
      .select("id, full_name, phone, phone_mobile, email, companies!inner(name)")
      .ilike("companies.name", pattern)
      .order("full_name")
      .limit(Math.max(limit - (direct?.length ?? 0), 0));

    type Row = {
      id: string; full_name: string;
      phone?: string | null; phone_mobile?: string | null; email?: string | null;
      companies?: { name: string } | { name: string }[] | null;
    };
    const seen = new Set<string>();
    const merged: Row[] = [];
    for (const r of [...(direct ?? []), ...(byCompany ?? [])] as Row[]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      merged.push(r);
      if (merged.length >= limit) break;
    }

    const results = merged.map((c) => {
      const coName = Array.isArray(c.companies) ? c.companies[0]?.name : c.companies?.name;
      // Контактный лейбл: «ФИО · Компания · phone · email» — менеджер
      // видит зачем именно он совпал.
      const parts: string[] = [c.full_name || "(без имени)"];
      if (coName) parts.push(coName);
      const ph = c.phone_mobile || c.phone;
      if (ph) parts.push(ph);
      if (c.email) parts.push(c.email);
      return { value: c.id, label: parts.join(" · ") };
    });

    return NextResponse.json({ results });
  }

  if (table === "companies") {
    const pattern = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const orParts = [`name.ilike.${pattern}`];
    if (digits.length >= 5) orParts.push(`inn.ilike.%${digits}%`);

    const { data } = await supabase
      .from("companies")
      .select("id, name, inn")
      .or(orParts.join(","))
      .order("name")
      .limit(limit);

    const results = (data ?? []).map((c: { id: string; name: string; inn?: string | null }) => ({
      value: c.id,
      label: c.inn ? `${c.name} · ИНН ${c.inn}` : c.name,
    }));

    return NextResponse.json({ results });
  }

  return NextResponse.json({ error: "Unknown table" }, { status: 400 });
}

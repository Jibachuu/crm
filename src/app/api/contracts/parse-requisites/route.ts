import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Parse requisites from PDF text
function parseRequisites(text: string) {
  const r: Record<string, string> = {};

  // Company name — ООО/ИП/АО + "Name"
  const nameMatch = text.match(/(ООО|ОАО|ЗАО|АО|ПАО|ИП)\s*[«"""]([^»"""]+)[»"""]/i) ||
    text.match(/(ООО|ОАО|ЗАО|АО|ПАО)\s+[«"""]?([^»"""\n,]+)/i);
  if (nameMatch) {
    r.buyer_legal_form = nameMatch[1] === "ООО" ? "Общество с ограниченной ответственностью" :
      nameMatch[1] === "АО" ? "Акционерное общество" :
      nameMatch[1] === "ПАО" ? "Публичное акционерное общество" :
      nameMatch[1] === "ИП" ? "Индивидуальный предприниматель" : nameMatch[1];
    r.buyer_name = nameMatch[2].trim();
  }

  // INN
  const innMatch = text.match(/ИНН\s*:?\s*(\d{10,12})/i);
  if (innMatch) r.buyer_inn = innMatch[1];

  // KPP
  const kppMatch = text.match(/КПП\s*:?\s*(\d{9})/i);
  if (kppMatch) r.buyer_kpp = kppMatch[1];

  // OGRN
  const ogrnMatch = text.match(/ОГРН\s*:?\s*(\d{13,15})/i);
  if (ogrnMatch) r.buyer_ogrn = ogrnMatch[1];

  // Address — look for "Юр. адрес" or "Адрес" followed by text
  const addrMatch = text.match(/(?:Юр\.?\s*адрес|Адрес)\s*:?\s*(.+?)(?=\n|ИНН|ОГРН|Банк|Тел|e-?mail|$)/i);
  if (addrMatch) r.buyer_address = addrMatch[1].trim().replace(/[,.]$/, "");

  // Bank name
  const bankMatch = text.match(/Банк\s*:?\s*(.+?)(?=\n|р\/с|Р\/С|р\/сч|БИК|$)/i);
  if (bankMatch) r.buyer_bank_name = bankMatch[1].trim().replace(/[,.]$/, "");

  // Account (р/с)
  const accMatch = text.match(/[рР]\/[сС]\s*:?\s*(\d{20})/);
  if (accMatch) r.buyer_account = accMatch[1];

  // BIK
  const bikMatch = text.match(/БИК\s*:?\s*(\d{9})/i);
  if (bikMatch) r.buyer_bik = bikMatch[1];

  // Corr account (к/с)
  const corrMatch = text.match(/[кК]\/[сС]\s*:?\s*(\d{20})/);
  if (corrMatch) r.buyer_corr_account = corrMatch[1];

  // Director — "Генеральный директор: ФИО" or "в лице ФИО"
  const dirMatch = text.match(/(?:Генеральный директор|Директор|в лице)\s*:?\s*([А-ЯЁа-яё]+\s+[А-ЯЁа-яё]+\s+[А-ЯЁа-яё]+)/i);
  if (dirMatch) {
    r.buyer_director_name = dirMatch[1].trim();
    // Generate short name: "Иванов Иван Иванович" → "Иванов И.И."
    const parts = r.buyer_director_name.split(/\s+/);
    if (parts.length >= 3) {
      r.buyer_short_name = `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
    } else if (parts.length === 2) {
      r.buyer_short_name = `${parts[0]} ${parts[1][0]}.`;
    }
  }

  // Email
  const emailMatch = text.match(/e-?mail\s*:?\s*([^\s,\n]+@[^\s,\n]+)/i);
  if (emailMatch) r.buyer_email = emailMatch[1];

  // Phone
  const phoneMatch = text.match(/Тел\.?\s*:?\s*([+\d\s\-()]{7,})/i);
  if (phoneMatch) r.buyer_phone = phoneMatch[1].trim();

  return r;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const requisites = parseRequisites(text);
  return NextResponse.json({ requisites });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function parseRequisites(text: string) {
  const r: Record<string, string> = {};

  const nameMatch = text.match(/(ООО|ОАО|ЗАО|АО|ПАО|ИП)\s*[«"""]([^»"""]+)[»"""]/i) ||
    text.match(/(ООО|ОАО|ЗАО|АО|ПАО)\s+[«"""]?([^»"""\n,]{3,60})/i);
  if (nameMatch) {
    r.buyer_legal_form = nameMatch[1] === "ООО" ? "Общество с ограниченной ответственностью" :
      nameMatch[1] === "АО" ? "Акционерное общество" :
      nameMatch[1] === "ПАО" ? "Публичное акционерное общество" :
      nameMatch[1] === "ИП" ? "Индивидуальный предприниматель" : nameMatch[1];
    r.buyer_name = nameMatch[2].trim().replace(/[»"""]/g, "");
  }

  const innMatch = text.match(/ИНН\s*:?\s*(\d{10,12})/i);
  if (innMatch) r.buyer_inn = innMatch[1];

  const kppMatch = text.match(/КПП\s*:?\s*(\d{9})/i);
  if (kppMatch) r.buyer_kpp = kppMatch[1];

  const ogrnMatch = text.match(/ОГРН\s*:?\s*(\d{13,15})/i);
  if (ogrnMatch) r.buyer_ogrn = ogrnMatch[1];

  const addrMatch = text.match(/(?:Юр\.?\s*адрес|[Юю]ридический адрес|Адрес)\s*:?\s*(.+?)(?=\n|ИНН|ОГРН|Банк|Тел|e-?mail|КПП|$)/i);
  if (addrMatch) r.buyer_address = addrMatch[1].trim().replace(/[,.\s]+$/, "");

  const bankMatch = text.match(/(?:Банк|банк)\s*:?\s*(.+?)(?=\n|[рР]\/[сС]|БИК|$)/i);
  if (bankMatch) r.buyer_bank_name = bankMatch[1].trim().replace(/[,.\s]+$/, "");

  const accMatch = text.match(/[рР]\/[сС]\s*:?\s*(\d{20})/);
  if (accMatch) r.buyer_account = accMatch[1];

  const bikMatch = text.match(/БИК\s*:?\s*(\d{9})/i);
  if (bikMatch) r.buyer_bik = bikMatch[1];

  const corrMatch = text.match(/[кК]\/[сС]\s*:?\s*(\d{20})/);
  if (corrMatch) r.buyer_corr_account = corrMatch[1];

  const dirMatch = text.match(/(?:Генеральный директор|Директор|в лице)\s*:?\s*([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)/i);
  if (dirMatch) {
    r.buyer_director_name = dirMatch[1].trim();
    const parts = r.buyer_director_name.split(/\s+/);
    if (parts.length >= 3) r.buyer_short_name = `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
    else if (parts.length === 2) r.buyer_short_name = `${parts[0]} ${parts[1][0]}.`;
  }

  const emailMatch = text.match(/e-?mail\s*:?\s*([^\s,\n]+@[^\s,\n]+)/i);
  if (emailMatch) r.buyer_email = emailMatch[1];

  const phoneMatch = text.match(/Тел\.?\s*:?\s*([+\d\s\-()]{7,})/i);
  if (phoneMatch) r.buyer_phone = phoneMatch[1].trim();

  // Also try to find 20-digit account numbers that weren't caught
  if (!r.buyer_account) {
    const accounts = text.match(/40\d{18}/g);
    if (accounts?.[0]) r.buyer_account = accounts[0];
    if (accounts?.[1] && !r.buyer_corr_account) r.buyer_corr_account = accounts[1];
  }
  if (!r.buyer_corr_account) {
    const corr = text.match(/30\d{18}/g);
    if (corr?.[0]) r.buyer_corr_account = corr[0];
  }

  return r;
}

// POST with JSON text
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    // File upload — parse PDF/DOCX on server
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    let text = "";
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "pdf") {
      try {
        // Use pdftotext (poppler-utils) — most reliable PDF text extraction
        const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
        const { execSync } = await import("child_process");
        const tmpPdf = `/tmp/crm_pdf_${Date.now()}.pdf`;
        const tmpTxt = `/tmp/crm_pdf_${Date.now()}.txt`;
        writeFileSync(tmpPdf, Buffer.from(await file.arrayBuffer()));
        execSync(`pdftotext -layout "${tmpPdf}" "${tmpTxt}"`, { timeout: 15000 });
        text = readFileSync(tmpTxt, "utf-8");
        try { unlinkSync(tmpPdf); unlinkSync(tmpTxt); } catch {}
      } catch (e) {
        return NextResponse.json({ error: "PDF parse error: " + String(e) }, { status: 500 });
      }
    } else if (ext === "docx") {
      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const docXml = await zip.file("word/document.xml")?.async("string");
        if (docXml) {
          text = docXml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s{2,}/g, " ");
        }
      } catch (e) {
        return NextResponse.json({ error: "DOCX parse error: " + String(e) }, { status: 500 });
      }
    } else if (ext === "txt") {
      text = await file.text();
    } else {
      return NextResponse.json({ error: "Поддерживаются PDF, DOCX и TXT" }, { status: 400 });
    }

    const requisites = parseRequisites(text);
    return NextResponse.json({ requisites, rawTextLength: text.length, textPreview: text.slice(0, 500) });
  }

  // JSON text (fallback)
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const requisites = parseRequisites(text);
  return NextResponse.json({ requisites });
}

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
        // Extract readable text from PDF binary using regex
        // Works for most business PDFs with embedded text (not scanned images)
        const buffer = Buffer.from(await file.arrayBuffer());
        const raw = buffer.toString("latin1");
        // Extract text between BT...ET blocks (PDF text objects)
        const textBlocks: string[] = [];
        const btEt = raw.match(/BT[\s\S]*?ET/g) || [];
        for (const block of btEt) {
          // Extract strings in parentheses: (text) Tj
          const strings = block.match(/\(([^)]*)\)/g);
          if (strings) textBlocks.push(...strings.map((s) => s.slice(1, -1)));
        }
        // Also try to decode UTF-16BE hex strings: <FEFF...> Tj
        const hexStrings = raw.match(/<FEFF[0-9A-Fa-f]+>/g) || [];
        for (const hs of hexStrings) {
          const hex = hs.slice(5, -1);
          let decoded = "";
          for (let i = 0; i < hex.length; i += 4) {
            const code = parseInt(hex.slice(i, i + 4), 16);
            if (code > 0) decoded += String.fromCharCode(code);
          }
          if (decoded.trim()) textBlocks.push(decoded);
        }
        // Decode common PDF escape sequences
        text = textBlocks.join(" ")
          .replace(/\\n/g, "\n").replace(/\\r/g, "")
          .replace(/\\(\(|\)|\\)/g, "$1")
          .replace(/\x00/g, "");
        // If no text extracted via BT/ET, try raw string extraction
        if (text.trim().length < 20) {
          const rawStrings = raw.match(/[\x20-\x7EА-Яа-яЁё]{4,}/g) || [];
          text = rawStrings.join(" ");
        }
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
    return NextResponse.json({ requisites, rawTextLength: text.length });
  }

  // JSON text (fallback)
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const requisites = parseRequisites(text);
  return NextResponse.json({ requisites });
}

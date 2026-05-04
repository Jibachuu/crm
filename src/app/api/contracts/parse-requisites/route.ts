import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// pdftotext sometimes drops the hyphen before an uppercase letter in compound
// Russian city names — "Ростов-на-Дону" came out as "Ростов-наДону" (backlog
// v5 §2.1.5). Restore the missing hyphen for the well-known compounds.
function normalizeRussianCompoundCities(s: string): string {
  if (!s) return s;
  return s
    .replace(/(Ростов\s*-\s*на)\s*-?\s*([А-ЯЁ])/gu, "$1-$2")
    .replace(/(Комсомольск\s*-\s*на)\s*-?\s*([А-ЯЁ])/gu, "$1-$2")
    .replace(/Ростов\s+на\s+Дону/giu, "Ростов-на-Дону")
    .replace(/Комсомольск\s+на\s+Амуре/giu, "Комсомольск-на-Амуре");
}

function parseRequisites(text: string) {
  const r: Record<string, string> = {};

  // Helper: find value after label (handles "Label    Value" and "Label: Value" and multi-line)
  function findAfter(label: string | RegExp): string {
    const re = typeof label === "string" ? new RegExp(label + "[:\\s]+(.+)", "i") : label;
    const m = text.match(re);
    return m?.[1]?.trim().replace(/[,.\s]+$/, "") || "";
  }

  // ── Company name & legal form ──
  // Format: "Индивидуальный предприниматель Фамилия Имя Отчество"
  const ipMatch = text.match(/Индивидуальный предприниматель\s+([А-ЯЁа-яё]+\s+[А-ЯЁа-яё]+(?:\s+[А-ЯЁа-яё]+)?)/i);
  if (ipMatch) {
    r.buyer_legal_form = "Индивидуальный предприниматель";
    r.buyer_name = ipMatch[1].trim();
    r.buyer_director_name = ipMatch[1].trim();
    r.buyer_director_title = "";
    r.buyer_director_basis = "ОГРНИП";
    // Generate short name
    const parts = r.buyer_name.split(/\s+/);
    if (parts.length >= 3) r.buyer_short_name = `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
    else if (parts.length === 2) r.buyer_short_name = `${parts[0]} ${parts[1][0]}.`;
  }
  // Format: ООО "Name" or ООО «Name»
  if (!r.buyer_name) {
    const oooMatch = text.match(/(ООО|ОАО|ЗАО|АО|ПАО)\s*[«"""]([^»"""]+)[»"""]/i) ||
      text.match(/(ООО|ОАО|ЗАО|АО|ПАО)\s+([^\n,]{3,60})/i);
    if (oooMatch) {
      r.buyer_legal_form = oooMatch[1] === "ООО" ? "Общество с ограниченной ответственностью" :
        oooMatch[1] === "АО" ? "Акционерное общество" :
        oooMatch[1] === "ПАО" ? "Публичное акционерное общество" : oooMatch[1];
      r.buyer_name = oooMatch[2].trim().replace(/[»"""]/g, "");
    }
  }
  // Format: "Наименование    ИП/ООО Name"
  if (!r.buyer_name) {
    const nazvMatch = text.match(/Наименование\s+(.+?)(?=\n|ИНН)/i);
    if (nazvMatch) {
      const val = nazvMatch[1].trim();
      const ipInner = val.match(/Индивидуальный предприниматель\s+(.*)/i);
      if (ipInner) {
        r.buyer_legal_form = "Индивидуальный предприниматель";
        r.buyer_name = ipInner[1].trim();
        r.buyer_director_name = ipInner[1].trim();
        r.buyer_director_title = "";
        r.buyer_director_basis = "ОГРНИП";
        const parts = r.buyer_name.split(/\s+/);
        if (parts.length >= 3) r.buyer_short_name = `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
      } else {
        r.buyer_name = val;
      }
    }
  }

  // ── ИНН ── (exclude bank INN)
  const innAll = [...text.matchAll(/ИНН(?:\s+банка)?\s*:?\s*(\d{10,12})/gi)];
  // Take first non-bank INN
  const innNonBank = innAll.find((m) => !m[0].toLowerCase().includes("банка"));
  if (innNonBank) r.buyer_inn = innNonBank[1];
  else if (innAll[0]) r.buyer_inn = innAll[0][1];

  // ── КПП ──
  const kppMatch = text.match(/КПП\s*:?\s*(\d{9})/i);
  if (kppMatch) r.buyer_kpp = kppMatch[1];

  // ── ОГРН / ОГРНИП ──
  const ogrnMatch = text.match(/ОГРН(?:ИП)?\s*:?\s*(\d{13,15})/i);
  if (ogrnMatch) r.buyer_ogrn = ogrnMatch[1];
  // Fallback: standalone 13-digit number starting with 1 (ОГРН) or 3 (ОГРНИП)
  if (!r.buyer_ogrn) {
    const standalone = text.match(/(?:^|\s)([13]\d{12,14})(?:\s|$)/m);
    if (standalone && standalone[1].length >= 13) r.buyer_ogrn = standalone[1];
  }

  // ── Address — try multiple patterns ──
  const addrPatterns = [
    /(?:Юридический адрес|Юр\.?\s*адрес)\s*:?\s*(.+?)(?=\n|ИНН|Номер|Банк|Валюта|$)/i,
    /Адрес\s*:?\s*(\d{6}.+?)(?=\n|ИНН|Номер|Банк|Валюта|Ген\.?\s*директор|$)/i,
    /Адрес\s*:?\s*([^,\n]{5,}.+?)(?=\n|ИНН|Номер|Банк|$)/i,
  ];
  for (const pat of addrPatterns) {
    const m = text.match(pat);
    if (m && !m[1].toLowerCase().includes("банка") && !m[1].toLowerCase().includes("адрес банка")) {
      r.buyer_address = m[1].trim().replace(/[,.\s]+$/, "");
      break;
    }
  }

  // ── Bank name ──
  const bankName = findAfter(/(?:Наименование банка|Банк)\s*:?\s*(.+?)(?=\n|БИК|$)/i);
  if (bankName) r.buyer_bank_name = bankName;

  // ── Account (р/с, расчётный счёт) ──
  // Russian settlement accounts (р/с) start with 40/41/42; corr accounts
  // (к/с) always start with 301 or 304. We use the prefix as a sanity
  // gate so a mislabelled or PDF-mangled source can't slot a р/с into
  // the corr field (backlog v5 §2.1.7 — wrong PDF showed corr_account
  // = 40702..., which is a settlement-account prefix).
  const SETTLEMENT_PREFIX = /^(40|41|42)/;
  const CORR_PREFIX = /^(30101|30102|304)/;

  const accMatch = text.match(/(?:Расчётный счёт|Расч[её]тный\s+сч[её]т|[рР]\/[сС])\s*:?\s*(\d{20})/i);
  if (accMatch && SETTLEMENT_PREFIX.test(accMatch[1])) r.buyer_account = accMatch[1];

  // ── BIK ──
  // Russian BIKs always start with 04. Anything else is bogus / OCR noise.
  const bikMatch = text.match(/БИК(?:\s+банка)?\s*:?\s*(04\d{7})/i);
  if (bikMatch) r.buyer_bik = bikMatch[1];

  // ── Corr account ──
  const corrMatch = text.match(/(?:Корреспондентский\s+сч[её]т|[кК]\/[сС]|Корр\.?\s*сч[её]т)\s*:?\s*(\d{20})/i);
  if (corrMatch && CORR_PREFIX.test(corrMatch[1])) r.buyer_corr_account = corrMatch[1];

  // If the labelled corr match captured a settlement-account number, the
  // labels in the source PDF are swapped — treat the captured digits as
  // р/с (only if р/с didn't match by its own label).
  if (corrMatch && !r.buyer_corr_account && SETTLEMENT_PREFIX.test(corrMatch[1])) {
    if (!r.buyer_account) r.buyer_account = corrMatch[1];
  }
  // Symmetric salvage for misslabelled р/с.
  if (accMatch && !r.buyer_account && CORR_PREFIX.test(accMatch[1])) {
    if (!r.buyer_corr_account) r.buyer_corr_account = accMatch[1];
  }

  // ── Director (for non-IP) ──
  if (!r.buyer_director_name) {
    // Multiple formats:
    // "Генеральный директор: Фамилия Имя Отчество"
    // "Генеральный директор, действующий на основании Устава: Фамилия Имя Отчество"
    // "в лице генерального директора Фамилия Имя Отчество"
    const dirPatterns = [
      /Генеральный\s+директор[^:]*:\s*([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)/i,
      /в\s+лице\s+(?:генерального\s+)?директора\s+([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)/i,
      /Директор\s*:?\s*([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)/i,
      /(?:Ильина|Питаева|Качанов[а]?|Иванов[а]?)\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/i,
    ];
    for (const pat of dirPatterns) {
      const m = text.match(pat);
      if (m) {
        r.buyer_director_name = m[1]?.trim() || m[0]?.trim();
        break;
      }
    }
    if (r.buyer_director_name) {
      // Clean extra spaces from PDF
      r.buyer_director_name = r.buyer_director_name.replace(/\s{2,}/g, " ").trim();
      const parts = r.buyer_director_name.split(/\s+/);
      if (parts.length >= 3) r.buyer_short_name = `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
      else if (parts.length === 2) r.buyer_short_name = `${parts[0]} ${parts[1][0]}.`;
    }
  }

  // ── Email ──
  const emailMatch = text.match(/e-?mail\s*:?\s*([^\s,\n]+@[^\s,\n]+)/i);
  if (emailMatch) r.buyer_email = emailMatch[1];

  // ── Phone ──
  const phoneMatch = text.match(/Тел\.?\s*:?\s*([+\d\s\-()]{7,})/i);
  if (phoneMatch) r.buyer_phone = phoneMatch[1].trim();

  // ── Fallback: find account numbers by prefix pattern ──
  // Settlement: 40/41/42 + 18 digits. Corr: 30101/30102/304 + 15 digits.
  if (!r.buyer_account) {
    const acc = text.match(/\b(?:40|41|42)\d{18}\b/g);
    if (acc?.[0]) r.buyer_account = acc[0];
  }
  if (!r.buyer_corr_account) {
    const corr = text.match(/\b(?:30101|30102|304\d{2})\d{15}\b/g);
    if (corr?.[0]) r.buyer_corr_account = corr[0];
  }
  if (!r.buyer_bik) {
    const bik = text.match(/\b04\d{7}\b/g);
    if (bik?.[0]) r.buyer_bik = bik[0];
  }

  // Final swap-check: if both fields ended up populated but with prefixes
  // that don't match Russian banking convention, swap them. Cheap insurance
  // against bookkeeper-flagged bug §2.1.7.
  if (r.buyer_account && r.buyer_corr_account) {
    const accIsCorr = CORR_PREFIX.test(r.buyer_account);
    const corrIsAcc = SETTLEMENT_PREFIX.test(r.buyer_corr_account);
    if (accIsCorr && corrIsAcc) {
      const tmp = r.buyer_account;
      r.buyer_account = r.buyer_corr_account;
      r.buyer_corr_account = tmp;
    }
  }

  // Clean all values — remove excessive spaces from PDF layout
  for (const [k, v] of Object.entries(r)) {
    r[k] = v.replace(/\s{2,}/g, " ").trim();
  }

  // Repair compound city names that pdftotext mangled (Ростов-на-Дону etc.)
  if (r.buyer_address) r.buyer_address = normalizeRussianCompoundCities(r.buyer_address);

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
        execSync(`pdftotext "${tmpPdf}" "${tmpTxt}"`, { timeout: 15000 });
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

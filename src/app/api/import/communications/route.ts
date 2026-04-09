import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Manager names for outbound detection (default list)
const DEFAULT_MANAGERS = ["Лилия", "Якимова", "Лилия Якимова", "Якимова Лилия", "Милана", "Идрисова", "Рустем", "Галиев"];

function detectChannel(text: string): string {
  if (/telegram\.png/i.test(text)) return "telegram";
  if (/whatsapp\.png/i.test(text)) return "whatsapp";
  if (/max\.png/i.test(text)) return "maks";
  if (/email|mail\.png/i.test(text)) return "email";
  return "internal";
}

function cleanContent(text: string): string {
  // Remove image URLs
  let cleaned = text.replace(/https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|svg|webp)[^\s]*/gi, "").trim();
  // Remove \xa0 (non-breaking space)
  cleaned = cleaned.replace(/\u00a0/g, " ");
  // Remove double spaces
  cleaned = cleaned.replace(/  +/g, " ");
  // Clean system messages
  cleaned = cleaned.replace(/Принято Изображение/gi, "[Изображение]");
  cleaned = cleaned.replace(/Отправлено Файл/gi, "[Файл]");
  cleaned = cleaned.replace(/Принято Файл/gi, "[Файл]");
  cleaned = cleaned.replace(/Отправлено Изображение/gi, "[Изображение]");
  // Remove all remaining URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, "").trim();
  return cleaned;
}

function extractSenderAndContent(text: string): { sender: string; content: string } {
  const cleaned = cleanContent(text);
  // Try to split by ":\n" (name: \n message)
  const colonIdx = cleaned.indexOf(":\n");
  if (colonIdx > 0 && colonIdx < 60) {
    return { sender: cleaned.slice(0, colonIdx).trim(), content: cleaned.slice(colonIdx + 2).trim() };
  }
  // Try ":" at start of line
  const colonIdx2 = cleaned.indexOf(": ");
  if (colonIdx2 > 0 && colonIdx2 < 60) {
    return { sender: cleaned.slice(0, colonIdx2).trim(), content: cleaned.slice(colonIdx2 + 2).trim() };
  }
  return { sender: "", content: cleaned };
}

function isOutbound(senderName: string, managerNames: string[]): boolean {
  const lower = senderName.toLowerCase();
  return managerNames.some((m) => lower.includes(m.toLowerCase()));
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { rows, managerNames = DEFAULT_MANAGERS, skipInternal = true, skipSystem = true } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows required" }, { status: 400 });
  }

  const admin = createAdminClient();
  let imported = 0, skipped = 0;
  const errors: string[] = [];

  // Pre-load deal mapping by bitrix_id
  const entityIds = [...new Set(rows.map((r: { ENTITY_ID?: string }) => r.ENTITY_ID).filter(Boolean))];
  // Search both deals and leads by bitrix_id
  const entityMap = new Map<string, { type: "deal" | "lead"; id: string; company_id?: string; contact_id?: string }>();

  for (let i = 0; i < entityIds.length; i += 100) {
    const batch = entityIds.slice(i, i + 100);
    // Search deals
    const { data: deals } = await admin.from("deals").select("id, bitrix_id, company_id, contact_id").in("bitrix_id", batch);
    for (const d of deals ?? []) {
      if (d.bitrix_id) entityMap.set(d.bitrix_id, { type: "deal", id: d.id, company_id: d.company_id, contact_id: d.contact_id });
    }
    // Search leads
    const { data: leads } = await admin.from("leads").select("id, bitrix_id, company_id, contact_id").in("bitrix_id", batch);
    for (const l of leads ?? []) {
      if (l.bitrix_id && !entityMap.has(l.bitrix_id)) {
        entityMap.set(l.bitrix_id, { type: "lead", id: l.id, company_id: l.company_id, contact_id: l.contact_id });
      }
    }
  }

  // Process rows in batches
  const toInsert: {
    deal_id: string | null;
    lead_id: string | null;
    company_id: string | null;
    contact_id: string | null;
    channel: string;
    direction: string;
    sender_name: string;
    body: string;
    external_id: string;
    bitrix_deal_id: string;
    created_at: string;
    entity_type: "deal" | "lead";
    entity_id: string;
    created_by: string | null;
  }[] = [];

  for (const row of rows) {
    const externalId = String(row["Идентификатор"] ?? row.id ?? "");
    const entityId = String(row["ENTITY_ID"] ?? row.entity_id ?? "");
    const dateStr = String(row["Дата добавления"] ?? row.date ?? "");
    const author = String(row["Автор"] ?? row.author ?? "");
    const text = String(row["Текст комментария"] ?? row.text ?? "");

    if (!externalId || !entityId || !text) { skipped++; continue; }

    // Detect channel
    const channel = detectChannel(text);
    if (skipInternal && channel === "internal") { skipped++; continue; }
    if (skipSystem && text.includes("=== SYSTEM WZ ===")) { skipped++; continue; }

    // Find deal or lead
    const entity = entityMap.get(entityId);
    if (!entity) { errors.push(`Не найдено: ENTITY_ID=${entityId}`); skipped++; continue; }

    // Extract sender and content
    const { sender, content } = extractSenderAndContent(text);
    if (!content || content.length < 2) { skipped++; continue; }

    // Determine direction
    const senderName = sender || author;
    const direction = isOutbound(senderName, managerNames) ? "outbound" : "inbound";

    // Parse date
    let createdAt: string;
    try {
      createdAt = new Date(dateStr).toISOString();
    } catch {
      createdAt = new Date().toISOString();
    }

    toInsert.push({
      deal_id: entity.type === "deal" ? entity.id : null,
      lead_id: entity.type === "lead" ? entity.id : null,
      company_id: entity.company_id ?? null,
      contact_id: entity.contact_id ?? null,
      channel,
      direction,
      sender_name: senderName,
      body: content,
      external_id: externalId,
      bitrix_deal_id: entityId,
      created_at: createdAt,
      entity_type: entity.type,
      entity_id: entity.id,
      created_by: null,
    });
  }

  // Insert in batches, skip duplicates
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);

    // Check for existing external_ids
    const extIds = batch.map((b) => b.external_id);
    const { data: existing } = await admin.from("communications").select("external_id").in("external_id", extIds);
    const existingSet = new Set((existing ?? []).map((e) => e.external_id));

    const newItems = batch.filter((b) => !existingSet.has(b.external_id));
    if (newItems.length > 0) {
      const { error } = await admin.from("communications").insert(newItems);
      if (error) errors.push(`Batch ${i}: ${error.message}`);
      else imported += newItems.length;
    }
    skipped += batch.length - newItems.length;
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    errors: errors.slice(0, 50),
    totalDeals: entityMap.size,
    totalRows: rows.length,
  });
}

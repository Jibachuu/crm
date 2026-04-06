import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

type Entity = "leads" | "deals" | "contacts" | "companies" | "products";

// Template headers for each entity
export const IMPORT_TEMPLATES: Record<Entity, string[]> = {
  leads: ["Название*", "Статус", "Источник", "Описание"],
  deals: ["Название*", "Стадия", "Сумма", "Источник", "Возражения", "Описание"],
  contacts: ["ФИО*", "Должность", "Телефон", "Email", "Telegram", "Описание"],
  companies: ["Название*", "ИНН", "Телефон", "Email", "Сайт", "Юр. адрес", "Факт. адрес", "Описание"],
  products: ["Название*", "Артикул*", "Базовая цена*", "Описание"],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(entity: Entity, row: Record<string, any>, userId: string) {
  switch (entity) {
    case "leads":
      return {
        title: row["Название*"] ?? row["Название"] ?? "",
        status: row["Статус"] || "new",
        source: row["Источник"] || null,
        description: row["Описание"] || null,
        created_by: userId,
      };
    case "deals":
      return {
        title: row["Название*"] ?? row["Название"] ?? "",
        stage: row["Стадия"] || "lead",
        amount: row["Сумма"] ? Number(row["Сумма"]) : null,
        source: row["Источник"] || null,
        objections: row["Возражения"] || null,
        description: row["Описание"] || null,
        created_by: userId,
      };
    case "contacts":
      return {
        full_name: row["ФИО*"] ?? row["ФИО"] ?? "",
        position: row["Должность"] || null,
        phone: row["Телефон"] || null,
        email: row["Email"] || null,
        telegram_id: row["Telegram"] || null,
        description: row["Описание"] || null,
        created_by: userId,
      };
    case "companies":
      return {
        name: row["Название*"] ?? row["Название"] ?? "",
        inn: row["ИНН"] || null,
        phone: row["Телефон"] || null,
        email: row["Email"] || null,
        website: row["Сайт"] || null,
        legal_address: row["Юр. адрес"] || null,
        actual_address: row["Факт. адрес"] || null,
        description: row["Описание"] || null,
        created_by: userId,
      };
    case "products":
      return {
        name: row["Название*"] ?? row["Название"] ?? "",
        sku: row["Артикул*"] ?? row["Артикул"] ?? "",
        base_price: row["Базовая цена*"] ?? row["Базовая цена"] ?? 0,
        description: row["Описание"] || null,
      };
    default:
      return {};
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!(entity in IMPORT_TEMPLATES)) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  }
  const headers = IMPORT_TEMPLATES[entity as Entity];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  // Set column widths
  ws["!cols"] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, "Шаблон");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template_${entity}.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!(entity in IMPORT_TEMPLATES)) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const errors: string[] = [];
  const toInsert: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const mapped = mapRow(entity as Entity, row, user.id);

    // Validate required fields
    const requiredKey = Object.keys(row).find((k) => k.endsWith("*"));
    const reqVal = requiredKey ? row[requiredKey] : null;
    if (!reqVal && !row["Название"] && !row["ФИО"]) {
      errors.push(`Строка ${i + 2}: отсутствует обязательное поле`);
      continue;
    }
    toInsert.push(mapped);
  }

  if (errors.length > 0 && toInsert.length === 0) {
    return NextResponse.json({ errors, added: 0 });
  }

  let added = 0;
  const insertErrors: string[] = [];

  // Insert in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(entity).insert(batch);
    if (error) {
      insertErrors.push(error.message);
    } else {
      added += batch.length;
    }
  }

  return NextResponse.json({
    added,
    errors: [...errors, ...insertErrors],
    total: rows.length,
  });
}

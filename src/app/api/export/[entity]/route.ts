import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

type Entity = "leads" | "deals" | "contacts" | "companies" | "products" | "samples";

const ENTITY_CONFIGS: Record<Entity, {
  query: (supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) => Promise<{ data: unknown[] | null }>;
  columns: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapper: (row: any) => Record<string, unknown>;
}> = {
  leads: {
    query: async (sb) => sb.from("leads").select("*, contacts(full_name, phone, email), companies(name), users!leads_assigned_to_fkey(full_name)").order("created_at", { ascending: false }),
    columns: ["Название", "Статус", "Источник", "Контакт", "Телефон", "Email", "Компания", "Ответственный", "Описание", "Дата создания"],
    mapper: (r) => ({
      "Название": r.title,
      "Статус": r.status,
      "Источник": r.source ?? "",
      "Контакт": r.contacts?.full_name ?? "",
      "Телефон": r.contacts?.phone ?? "",
      "Email": r.contacts?.email ?? "",
      "Компания": r.companies?.name ?? "",
      "Ответственный": r.users?.full_name ?? "",
      "Описание": r.description ?? "",
      "Дата создания": r.created_at ? new Date(r.created_at).toLocaleDateString("ru-RU") : "",
    }),
  },
  deals: {
    query: async (sb) => sb.from("deals").select("*, contacts(full_name, phone, email), companies(name), users!deals_assigned_to_fkey(full_name)").order("created_at", { ascending: false }),
    columns: ["Название", "Стадия", "Сумма", "Источник", "Контакт", "Телефон", "Компания", "Ответственный", "Возражения", "Описание", "Дата создания"],
    mapper: (r) => ({
      "Название": r.title,
      "Стадия": r.stage,
      "Сумма": r.amount ?? 0,
      "Источник": r.source ?? "",
      "Контакт": r.contacts?.full_name ?? "",
      "Телефон": r.contacts?.phone ?? "",
      "Компания": r.companies?.name ?? "",
      "Ответственный": r.users?.full_name ?? "",
      "Возражения": r.objections ?? "",
      "Описание": r.description ?? "",
      "Дата создания": r.created_at ? new Date(r.created_at).toLocaleDateString("ru-RU") : "",
    }),
  },
  contacts: {
    query: async (sb) => sb.from("contacts").select("*, companies(name), users!contacts_assigned_to_fkey(full_name)").order("full_name"),
    columns: ["ФИО", "Должность", "Телефон", "Email", "Telegram", "Компания", "Ответственный", "Описание", "Дата создания"],
    mapper: (r) => ({
      "ФИО": r.full_name,
      "Должность": r.position ?? "",
      "Телефон": r.phone ?? "",
      "Email": r.email ?? "",
      "Telegram": r.telegram_id ?? "",
      "Компания": r.companies?.name ?? "",
      "Ответственный": r.users?.full_name ?? "",
      "Описание": r.description ?? "",
      "Дата создания": r.created_at ? new Date(r.created_at).toLocaleDateString("ru-RU") : "",
    }),
  },
  companies: {
    query: async (sb) => sb.from("companies").select("*, users!companies_assigned_to_fkey(full_name), venue_types(name), suppliers(name)").order("name"),
    columns: ["Название", "ИНН", "Тип заведения", "Поставщик", "Телефон", "Email", "Сайт", "Юр. адрес", "Факт. адрес", "Санузлов", "Номеров", "Мест мастеров", "Кабинетов", "Ответственный", "Описание", "Дата создания"],
    mapper: (r) => ({
      "Название": r.name,
      "ИНН": r.inn ?? "",
      "Тип заведения": r.venue_types?.name ?? "",
      "Поставщик": r.suppliers?.name ?? "",
      "Телефон": r.phone ?? "",
      "Email": r.email ?? "",
      "Сайт": r.website ?? "",
      "Юр. адрес": r.legal_address ?? "",
      "Факт. адрес": r.actual_address ?? "",
      "Санузлов": r.bathrooms_count ?? "",
      "Номеров": r.rooms_count ?? "",
      "Мест мастеров": r.masters_count ?? "",
      "Кабинетов": r.cabinets_count ?? "",
      "Ответственный": r.users?.full_name ?? "",
      "Описание": r.description ?? "",
      "Дата создания": r.created_at ? new Date(r.created_at).toLocaleDateString("ru-RU") : "",
    }),
  },
  products: {
    query: async (sb) => sb.from("products").select("*").order("name"),
    columns: ["Название", "Артикул", "Базовая цена", "Активен", "Описание", "Дата создания"],
    mapper: (r) => ({
      "Название": r.name,
      "Артикул": r.sku,
      "Базовая цена": r.base_price,
      "Активен": r.is_active ? "Да" : "Нет",
      "Описание": r.description ?? "",
      "Дата создания": r.created_at ? new Date(r.created_at).toLocaleDateString("ru-RU") : "",
    }),
  },
  samples: {
    query: async (sb) => sb.from("samples")
      .select("*, companies(name), contacts(full_name), users!samples_assigned_to_fkey(full_name), logist:users!samples_logist_id_fkey(full_name)")
      .order("created_at", { ascending: false }),
    columns: ["Компания", "Заведение", "Контакт", "Телефон", "Материалы", "Тип доставки", "Адрес доставки", "Трек-номер", "Дата отправки", "Дата прибытия", "Статус", "Комментарий", "МОП", "Логист"],
    mapper: (r) => ({
      "Компания": r.companies?.name ?? "",
      "Заведение": r.venue_name ?? "",
      "Контакт": r.contacts?.full_name ?? "",
      "Телефон": r.contact_phone ?? "",
      "Материалы": r.materials ?? "",
      "Тип доставки": r.delivery_type === "pvz" ? "ПВЗ" : r.delivery_type === "door" ? "До адреса" : "",
      "Адрес доставки": r.delivery_address ?? "",
      "Трек-номер": r.track_number ?? "",
      "Дата отправки": r.sent_date ? new Date(r.sent_date).toLocaleDateString("ru-RU") : "",
      "Дата прибытия": r.arrival_date ? new Date(r.arrival_date).toLocaleDateString("ru-RU") : "",
      "Статус": ({ new: "Новый", sent: "Отправлен", in_transit: "В пути", delivered: "Доставлен", refused: "Отказ" } as Record<string, string>)[r.status] ?? r.status,
      "Комментарий": r.comment ?? "",
      "МОП": r.users?.full_name ?? "",
      "Логист": r.logist?.full_name ?? "",
    }),
  },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const supabase = await createClient();

  if (!(entity in ENTITY_CONFIGS)) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  }

  const config = ENTITY_CONFIGS[entity as Entity];
  const { data } = await config.query(supabase);

  const rows = (data ?? []).map(config.mapper);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: config.columns });
  XLSX.utils.book_append_sheet(wb, ws, entity);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${entity}_${date}.xlsx"`,
    },
  });
}

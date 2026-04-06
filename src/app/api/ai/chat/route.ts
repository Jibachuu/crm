import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `Ты — ИИ-ассистент CRM системы компании Artevo (продажа антивандальных держателей и косметики Havenberg для HoReCa). Отвечай кратко и по делу на русском языке. У тебя есть доступ к данным CRM через инструменты. Всегда используй инструменты для получения актуальных данных перед ответом.`;

const tools: Anthropic.Tool[] = [
  {
    name: "get_deals_stats",
    description: "Получить статистику по сделкам: количество, суммы, по стадиям, за период, по менеджеру",
    input_schema: {
      type: "object",
      properties: {
        period_days: { type: "number", description: "Период в днях от текущей даты (30, 90, 365)" },
        manager_name: { type: "string", description: "Имя менеджера для фильтрации (опционально)" },
      },
      required: [],
    },
  },
  {
    name: "get_company_info",
    description: "Получить информацию о компании: данные, сделки, контакты",
    input_schema: {
      type: "object",
      properties: { company_name: { type: "string", description: "Название компании" } },
      required: ["company_name"],
    },
  },
  {
    name: "get_top_products",
    description: "Получить топ товаров по продажам за период",
    input_schema: {
      type: "object",
      properties: { period_days: { type: "number", description: "Период в днях" }, limit: { type: "number", description: "Кол-во товаров" } },
      required: [],
    },
  },
  {
    name: "get_leads_funnel",
    description: "Получить воронку лидов: количество по статусам, конверсию",
    input_schema: {
      type: "object",
      properties: { period_days: { type: "number", description: "Период в днях" } },
      required: [],
    },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(name: string, input: any): Promise<string> {
  const admin = createAdminClient();
  const since = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

  if (name === "get_deals_stats") {
    const periodDays = input.period_days ?? 30;
    let query = admin.from("deals").select("*, users!deals_assigned_to_fkey(full_name)").gte("created_at", since(periodDays));
    if (input.manager_name) {
      const { data: users } = await admin.from("users").select("id").ilike("full_name", `%${input.manager_name}%`);
      if (users?.length) query = query.in("assigned_to", users.map((u) => u.id));
    }
    const { data: deals } = await query;
    if (!deals?.length) return JSON.stringify({ message: "Нет сделок за этот период" });
    const stages: Record<string, number> = {};
    let totalAmount = 0;
    let wonCount = 0;
    let wonAmount = 0;
    for (const d of deals) {
      stages[d.stage] = (stages[d.stage] ?? 0) + 1;
      totalAmount += d.amount ?? 0;
      if (d.stage === "won") { wonCount++; wonAmount += d.amount ?? 0; }
    }
    return JSON.stringify({ total: deals.length, stages, totalAmount, wonCount, wonAmount, avgDeal: wonCount ? Math.round(wonAmount / wonCount) : 0, period: `${periodDays} дней` });
  }

  if (name === "get_company_info") {
    const { data: companies } = await admin.from("companies").select("*").ilike("name", `%${input.company_name}%`).limit(1);
    if (!companies?.length) return JSON.stringify({ message: "Компания не найдена" });
    const company = companies[0];
    const [{ data: deals }, { data: contacts }] = await Promise.all([
      admin.from("deals").select("title, stage, amount, created_at").eq("company_id", company.id),
      admin.from("contacts").select("full_name, phone, email").eq("company_id", company.id),
    ]);
    return JSON.stringify({ company: { name: company.name, inn: company.inn, type: company.company_type, activity: company.activity, need: company.need, city: company.city }, deals: deals?.map((d) => ({ title: d.title, stage: d.stage, amount: d.amount })) ?? [], contacts: contacts ?? [] });
  }

  if (name === "get_top_products") {
    const periodDays = input.period_days ?? 30;
    const limit = input.limit ?? 10;
    const { data } = await admin.from("deal_products").select("product_id, quantity, total_price, products(name, sku)").gte("created_at", since(periodDays));
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const dp of data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (Array.isArray(dp.products) ? dp.products[0] : dp.products) as any;
      if (!p) continue;
      const curr = map.get(dp.product_id) ?? { name: p.name, qty: 0, revenue: 0 };
      map.set(dp.product_id, { ...curr, qty: curr.qty + (dp.quantity ?? 0), revenue: curr.revenue + (dp.total_price ?? 0) });
    }
    return JSON.stringify(Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, limit));
  }

  if (name === "get_leads_funnel") {
    const periodDays = input.period_days ?? 30;
    const { data: leads } = await admin.from("leads").select("status").gte("created_at", since(periodDays));
    const statuses: Record<string, number> = {};
    for (const l of leads ?? []) statuses[l.status] = (statuses[l.status] ?? 0) + 1;
    const total = leads?.length ?? 0;
    const converted = statuses["converted"] ?? 0;
    return JSON.stringify({ total, statuses, conversionRate: total ? Math.round(converted / total * 100) : 0, period: `${periodDays} дней` });
  }

  return JSON.stringify({ error: "Unknown tool" });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY не настроен" }, { status: 503 });

  const { messages } = await req.json() as { messages: Anthropic.MessageParam[] };

  const client = new Anthropic({ apiKey });

  try {
    let response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Handle tool use loop
    const allMessages = [...messages];
    while (response.stop_reason === "tool_use") {
      const assistantContent = response.content;
      allMessages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          const result = await executeTool(block.name, block.input);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }
      }
      allMessages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools,
        messages: allMessages,
      });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    return NextResponse.json({ reply: textBlock?.text ?? "Не удалось получить ответ" });
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

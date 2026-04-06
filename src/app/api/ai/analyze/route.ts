import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY не настроен" }, { status: 503 });

  const { type, company_id } = await req.json() as { type: "client" | "communications" | "objections"; company_id?: string };
  const admin = createAdminClient();
  const client = new Anthropic({ apiKey });

  try {
    if (type === "client" && company_id) {
      const [{ data: company }, { data: deals }, { data: leads }, { data: comms }] = await Promise.all([
        admin.from("companies").select("*").eq("id", company_id).single(),
        admin.from("deals").select("title, stage, amount, created_at, deal_products(quantity, unit_price, total_price, products(name))").eq("company_id", company_id),
        admin.from("leads").select("title, status, created_at").eq("company_id", company_id),
        admin.from("communications").select("channel, direction, body, created_at").eq("entity_type", "company").eq("entity_id", company_id).order("created_at", { ascending: false }).limit(50),
      ]);

      const prompt = `Проанализируй клиента и дай структурированный отчёт.

Компания: ${JSON.stringify(company)}
Сделки: ${JSON.stringify(deals)}
Лиды: ${JSON.stringify(leads)}
Последние коммуникации: ${JSON.stringify(comms?.slice(0, 30))}

Дай отчёт по следующим пунктам:
1. Краткое резюме клиента (1-2 предложения)
2. Что покупает чаще всего
3. Частота покупок и средний чек
4. Когда последний контакт
5. Риск оттока (высокий/средний/низкий) с объяснением
6. Рекомендация что предложить следующим

Отвечай кратко, по пунктам, на русском.`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content.find((b) => b.type === "text");
      return NextResponse.json({ analysis: text?.text ?? "" });
    }

    if (type === "communications" && company_id) {
      const { data: comms } = await admin.from("communications")
        .select("channel, direction, body, sender_name, from_address, created_at")
        .eq("entity_type", "company").eq("entity_id", company_id)
        .order("created_at", { ascending: false }).limit(100);

      const prompt = `Проанализируй переписки с клиентом и дай структурированный отчёт.

Сообщения (последние 100): ${JSON.stringify(comms)}

Дай отчёт по пунктам:
1. О чём в основном общаемся с этим клиентом
2. Тональность переписки (позитивная/нейтральная/негативная)
3. Открытые вопросы которые остались без ответа
4. Следующий рекомендуемый шаг

Отвечай кратко, на русском.`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content.find((b) => b.type === "text");
      return NextResponse.json({ analysis: text?.text ?? "" });
    }

    if (type === "objections") {
      const { data: deals } = await admin.from("deals").select("objections, stage, amount, created_at").not("objections", "is", null);
      const objections = (deals ?? []).filter((d) => d.objections?.trim()).map((d) => ({ objections: d.objections, stage: d.stage, amount: d.amount, date: d.created_at }));

      if (!objections.length) return NextResponse.json({ analysis: "Нет данных о возражениях" });

      const prompt = `Проанализируй возражения клиентов из CRM и дай структурированный отчёт.

Возражения из сделок: ${JSON.stringify(objections)}

Дай отчёт по пунктам:
1. Топ-5 причин отказов с примерами цитат
2. Распределение по категориям (цена / конкурент / не нужно / отложил / другое)
3. Динамика — стало ли возражений больше/меньше
4. Рекомендации как работать с каждым типом возражений

Отвечай кратко, структурированно, на русском.`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content.find((b) => b.type === "text");
      return NextResponse.json({ analysis: text?.text ?? "" });
    }

    return NextResponse.json({ error: "Unknown analysis type" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as { message?: string }).message ?? String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { tgProxy } from "@/lib/telegram/proxy";

export const maxDuration = 20;

// Глобальный поиск по Telegram — contacts.search. Ищет по username, имени,
// номеру. Возвращает пользователей и группы/каналы которые НЕ находятся
// в 60 последних диалогах (tg-proxy их не тянет из-за РКН-троттлинга).
// Используется в инбоксе когда локальный поиск ничего не даёт.
export async function POST(req: NextRequest) {
  const { q } = await req.json();
  if (!q || typeof q !== "string") return NextResponse.json({ error: "q required" }, { status: 400 });

  try {
    const data = await tgProxy("/search", { method: "POST", body: { q } });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

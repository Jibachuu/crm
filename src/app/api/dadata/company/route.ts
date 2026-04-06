import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { inn } = await req.json();

  const apiKey = process.env.DADATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DADATA_API_KEY не настроен" }, { status: 503 });
  }

  const res = await fetch(
    "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify({ query: inn }),
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Ошибка DaData API" }, { status: res.status });
  }

  const data = await res.json();
  const s = data.suggestions?.[0];
  if (!s) {
    return NextResponse.json({ error: "Компания не найдена" }, { status: 404 });
  }

  return NextResponse.json({
    name: s.value ?? null,
    address: s.data?.address?.value ?? null,
    inn: s.data?.inn ?? null,
    kpp: s.data?.kpp ?? null,
    ogrn: s.data?.ogrn ?? null,
  });
}

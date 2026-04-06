import { NextResponse } from "next/server";

export async function GET() {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Прочитано</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f5f5f5;">
<div style="text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<p style="font-size:32px;margin:0 0 12px;">✓</p>
<p style="font-size:16px;color:#333;font-weight:600;">Спасибо!</p>
<p style="font-size:13px;color:#888;">Ваше прочтение зафиксировано.</p>
</div>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

import { NextResponse } from "next/server";

// Auto-tasks/automations feature removed per user request.
// Endpoint kept as no-op for backward compatibility.

export async function POST() {
  return NextResponse.json({ ok: true, disabled: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, disabled: true });
}

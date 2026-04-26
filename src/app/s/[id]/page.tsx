import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  sent: "Отправлен",
  in_transit: "В пути",
  delivered: "Доставлен",
  refused: "Отказ",
};

const DELIVERY_LABELS: Record<string, string> = {
  pvz: "Пункт выдачи",
  door: "До адреса",
};

// Public sample page (no auth). Linked from inside CRM via a "copy
// link" button so the manager can send the parcel-status URL to the
// client without exposing the rest of the dashboard.
export default async function PublicSamplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: sample } = await admin
    .from("samples")
    .select("*, companies(name), contacts(full_name, phone)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!sample) notFound();

  const co = sample.companies as { name?: string } | null;
  const contact = sample.contacts as { full_name?: string; phone?: string } | null;

  return (
    <div style={{ background: "#faf8f5", minHeight: "100vh", padding: "32px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
        <div style={{ padding: "24px 32px", background: "#0067a5", color: "#fff" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Доставка пробников</h1>
          {co?.name && <p style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>{co.name}</p>}
        </div>

        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
          <Row label="Статус" value={STATUS_LABELS[sample.status] || sample.status} highlight />
          {sample.materials && <Row label="Состав" value={sample.materials} multiline />}
          {sample.delivery_type && <Row label="Способ доставки" value={DELIVERY_LABELS[sample.delivery_type] || sample.delivery_type} />}
          {sample.delivery_address && <Row label="Адрес" value={sample.delivery_address} multiline />}
          {sample.track_number && <Row label="Трек-номер" value={sample.track_number} mono highlight />}
          {sample.sent_date && <Row label="Дата отправки" value={formatDate(sample.sent_date)} />}
          {sample.arrival_date && <Row label="Ожидаемая дата" value={formatDate(sample.arrival_date)} />}
          {contact?.full_name && <Row label="Получатель" value={contact.full_name + (contact.phone ? `, ${contact.phone}` : "")} />}
          {sample.comment && <Row label="Комментарий" value={sample.comment} multiline />}
        </div>

        <div style={{ padding: "16px 32px", background: "#faf8f5", borderTop: "1px solid #efe9df", textAlign: "center", color: "#888", fontSize: 12 }}>
          Если есть вопросы — свяжитесь с менеджером, который вам отправил эту ссылку.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight = false, mono = false, multiline = false }: { label: string; value: string; highlight?: boolean; mono?: boolean; multiline?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: highlight ? 16 : 14,
          fontWeight: highlight ? 600 : 400,
          color: highlight ? "#0067a5" : "#333",
          fontFamily: mono ? "Menlo, monospace" : "inherit",
          whiteSpace: multiline ? "pre-wrap" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}

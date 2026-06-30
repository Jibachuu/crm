"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, User, Phone, Mail, MessageCircle } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import InlineText from "./InlineText";
import { apiPut } from "@/lib/api/client";

type Company = {
  id: string;
  name: string;
  brand_name?: string | null;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  director?: string | null;
  edo_id?: string | null;
  legal_address?: string | null;
  actual_address?: string | null;
  city?: string | null;
  region?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  bank_name?: string | null;
  bik?: string | null;
  bank_account?: string | null;
  corr_account?: string | null;
  venue_types?: { id: string; name: string } | null;
};

type Contact = {
  id: string;
  full_name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  telegram_username?: string | null;
  telegram_id?: string | null;
};

type Props = {
  entityType: "deal" | "lead";
  entityId: string;
  entityDescription?: string | null;
  company?: Company | null;
  contacts: Contact[];
  onEntityDescriptionChanged?: (next: string | null) => void;
};

export default function RelatedInfoBlock({ entityType, entityId, entityDescription, company, contacts: initialContacts, onEntityDescriptionChanged }: Props) {
  const [companyState, setCompanyState] = useState<Company | null>(company ?? null);
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);

  async function saveDeal(field: string, value: string | null) {
    const endpoint = entityType === "deal" ? "/api/deals" : "/api/leads";
    const { error } = await apiPut(endpoint, { id: entityId, [field]: value });
    if (error) throw new Error(error);
    if (field === "description") onEntityDescriptionChanged?.(value);
  }

  async function saveCompany(field: keyof Company, value: string | null) {
    if (!companyState) return;
    const { error } = await apiPut("/api/companies", { id: companyState.id, [field]: value });
    if (error) throw new Error(error);
    setCompanyState((p) => p ? { ...p, [field]: value } : p);
  }

  async function saveContact(id: string, field: keyof Contact, value: string | null) {
    const { error } = await apiPut("/api/contacts", { id, [field]: value });
    if (error) throw new Error(error);
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  }

  const row = (label: React.ReactNode, child: React.ReactNode) => (
    <div className="grid grid-cols-[140px,1fr] items-start gap-2 py-1">
      <div className="text-xs text-slate-500 pt-1">{label}</div>
      <div className="text-sm">{child}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Описание сделки/лида */}
      <Card>
        <CardBody>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">{entityType === "deal" ? "Описание сделки" : "Описание лида"}</h3>
          <InlineText
            value={entityDescription ?? ""}
            multiline
            placeholder="Добавить описание..."
            onSave={(v) => saveDeal("description", v)}
          />
        </CardBody>
      </Card>

      {/* Компания */}
      {companyState && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Building2 size={14} /> Компания
              </h3>
              <Link href={`/companies/${companyState.id}`} className="text-xs hover:underline" style={{ color: "#0067a5" }}>
                Открыть карточку →
              </Link>
            </div>
            {row("Юр. название", <InlineText value={companyState.name} onSave={(v) => saveCompany("name", v)} placeholder="ООО «Компания»" />)}
            {row("Бренд / заведение", <InlineText value={companyState.brand_name ?? ""} onSave={(v) => saveCompany("brand_name", v)} placeholder="как известно клиентам" />)}
            {row("Тип заведения", <span className="text-slate-700">{companyState.venue_types?.name ?? "—"}</span>)}
            {row("ИНН", <InlineText value={companyState.inn ?? ""} onSave={(v) => saveCompany("inn", v)} placeholder="—" />)}
            {row("КПП", <InlineText value={companyState.kpp ?? ""} onSave={(v) => saveCompany("kpp", v)} placeholder="—" />)}
            {row("ОГРН", <InlineText value={companyState.ogrn ?? ""} onSave={(v) => saveCompany("ogrn", v)} placeholder="—" />)}
            {row("Директор", <InlineText value={companyState.director ?? ""} onSave={(v) => saveCompany("director", v)} placeholder="—" />)}
            {row("ЭДО id", <InlineText value={companyState.edo_id ?? ""} onSave={(v) => saveCompany("edo_id", v)} placeholder="Диадок / СБИС / Контур" />)}
            {row("Юр. адрес", <InlineText value={companyState.legal_address ?? ""} onSave={(v) => saveCompany("legal_address", v)} multiline placeholder="—" />)}
            {row("Факт. адрес", <InlineText value={companyState.actual_address ?? ""} onSave={(v) => saveCompany("actual_address", v)} multiline placeholder="—" />)}
            {row("Город", <InlineText value={companyState.city ?? ""} onSave={(v) => saveCompany("city", v)} placeholder="—" />)}
            {row("Регион", <InlineText value={companyState.region ?? ""} onSave={(v) => saveCompany("region", v)} placeholder="—" />)}
            {row("Телефон", <InlineText value={companyState.phone ?? ""} onSave={(v) => saveCompany("phone", v)} placeholder="—" />)}
            {row("Email", <InlineText value={companyState.email ?? ""} onSave={(v) => saveCompany("email", v)} placeholder="—" />)}
            {row("Сайт", <InlineText value={companyState.website ?? ""} onSave={(v) => saveCompany("website", v)} placeholder="—" />)}
            <div className="border-t border-slate-100 my-2" />
            {row("Банк", <InlineText value={companyState.bank_name ?? ""} onSave={(v) => saveCompany("bank_name", v)} placeholder="АО «ТБанк» г. Москва" />)}
            {row("БИК", <InlineText value={companyState.bik ?? ""} onSave={(v) => saveCompany("bik", v)} placeholder="—" />)}
            {row("Р/с", <InlineText value={companyState.bank_account ?? ""} onSave={(v) => saveCompany("bank_account", v)} placeholder="—" />)}
            {row("К/с", <InlineText value={companyState.corr_account ?? ""} onSave={(v) => saveCompany("corr_account", v)} placeholder="—" />)}
            <div className="border-t border-slate-100 my-2" />
            {row("Комментарий", <InlineText value={companyState.description ?? ""} multiline onSave={(v) => saveCompany("description", v)} placeholder="Заметки по компании" />)}
          </CardBody>
        </Card>
      )}

      {/* Контакты */}
      {contacts.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <User size={14} /> Контакты {companyState ? "компании" : ""} ({contacts.length})
            </h3>
            <div className="space-y-4">
              {contacts.map((c) => (
                <div key={c.id} className="pb-3 last:pb-0 last:border-0" style={{ borderBottom: "1px dashed #eee" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <InlineText
                      value={c.full_name}
                      onSave={(v) => saveContact(c.id, "full_name", v)}
                      className="font-medium"
                      placeholder="ФИО"
                    />
                    <Link href={`/contacts/${c.id}`} className="text-xs hover:underline ml-2 flex-shrink-0" style={{ color: "#0067a5" }}>
                      →
                    </Link>
                  </div>
                  {row("Должность", <InlineText value={c.position ?? ""} onSave={(v) => saveContact(c.id, "position", v)} placeholder="—" />)}
                  {row(<span className="flex items-center gap-1"><Phone size={11} /> Телефон</span>,
                    <InlineText value={c.phone ?? ""} onSave={(v) => saveContact(c.id, "phone", v)} placeholder="+7..." />)}
                  {row(<span className="flex items-center gap-1"><Mail size={11} /> Email</span>,
                    <InlineText value={c.email ?? ""} onSave={(v) => saveContact(c.id, "email", v)} placeholder="—" />)}
                  {row(<span className="flex items-center gap-1"><MessageCircle size={11} /> Telegram</span>,
                    <InlineText value={c.telegram_username ?? ""} onSave={(v) => saveContact(c.id, "telegram_username", v)} placeholder="@username" />)}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Building2, User, Briefcase, Tag, X, Phone, Mail } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Props {
  phone?: string;
  telegramId?: string;
  telegramUsername?: string;
  maksId?: string;
  email?: string;
  onClose: () => void;
}

interface Contact { id: string; full_name: string; phone?: string; email?: string; company_id?: string; telegram_id?: string; maks_id?: string; }
interface Company { id: string; name: string; inn?: string; phone?: string; email?: string; legal_address?: string; }
interface Lead { id: string; title: string; status?: string; created_at: string; }
interface Deal { id: string; title: string; stage?: string; amount?: number; created_at: string; }

export default function LinkedEntitiesPanel({ phone, telegramId, telegramUsername, maksId, email, onClose }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"contacts" | "companies" | "leads" | "deals">("contacts");

  useEffect(() => {
    loadAll();
  }, [phone, telegramId, telegramUsername, maksId, email]);

  async function loadAll() {
    setLoading(true);
    const supabase = createClient();

    // Find contacts by any identifier
    const contactFilters: string[] = [];
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      if (cleanPhone) contactFilters.push(`phone.ilike.%${cleanPhone}%`);
    }
    if (telegramId) contactFilters.push(`telegram_id.eq.${telegramId}`);
    if (telegramUsername) contactFilters.push(`telegram_username.eq.${telegramUsername}`);
    if (maksId) contactFilters.push(`maks_id.eq.${maksId}`);
    if (email) contactFilters.push(`email.ilike.${email}`);

    let foundContacts: Contact[] = [];
    if (contactFilters.length > 0) {
      const { data } = await supabase.from("contacts").select("*").or(contactFilters.join(","));
      foundContacts = data ?? [];
      setContacts(foundContacts);
    }

    const contactIds = foundContacts.map((c) => c.id);
    const companyIds = foundContacts.filter((c) => c.company_id).map((c) => c.company_id!);

    // Companies
    if (companyIds.length > 0) {
      const { data } = await supabase.from("companies").select("*").in("id", companyIds);
      setCompanies(data ?? []);
    }

    // Leads — by contact_id
    if (contactIds.length > 0) {
      const { data } = await supabase.from("leads").select("id, title, status, created_at").in("contact_id", contactIds).order("created_at", { ascending: false });
      setLeads(data ?? []);
    }

    // Deals — by contact_id or company_id
    const dealFilters: string[] = [];
    if (contactIds.length > 0) dealFilters.push(`contact_id.in.(${contactIds.join(",")})`);
    if (companyIds.length > 0) dealFilters.push(`company_id.in.(${companyIds.join(",")})`);
    if (dealFilters.length > 0) {
      const { data } = await supabase.from("deals").select("id, title, stage, amount, created_at").or(dealFilters.join(",")).order("created_at", { ascending: false });
      setDeals(data ?? []);
    }

    setLoading(false);
  }

  const tabs = [
    { id: "contacts" as const, label: "Контакты", count: contacts.length, icon: User },
    { id: "companies" as const, label: "Компании", count: companies.length, icon: Building2 },
    { id: "leads" as const, label: "Лиды", count: leads.length, icon: Tag },
    { id: "deals" as const, label: "Сделки", count: deals.length, icon: Briefcase },
  ].filter((t) => t.count > 0);

  return (
    <div className="flex flex-col h-full" style={{ background: "#fff" }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid #e4e4e4" }}>
        <span className="text-sm font-semibold" style={{ color: "#333" }}>Связанные данные</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={14} style={{ color: "#888" }} /></button>
      </div>

      {loading ? (
        <p className="text-xs text-center py-8" style={{ color: "#aaa" }}>Загрузка...</p>
      ) : tabs.length === 0 ? (
        <div className="text-center py-8 px-4">
          <p className="text-sm" style={{ color: "#888" }}>Нет связанных записей</p>
          <p className="text-xs mt-2" style={{ color: "#aaa" }}>
            {phone && <>📞 {phone}<br/></>}
            {telegramUsername && <>💬 @{telegramUsername}<br/></>}
            {email && <>✉️ {email}</>}
          </p>
        </div>
      ) : (
        <>
          <div className="flex" style={{ borderBottom: "1px solid #f0f0f0" }}>
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-xs"
                  style={{
                    color: tab === t.id ? "#0067a5" : "#888",
                    borderBottom: tab === t.id ? "2px solid #0067a5" : "2px solid transparent",
                    fontWeight: tab === t.id ? 600 : 400,
                  }}>
                  <Icon size={12} /> {t.label} <span style={{ background: "#e8f4fd", borderRadius: 8, padding: "0 5px", color: "#0067a5" }}>{t.count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tab === "contacts" && contacts.map((c) => (
              <Link key={c.id} href={`/contacts/${c.id}`} className="block p-3 rounded-lg hover:bg-blue-50 transition-colors" style={{ border: "1px solid #e0e0e0" }}>
                <p className="text-sm font-medium" style={{ color: "#0067a5" }}>{c.full_name}</p>
                {c.phone && <p className="text-xs flex items-center gap-1 mt-1" style={{ color: "#666" }}><Phone size={10} /> {c.phone}</p>}
                {c.email && <p className="text-xs flex items-center gap-1" style={{ color: "#666" }}><Mail size={10} /> {c.email}</p>}
              </Link>
            ))}

            {tab === "companies" && companies.map((c) => (
              <Link key={c.id} href={`/companies/${c.id}`} className="block p-3 rounded-lg hover:bg-blue-50 transition-colors" style={{ border: "1px solid #e0e0e0" }}>
                <p className="text-sm font-medium" style={{ color: "#0067a5" }}>{c.name}</p>
                {c.inn && <p className="text-xs mt-1" style={{ color: "#666" }}>ИНН: {c.inn}</p>}
                {c.phone && <p className="text-xs" style={{ color: "#666" }}>📞 {c.phone}</p>}
                {c.email && <p className="text-xs" style={{ color: "#666" }}>✉️ {c.email}</p>}
                {c.legal_address && <p className="text-xs mt-1" style={{ color: "#888" }}>{c.legal_address}</p>}
              </Link>
            ))}

            {tab === "leads" && leads.map((l) => (
              <Link key={l.id} href={`/leads/${l.id}`} className="block p-3 rounded-lg hover:bg-blue-50 transition-colors" style={{ border: "1px solid #e0e0e0" }}>
                <p className="text-sm font-medium" style={{ color: "#0067a5" }}>{l.title}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs" style={{ color: "#888" }}>{new Date(l.created_at).toLocaleDateString("ru-RU")}</span>
                  {l.status && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#e8f4fd", color: "#0067a5" }}>{l.status}</span>}
                </div>
              </Link>
            ))}

            {tab === "deals" && deals.map((d) => (
              <Link key={d.id} href={`/deals/${d.id}`} className="block p-3 rounded-lg hover:bg-blue-50 transition-colors" style={{ border: "1px solid #e0e0e0" }}>
                <p className="text-sm font-medium" style={{ color: "#0067a5" }}>{d.title}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs" style={{ color: "#888" }}>{new Date(d.created_at).toLocaleDateString("ru-RU")}</span>
                  {d.amount && d.amount > 0 && <span className="text-xs font-semibold" style={{ color: "#2e7d32" }}>{d.amount.toLocaleString("ru-RU")} ₽</span>}
                </div>
                {d.stage && <span className="inline-block text-xs px-2 py-0.5 rounded-full mt-1" style={{ background: "#fff3e0", color: "#e65c00" }}>{d.stage}</span>}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

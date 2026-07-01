"use client";

import { useState, useEffect } from "react";
import { Building2, User, Briefcase, Tag, X, Phone, Mail, Plus, MessageSquare, Send, CheckSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CreateTaskModal from "./CreateTaskModal";

interface Props {
  phone?: string;
  telegramId?: string;
  telegramUsername?: string;
  maksId?: string;
  email?: string;
  displayName?: string;
  channel?: "telegram" | "maks" | "email";
  onClose: () => void;
}

interface Contact { id: string; full_name: string; phone?: string; email?: string; company_id?: string; telegram_id?: string; maks_id?: string; }
interface Company { id: string; name: string; inn?: string; phone?: string; email?: string; legal_address?: string; }
interface Lead { id: string; title: string; status?: string; created_at: string; }
interface Deal { id: string; title: string; stage?: string; amount?: number; created_at: string; }

export default function LinkedEntitiesPanel({ phone, telegramId, telegramUsername, maksId, email, displayName, channel, onClose }: Props) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"contacts" | "companies" | "leads" | "deals">("contacts");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  // R4: модалка создания задачи привязанной к найденной сущности
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  async function handleCreateLead() {
    setCreating(true);
    setCreateMsg("");
    try {
      const res = await fetch("/api/inbox/create-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone, telegram_id: telegramId, telegram_username: telegramUsername,
          maks_id: maksId, email, full_name: displayName, channel,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setCreateMsg("Создано! Открываю…");
        // refresh local state so the new lead/contact appears immediately
        await loadAll();
        if (data.leadId) router.push(`/leads/${data.leadId}`);
      } else {
        setCreateMsg("Ошибка: " + (data.error || "не удалось создать"));
      }
    } catch (e) {
      setCreateMsg("Ошибка: " + String(e));
    }
    setCreating(false);
  }

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
      // Filter out soft-deleted contacts. Admins see deleted rows by RLS,
      // so without this an old contact merged via /api/contacts/merge keeps
      // showing up here next to the kept one (Жиба's "объединила, а их два"
      // 27.04). Dedup by id afterwards in case multiple identifier filters
      // hit the same row.
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .or(contactFilters.join(","))
        .is("deleted_at", null);
      const seen = new Set<string>();
      foundContacts = (data ?? []).filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      setContacts(foundContacts);
    }

    const contactIds = foundContacts.map((c) => c.id);
    const companyIds = foundContacts.filter((c) => c.company_id).map((c) => c.company_id!);

    // Companies
    if (companyIds.length > 0) {
      const { data } = await supabase.from("companies").select("*").in("id", companyIds).is("deleted_at", null);
      setCompanies(data ?? []);
    } else {
      setCompanies([]);
    }

    // Leads — by contact_id
    if (contactIds.length > 0) {
      const { data } = await supabase.from("leads").select("id, title, status, created_at").in("contact_id", contactIds).is("deleted_at", null).order("created_at", { ascending: false });
      setLeads(data ?? []);
    } else {
      setLeads([]);
    }

    // Deals — by contact_id or company_id
    const dealFilters: string[] = [];
    if (contactIds.length > 0) dealFilters.push(`contact_id.in.(${contactIds.join(",")})`);
    if (companyIds.length > 0) dealFilters.push(`company_id.in.(${companyIds.join(",")})`);
    if (dealFilters.length > 0) {
      const { data } = await supabase.from("deals").select("id, title, stage, amount, created_at").or(dealFilters.join(",")).is("deleted_at", null).order("created_at", { ascending: false });
      setDeals(data ?? []);
    } else {
      setDeals([]);
    }

    setLoading(false);
  }

  const tabs = [
    { id: "contacts" as const, label: "Контакты", count: contacts.length, icon: User },
    { id: "companies" as const, label: "Компании", count: companies.length, icon: Building2 },
    { id: "leads" as const, label: "Лиды", count: leads.length, icon: Tag },
    { id: "deals" as const, label: "Сделки", count: deals.length, icon: Briefcase },
  ].filter((t) => t.count > 0);

  const primaryContact = contacts[0];
  const primaryCompany = companies[0];
  const primaryPhone = primaryContact?.phone || phone;
  const primaryEmail = primaryContact?.email || email;
  const heroName = primaryContact?.full_name || displayName || primaryPhone || "Без имени";
  const heroInitials = heroName.split(/[\s·]/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const channelColor = channel === "telegram" ? "#28a5f5" : channel === "maks" ? "#4b8fd1" : "#7d8b99";

  // Приоритетная сущность для «Создать задачу» — контакт, потом компания.
  const taskEntity = primaryContact ? { type: "contact" as const, id: primaryContact.id } :
                     primaryCompany ? { type: "company" as const, id: primaryCompany.id } : null;

  return (
    <div className="inbox-scope" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--tg-bg-panel)" }}>
      {/* Hero card */}
      <div style={{ padding: "16px 16px 12px 16px", borderBottom: "1px solid var(--tg-border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0, flex: 1 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: `linear-gradient(135deg, ${channelColor}dd, ${channelColor}88)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 500, color: "#fff", flexShrink: 0,
            }}>{heroInitials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--tg-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{heroName}</div>
              <div style={{ fontSize: 12, color: "var(--tg-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {primaryCompany?.name || (channel === "telegram" ? "Telegram" : channel === "maks" ? "МАКС" : "Контакт")}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="inbox-sidebar-btn" title="Закрыть"><X size={16} /></button>
        </div>

        {/* Быстрые действия */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {primaryPhone && (
            <a
              href={`tel:${primaryPhone}`}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "10px 4px", background: "var(--tg-bg-panel-hover)", borderRadius: 8,
                color: "var(--tg-text)", textDecoration: "none", fontSize: 11,
              }}
              title={`Позвонить ${primaryPhone}`}
            >
              <Phone size={18} style={{ color: "var(--tg-accent)" }} />
              Звонок
            </a>
          )}
          {primaryEmail && (
            <a
              href={`mailto:${primaryEmail}`}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "10px 4px", background: "var(--tg-bg-panel-hover)", borderRadius: 8,
                color: "var(--tg-text)", textDecoration: "none", fontSize: 11,
              }}
              title={`Написать ${primaryEmail}`}
            >
              <Mail size={18} style={{ color: "var(--tg-accent)" }} />
              Email
            </a>
          )}
          {taskEntity && (
            <button
              onClick={() => setTaskModalOpen(true)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "10px 4px", background: "var(--tg-bg-panel-hover)", borderRadius: 8,
                color: "var(--tg-text)", border: "none", cursor: "pointer", fontSize: 11,
              }}
              title="Создать задачу"
            >
              <CheckSquare size={18} style={{ color: "var(--tg-accent)" }} />
              Задача
            </button>
          )}
          {primaryContact && (
            <Link
              href={`/contacts/${primaryContact.id}`}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "10px 4px", background: "var(--tg-bg-panel-hover)", borderRadius: 8,
                color: "var(--tg-text)", textDecoration: "none", fontSize: 11,
              }}
              title="Открыть карточку контакта"
            >
              <User size={18} style={{ color: "var(--tg-accent)" }} />
              Карточка
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, textAlign: "center", padding: 32, color: "var(--tg-text-secondary)" }}>Загрузка...</p>
      ) : tabs.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <div style={{ marginBottom: 12, fontSize: 34, opacity: 0.35 }}>🔍</div>
          <p style={{ fontSize: 13, color: "var(--tg-text-secondary)", marginBottom: 6 }}>Контакт не найден в CRM</p>
          <p style={{ fontSize: 11, color: "var(--tg-text-tertiary)", marginBottom: 16 }}>
            {phone && <>📞 {phone}<br/></>}
            {telegramUsername && <>💬 @{telegramUsername}<br/></>}
            {maksId && <>🅼 {maksId}<br/></>}
            {email && <>✉️ {email}</>}
          </p>
          <button
            onClick={handleCreateLead}
            disabled={creating}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, fontSize: 13,
              background: "var(--tg-accent)", color: "#fff", border: "none",
              cursor: creating ? "default" : "pointer", opacity: creating ? 0.5 : 1,
            }}
          >
            <Plus size={13} /> {creating ? "Создание…" : "Создать лид"}
          </button>
          {createMsg && <p style={{ fontSize: 11, marginTop: 8, color: createMsg.startsWith("Ошибка") ? "#e57373" : "#a8dc9c" }}>{createMsg}</p>}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", borderBottom: "1px solid var(--tg-border-subtle)" }}>
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    padding: "10px 4px", fontSize: 12, background: "transparent",
                    color: active ? "var(--tg-accent)" : "var(--tg-text-secondary)",
                    borderTop: "none", borderLeft: "none", borderRight: "none",
                    borderBottom: active ? "2px solid var(--tg-accent)" : "2px solid transparent",
                    marginBottom: -1, cursor: "pointer",
                  }}
                >
                  <Icon size={13} /> {t.label} <span style={{ padding: "0 5px", borderRadius: 8, background: active ? "var(--tg-accent-dim)" : "var(--tg-bg-panel-hover)", fontSize: 11 }}>{t.count}</span>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {tab === "contacts" && contacts.map((c) => (
              <Link key={c.id} href={`/contacts/${c.id}`} style={{
                display: "block", padding: 10, borderRadius: 8,
                background: "var(--tg-bg-panel-hover)", color: "var(--tg-text)",
                textDecoration: "none", transition: "background-color 0.1s",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tg-bg-input)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--tg-bg-panel-hover)")}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tg-accent)" }}>{c.full_name}</div>
                {c.phone && <div style={{ fontSize: 11, marginTop: 3, color: "var(--tg-text-secondary)", display: "flex", alignItems: "center", gap: 4 }}><Phone size={10} /> {c.phone}</div>}
                {c.email && <div style={{ fontSize: 11, color: "var(--tg-text-secondary)", display: "flex", alignItems: "center", gap: 4 }}><Mail size={10} /> {c.email}</div>}
              </Link>
            ))}

            {tab === "companies" && companies.map((c) => (
              <Link key={c.id} href={`/companies/${c.id}`} style={{
                display: "block", padding: 10, borderRadius: 8,
                background: "var(--tg-bg-panel-hover)", color: "var(--tg-text)",
                textDecoration: "none", transition: "background-color 0.1s",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tg-bg-input)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--tg-bg-panel-hover)")}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tg-accent)" }}>{c.name}</div>
                {c.inn && <div style={{ fontSize: 11, marginTop: 3, color: "var(--tg-text-secondary)" }}>ИНН: {c.inn}</div>}
                {c.legal_address && <div style={{ fontSize: 11, marginTop: 3, color: "var(--tg-text-tertiary)" }}>{c.legal_address}</div>}
              </Link>
            ))}

            {tab === "leads" && leads.map((l) => (
              <Link key={l.id} href={`/leads/${l.id}`} style={{
                display: "block", padding: 10, borderRadius: 8,
                background: "var(--tg-bg-panel-hover)", color: "var(--tg-text)",
                textDecoration: "none",
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tg-accent)" }}>{l.title}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--tg-text-tertiary)" }}>{new Date(l.created_at).toLocaleDateString("ru-RU")}</span>
                  {l.status && <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 8, background: "var(--tg-accent-dim)", color: "var(--tg-accent)" }}>{l.status}</span>}
                </div>
              </Link>
            ))}

            {tab === "deals" && deals.map((d) => (
              <Link key={d.id} href={`/deals/${d.id}`} style={{
                display: "block", padding: 10, borderRadius: 8,
                background: "var(--tg-bg-panel-hover)", color: "var(--tg-text)",
                textDecoration: "none",
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tg-accent)" }}>{d.title}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--tg-text-tertiary)" }}>{new Date(d.created_at).toLocaleDateString("ru-RU")}</span>
                  {d.amount && d.amount > 0 ? <span style={{ fontSize: 11, fontWeight: 500, color: "#a8dc9c" }}>{d.amount.toLocaleString("ru-RU")} ₽</span> : null}
                </div>
                {d.stage && <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, padding: "1px 8px", borderRadius: 8, background: "rgba(230, 92, 0, 0.18)", color: "#ffab6b" }}>{d.stage}</span>}
              </Link>
            ))}
          </div>
        </>
      )}

      {taskModalOpen && taskEntity && (
        <CreateTaskModal
          open={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          entityType={taskEntity.type}
          entityId={taskEntity.id}
          onCreated={() => setTaskModalOpen(false)}
        />
      )}
    </div>
  );
}

// Заглушка чтобы eslint не жаловался на неиспользованный импорт из R2-context menu.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = { MessageSquare, Send };

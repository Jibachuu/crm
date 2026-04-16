"use client";

import { useState, useEffect, useRef } from "react";
import { Search, RefreshCw, MessageSquare, Link2, ArrowLeft } from "lucide-react";
import TelegramChat from "@/components/ui/TelegramChat";
import LinkedEntitiesPanel from "@/components/ui/LinkedEntitiesPanel";
import { createClient } from "@/lib/supabase/client";

interface Dialog {
  id: string;
  name: string;
  username: string | null;
  phone: string | null;
  photoUrl?: string | null;
  unreadCount: number;
  lastMessage: string;
  lastDate: number | null;
  isUser: boolean;
  isGroup: boolean;
  isChannel: boolean;
}

function formatDialogDate(unix: number | null) {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// Deterministic avatar color per name
const AVATAR_COLORS = ["#0067a5", "#2e7d32", "#c62828", "#e65c00", "#6a1b9a", "#00838f", "#ad1457", "#2e4057"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

export default function InboxClient() {
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Dialog | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [linkedOpen, setLinkedOpen] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("");

  // Get current user name for message attribution
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("users").select("full_name").eq("id", user.id).single();
        if (data) setCurrentUserName(data.full_name);
      }
    })();
  }, []);

  async function loadDialogs(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/telegram/dialogs");
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      // Enrich with CRM contact names + company (by telegram_id, username, or phone)
      try {
        const supabase = createClient();
        const dialogs = data.dialogs as Dialog[];
        const tgIds = dialogs.map((d) => String(d.id));
        const tgUsernames = dialogs.filter((d) => d.username).map((d) => d.username!);
        const phoneNumbers = dialogs.filter((d) => d.phone).map((d) => d.phone!.replace(/\D/g, "").slice(-10)).filter((p) => p.length >= 7);
        const orFilters: string[] = [];
        if (tgIds.length) orFilters.push(`telegram_id.in.(${tgIds.join(",")})`);
        if (tgUsernames.length) orFilters.push(`telegram_username.in.(${tgUsernames.join(",")})`);
        for (const p of [...new Set(phoneNumbers)].slice(0, 50)) orFilters.push(`phone.ilike.%${p}`);
        if (orFilters.length) {
          const { data: contacts } = await supabase
            .from("contacts")
            .select("telegram_id, telegram_username, full_name, phone, company_id")
            .or(orFilters.join(","));
          const companyIds = [...new Set((contacts ?? []).map((c: { company_id?: string }) => c.company_id).filter(Boolean))];
          const companyMap = new Map<string, string>();
          if (companyIds.length) {
            const { data: companies } = await supabase.from("companies").select("id, name").in("id", companyIds);
            for (const co of companies ?? []) companyMap.set(co.id, co.name);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const byTgId = new Map<string, any>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const byTgUser = new Map<string, any>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const byPhone = new Map<string, any>();
          for (const c of contacts ?? []) {
            if (c.telegram_id) byTgId.set(String(c.telegram_id), c);
            if (c.telegram_username) byTgUser.set(c.telegram_username.toLowerCase(), c);
            if (c.phone) byPhone.set(c.phone.replace(/\D/g, "").slice(-10), c);
          }
          for (const d of dialogs) {
            const phoneSuffix = d.phone ? d.phone.replace(/\D/g, "").slice(-10) : "";
            const contact = byTgId.get(String(d.id)) || (d.username ? byTgUser.get(d.username.toLowerCase()) : undefined) || (phoneSuffix ? byPhone.get(phoneSuffix) : undefined);
            if (contact?.full_name && !/^\d+$/.test(contact.full_name)) {
              const companyName = contact.company_id ? companyMap.get(contact.company_id) : undefined;
              d.name = companyName ? `${contact.full_name} · ${companyName}` : contact.full_name;
            }
          }
        }
      } catch { /* skip enrichment */ }
      setDialogs(data.dialogs);
      setError(null);
    } catch {
      setError("Не удалось загрузить диалоги");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadDialogs(); }, []);

  const filtered = dialogs.filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.username?.toLowerCase().includes(search.toLowerCase()) ||
    d.phone?.includes(search)
  );

  // The peer to pass to TelegramChat: prefer username, fallback to phone, then id
  const selectedPeer = selected?.username ?? selected?.phone ?? selected?.id ?? null;

  return (
    <div className="flex h-full" style={{ minHeight: 0 }}>
      {/* Left panel — dialog list */}
      <div className="flex flex-col flex-shrink-0" style={{ width: 300, borderRight: "1px solid #e4e4e4", background: "#fff" }}>
        {/* Search */}
        <div className="p-3" style={{ borderBottom: "1px solid #e4e4e4" }}>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-8 pr-3 py-1.5 text-sm focus:outline-none rounded-full"
              style={{ border: "1px solid #e0e0e0", background: "#f5f5f5" }}
            />
          </div>
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold" style={{ color: "#888" }}>TELEGRAM · {filtered.length}</span>
          <button onClick={() => loadDialogs(true)} disabled={refreshing} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw size={13} style={{ color: "#888" }} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-sm" style={{ color: "#aaa" }}>
              Загрузка диалогов...
            </div>
          )}
          {error && !loading && (
            <div className="p-4 text-sm text-center" style={{ color: "#d32f2f" }}>
              {error}
              <br />
              <button onClick={() => loadDialogs()} className="text-xs underline mt-1" style={{ color: "#0067a5" }}>Повторить</button>
            </div>
          )}
          {!loading && !error && filtered.map((dialog) => {
            const isSel = selected?.id === dialog.id;
            return (
              <button
                key={dialog.id}
                onClick={() => setSelected(dialog)}
                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-slate-50 transition-colors"
                style={{ background: isSel ? "#e8f4fd" : "transparent", borderLeft: isSel ? "3px solid #0067a5" : "3px solid transparent" }}
              >
                {/* Avatar */}
                {dialog.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dialog.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: avatarColor(dialog.name) }}>
                    {getInitials(dialog.name)}
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate" style={{ color: "#222" }}>
                      {dialog.isChannel && <span className="text-xs mr-1 px-1 py-0.5 rounded" style={{ background: "#fff3e0", color: "#e65c00", fontSize: 9 }}>КАНАЛ</span>}
                      {dialog.isGroup && <span className="text-xs mr-1 px-1 py-0.5 rounded" style={{ background: "#e8f5e9", color: "#2e7d32", fontSize: 9 }}>ГРУППА</span>}
                      {dialog.name}
                    </span>
                    <span className="text-xs flex-shrink-0 ml-1" style={{ color: "#aaa" }}>
                      {formatDialogDate(dialog.lastDate)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs truncate" style={{ color: "#888", maxWidth: 180 }}>
                      {dialog.lastMessage || (dialog.isGroup ? "Группа" : dialog.isChannel ? "Канал" : "")}
                    </span>
                    {dialog.unreadCount > 0 && (
                      <span className="ml-1 text-xs text-white rounded-full px-1.5 py-0.5 flex-shrink-0"
                        style={{ background: "#0067a5", minWidth: 18, textAlign: "center" }}>
                        {dialog.unreadCount > 99 ? "99+" : dialog.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel — chat */}
      <div className="flex-1 flex min-w-0" style={{ background: "#f5f5f5" }}>
        <div className="flex flex-col flex-1 min-w-0">
        {!selectedPeer ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <MessageSquare size={48} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите диалог слева</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: "1px solid #e4e4e4", background: "#fff" }}>
              {selected!.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected!.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: avatarColor(selected!.name) }}>
                  {getInitials(selected!.name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "#222" }}>
                  {selected!.name}
                  {selected!.isChannel && <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "#fff3e0", color: "#e65c00" }}>Канал</span>}
                </p>
                {selected!.username && <p className="text-xs" style={{ color: "#0067a5" }}>@{selected!.username}</p>}
                {!selected!.username && selected!.phone && <p className="text-xs" style={{ color: "#888" }}>{selected!.phone}</p>}
              </div>
              <button
                onClick={() => setLinkedOpen(!linkedOpen)}
                className="text-xs px-2 py-1 rounded hover:bg-blue-50 flex items-center gap-1"
                style={{ color: "#0088cc", border: "1px solid #b3e0f5" }}
              >
                <Link2 size={11} /> Связи
              </button>
              <button
                onClick={async () => {
                  await fetch("/api/telegram/mark-unread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peer: selectedPeer }) });
                  loadDialogs(true);
                }}
                className="text-xs px-2 py-1 rounded hover:bg-blue-50"
                style={{ color: "#0088cc", border: "1px solid #b3e0f5" }}
              >
                Не прочитано
              </button>
            </div>

            {/* Chat component */}
            <div className="flex-1 min-h-0">
              <TelegramChat peer={selectedPeer} compact={false} readOnly={selected!.isChannel} phone={selected!.phone || undefined} senderName={currentUserName} />
            </div>
          </>
        )}
        </div>
        {linkedOpen && selected && (
          <div style={{ width: 320, borderLeft: "1px solid #e4e4e4" }}>
            <LinkedEntitiesPanel
              telegramId={selected.id}
              telegramUsername={selected.username || undefined}
              phone={selected.phone || undefined}
              displayName={selected.name}
              channel="telegram"
              onClose={() => setLinkedOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

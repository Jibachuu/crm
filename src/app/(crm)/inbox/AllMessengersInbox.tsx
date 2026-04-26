"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Search, MessageSquare, UserPlus, Link2 } from "lucide-react";
import TelegramChat from "@/components/ui/TelegramChat";
import MaxChat from "@/components/ui/MaxChat";
import LinkedEntitiesPanel from "@/components/ui/LinkedEntitiesPanel";
import { createClient } from "@/lib/supabase/client";

interface UnifiedDialog {
  id: string;
  name: string;
  channel: "telegram" | "maks";
  lastMessage: string;
  lastTime: number;
  unreadCount?: number;
  unread?: boolean;
  peer?: string;
  chatId?: string;
  avatar?: string;
  phone?: string;
  username?: string;
}

const CHANNEL_COLORS: Record<string, { bg: string; badge: string; label: string }> = {
  telegram: { bg: "#0088cc", badge: "#0088cc", label: "TG" },
  maks: { bg: "#0067a5", badge: "#0067a5", label: "M" },
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function formatTime(ts: number) {
  if (!ts) return "";
  const d = new Date(ts > 9999999999 ? ts : ts * 1000);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + time;
}

export default function AllMessengersInbox() {
  const [dialogs, setDialogs] = useState<UnifiedDialog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UnifiedDialog | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [addingContact, setAddingContact] = useState<string | false>(false);
  const [addError, setAddError] = useState("");
  const [linkedOpen, setLinkedOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function addContact(channel: "telegram" | "maks") {
    const raw = newPhone.trim();
    if (!raw) return;
    setAddingContact(channel);
    setAddError("");

    // Detect input type: @username vs phone
    const isUsername = raw.startsWith("@") || /^[a-zA-Z][a-zA-Z0-9_]{3,}$/.test(raw);
    const phone = isUsername ? "" : raw;
    const username = isUsername ? raw.replace(/^@/, "") : "";

    try {
      // Telegram supports both phone and username; MAX only phone
      const tgBody = username
        ? { username }
        : { phone };
      const [tgRes, maxRes] = await Promise.all([
        fetch("/api/telegram/add-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tgBody),
        }).then((r) => r.json()).catch(() => ({ ok: false })),
        phone ? fetch("/api/max", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add_contact", phone, firstName: "", lastName: "" }),
        }).then((r) => r.json()).catch(() => ({ ok: false })) : Promise.resolve({ ok: false }),
      ]);

      const tgUser = tgRes?.ok && tgRes.user ? tgRes.user : null;
      const maxContact = maxRes?.ok && maxRes.contact ? maxRes.contact : null;
      const maxId = maxContact ? String(maxRes.chatId || maxContact.id) : null;

      // Pick best name: prefer Telegram (real names), fallback to MAX
      const tgName = tgUser ? `${tgUser.firstName || ""} ${tgUser.lastName || ""}`.trim() || tgUser.username || "" : "";
      const maxName = maxContact?.name || "";
      const bestName = (tgName && !/^\d+$/.test(tgName) ? tgName : null) || (maxName && !/^\d+$/.test(maxName) ? maxName : null) || "";

      // Save to CRM with whatever we got
      // Use phone from any source: user input → telegram entity → max contact
      const finalPhone = phone || tgUser?.phone || null;

      if (tgUser || maxContact) {
        try {
          await fetch("/api/contacts/upsert-by-phone", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: finalPhone || undefined,
              full_name: bestName,
              telegram_id: tgUser?.id ? String(tgUser.id) : undefined,
              telegram_username: tgUser?.username || username || undefined,
              maks_id: maxId || undefined,
            }),
          });
        } catch { /* skip */ }

        setShowNewChat(false);
        setNewPhone("");

        // Open the chat user clicked on, fall back to whichever we found
        if (channel === "telegram" && tgUser) {
          setSelected({
            id: `tg_${tgUser.id}`,
            name: bestName || finalPhone || username,
            channel: "telegram",
            lastMessage: "",
            lastTime: Date.now() / 1000,
            peer: tgUser.username || tgUser.phone || tgUser.id,
            phone: finalPhone || undefined,
            username: tgUser.username || username || undefined,
          });
        } else if (channel === "maks" && maxContact) {
          setSelected({
            id: `max_${maxId}`,
            name: bestName || finalPhone || maxId!,
            channel: "maks",
            lastMessage: "",
            lastTime: Date.now() / 1000,
            chatId: maxId!,
            phone: finalPhone || undefined,
          });
        } else if (tgUser) {
          setSelected({
            id: `tg_${tgUser.id}`,
            name: bestName || finalPhone || username,
            channel: "telegram",
            lastMessage: "",
            lastTime: Date.now() / 1000,
            peer: tgUser.username || tgUser.phone || tgUser.id,
            phone: finalPhone || undefined,
            username: tgUser.username || username || undefined,
          });
        } else if (maxContact) {
          setSelected({
            id: `max_${maxId}`,
            name: bestName || finalPhone || maxId!,
            channel: "maks",
            lastMessage: "",
            lastTime: Date.now() / 1000,
            chatId: maxId!,
            phone: finalPhone || undefined,
          });
        }
        refresh();
      } else {
        setAddError(
          username
            ? (tgRes?.error || "Username не найден в Telegram")
            : (channel === "telegram"
                ? (tgRes?.error || "Контакт не найден ни в Telegram, ни в МАКС")
                : (maxRes?.error || "Контакт не найден ни в МАКС, ни в Telegram"))
        );
      }
    } catch (e) {
      setAddError(String(e));
    }
    setAddingContact(false);
  }

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    const all: UnifiedDialog[] = [];

    // Per-channel timeout — TG/MAX proxy hangs sometimes; without this the
    // whole inbox spins forever and the page looks broken.
    const TIMEOUT_MS = 15000;
    function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
      return Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
      ]);
    }

    // Load Telegram dialogs
    try {
      const res = await withTimeout(fetch("/api/telegram/dialogs"));
      if (res.ok) {
        const data = await res.json();
        for (const d of data.dialogs ?? []) {
          all.push({
            id: `tg_${d.id}`,
            name: d.name || d.username || String(d.id),
            channel: "telegram",
            lastMessage: d.lastMessage || "",
            lastTime: d.lastDate || 0,
            unreadCount: d.unreadCount || 0,
            peer: d.username || d.phone || String(d.id),
            avatar: d.photoUrl || d.avatar || undefined,
            phone: d.phone || undefined,
            username: d.username || undefined,
          });
        }
      }
    } catch { /* skip */ }

    // Load MAX chats
    try {
      const res = await withTimeout(fetch("/api/max?action=chats"));
      if (res.ok) {
        const data = await res.json();
        for (const c of data.chats ?? []) {
          const chatId = String(c.chatId ?? c.id ?? "");
          if (!chatId || Number(chatId) < 0) continue; // skip groups
          all.push({
            id: `max_${chatId}`,
            name: c.title || chatId,
            channel: "maks",
            lastMessage: c.lastMessage?.text || "",
            lastTime: c.lastMessage?.time || 0,
            chatId,
            avatar: c.avatar || undefined,
            phone: c.phone ? String(c.phone) : undefined,
            username: c.username || undefined,
            unread: c.unread || false,
            unreadCount: c.unreadCount || 0,
          });
        }
      }
    } catch { /* skip */ }

    // Enrich names/avatars from CRM contacts + company names
    try {
      const supabase = createClient();
      const maksIds = all.filter((d) => d.channel === "maks" && d.chatId).map((d) => d.chatId!);
      const tgIds = all.filter((d) => d.channel === "telegram").map((d) => d.id.replace("tg_", ""));
      const tgUsernames = all.filter((d) => d.channel === "telegram" && d.username).map((d) => d.username!);

      // Also collect phone numbers for fallback matching
      const phones = all.filter((d) => d.phone).map((d) => d.phone!.replace(/\D/g, "").slice(-10)).filter((p) => p.length >= 7);

      // Fetch contacts matching any messenger identifier or phone
      const orFilters: string[] = [];
      if (maksIds.length) orFilters.push(`maks_id.in.(${maksIds.join(",")})`);
      if (tgIds.length) orFilters.push(`telegram_id.in.(${tgIds.join(",")})`);
      if (tgUsernames.length) orFilters.push(`telegram_username.in.(${tgUsernames.join(",")})`);
      // Add phone-based lookup for dialogs that have phone numbers
      for (const p of [...new Set(phones)].slice(0, 50)) {
        orFilters.push(`phone.ilike.%${p}`);
      }

      if (orFilters.length > 0) {
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, maks_id, telegram_id, telegram_username, full_name, avatar_url, phone, company_id")
          .or(orFilters.join(","));

        // Fetch company names for linked contacts
        const companyIds = [...new Set((contacts ?? []).map((c) => c.company_id).filter(Boolean))];
        const companyMap = new Map<string, string>();
        if (companyIds.length > 0) {
          const { data: companies } = await supabase
            .from("companies")
            .select("id, name")
            .in("id", companyIds);
          for (const co of companies ?? []) companyMap.set(co.id, co.name);
        }

        // Build lookup maps
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type ContactRow = any;
        const byMaksId = new Map<string, ContactRow>();
        const byTgId = new Map<string, ContactRow>();
        const byTgUsername = new Map<string, ContactRow>();
        const byPhone = new Map<string, ContactRow>();
        const byName = new Map<string, ContactRow>();
        for (const c of contacts ?? []) {
          if (c.maks_id) byMaksId.set(c.maks_id, c);
          if (c.telegram_id) byTgId.set(String(c.telegram_id), c);
          if (c.telegram_username) byTgUsername.set(c.telegram_username.toLowerCase(), c);
          if (c.phone) byPhone.set(c.phone.replace(/\D/g, "").slice(-10), c);
          if (c.full_name) byName.set(c.full_name.toLowerCase().trim(), c);
        }

        // Cache TG avatars → CRM contacts (background, fire-and-forget)
        const avatarUpdates: { id: string; avatar_url: string }[] = [];

        for (const d of all) {
          const phoneSuffix = d.phone ? d.phone.replace(/\D/g, "").slice(-10) : "";
          const contact = d.channel === "maks"
            ? (byMaksId.get(d.chatId!) || (phoneSuffix ? byPhone.get(phoneSuffix) : undefined) || (d.name ? byName.get(d.name.toLowerCase().trim()) : undefined))
            : (byTgId.get(d.id.replace("tg_", "")) || (d.username ? byTgUsername.get(d.username.toLowerCase()) : undefined) || (phoneSuffix ? byPhone.get(phoneSuffix) : undefined));
          if (!contact) {
            if (d.channel === "maks") console.log("[Inbox] Unmatched MAX chat:", d.chatId, d.name);
            continue;
          }

          // Use CRM entity name + company
          if (contact.full_name && !/^\d+$/.test(contact.full_name)) {
            const companyName = contact.company_id ? companyMap.get(contact.company_id) : undefined;
            d.name = companyName ? `${contact.full_name} · ${companyName}` : contact.full_name;
          }
          // For MAX: prefer CRM avatar over MAX avatar (MAX can return wrong avatars)
          if (d.channel === "maks" && contact.avatar_url) {
            d.avatar = contact.avatar_url;
          } else if (!d.avatar && contact.avatar_url) {
            d.avatar = contact.avatar_url;
          }
          if (!d.phone && contact.phone) d.phone = contact.phone;

          // If TG dialog has avatar but CRM contact doesn't, queue for caching
          if (d.channel === "telegram" && d.avatar && !contact.avatar_url) {
            avatarUpdates.push({ id: contact.id, avatar_url: d.avatar });
          }
        }

        // Fire-and-forget: cache TG avatars to CRM contacts
        if (avatarUpdates.length > 0) {
          for (const upd of avatarUpdates) {
            supabase.from("contacts").update({ avatar_url: upd.avatar_url }).eq("id", upd.id).then(() => {});
          }
        }
      }
    } catch { /* skip */ }

    // Normalize all timestamps to seconds so TG (seconds) and MAX (possibly ms) sort correctly
    for (const d of all) {
      if (d.lastTime > 9999999999) d.lastTime = Math.floor(d.lastTime / 1000);
    }

    // Sort by last message time, newest first
    all.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
    setDialogs(all);
    if (all.length === 0) {
      setLoadError("Не удалось загрузить чаты. Проверьте подключение или попробуйте обновить.");
    }
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  useEffect(() => { loadAll(); }, []);

  const filtered = dialogs.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase().replace(/^@/, "").trim();
    const cleanQ = q.replace(/\D/g, "");
    if (d.name.toLowerCase().includes(q)) return true;
    if (d.lastMessage.toLowerCase().includes(q)) return true;
    if (d.username && d.username.toLowerCase().includes(q)) return true;
    if (d.phone && cleanQ && d.phone.replace(/\D/g, "").includes(cleanQ)) return true;
    if (d.chatId && d.chatId.includes(q)) return true;
    return false;
  });

  return (
    <div className="flex h-full">
      {/* Dialog list */}
      <div className="flex flex-col" style={{ width: 350, borderRight: "1px solid #e4e4e4", background: "#fff" }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded focus:outline-none"
              style={{ border: "1px solid #e0e0e0" }} />
          </div>
          <button onClick={() => setShowNewChat(true)} className="p-1.5 rounded hover:bg-blue-50" title="Новый чат по номеру">
            <UserPlus size={13} style={{ color: "#0067a5" }} />
          </button>
          <button onClick={refresh} disabled={refreshing} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw size={13} style={{ color: "#888" }} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        {/* New chat by phone */}
        {showNewChat && (
          <div className="px-3 py-3" style={{ borderBottom: "1px solid #f0f0f0", background: "#f8f9fa" }}>
            <p className="text-xs font-medium mb-2" style={{ color: "#555" }}>Начать чат: номер телефона или @username</p>
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+7 999 123 45 67  или  @username"
              className="w-full text-sm px-3 py-1.5 rounded mb-2 focus:outline-none"
              style={{ border: "1px solid #d0d0d0" }} />
            <p className="text-[10px] mb-2" style={{ color: "#aaa" }}>МАКС работает только по номеру. Telegram — и то, и другое.</p>
            <div className="flex gap-2">
              <button onClick={() => addContact("telegram")} disabled={!!addingContact || !newPhone.trim()}
                className="flex-1 text-xs py-1.5 rounded font-medium disabled:opacity-40"
                style={{ background: "#0088cc", color: "#fff" }}>
                {addingContact === "telegram" ? "..." : "Telegram"}
              </button>
              <button onClick={() => addContact("maks")} disabled={!!addingContact || !newPhone.trim()}
                className="flex-1 text-xs py-1.5 rounded font-medium disabled:opacity-40"
                style={{ background: "#0067a5", color: "#fff" }}>
                {addingContact === "maks" ? "..." : "МАКС"}
              </button>
              <button onClick={() => { setShowNewChat(false); setNewPhone(""); }} className="text-xs px-2" style={{ color: "#888" }}>
                Отмена
              </button>
            </div>
            {addError && <p className="text-xs mt-1" style={{ color: "#e74c3c" }}>{addError}</p>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-xs text-center py-12" style={{ color: "#aaa" }}>Загрузка чатов...</p>}
          {!loading && loadError && (
            <div className="text-center py-12 px-4">
              <p className="text-xs mb-2" style={{ color: "#c62828" }}>{loadError}</p>
              <button onClick={refresh} className="text-xs underline" style={{ color: "#0067a5" }}>Попробовать снова</button>
            </div>
          )}
          {!loading && !loadError && filtered.length === 0 && (
            <p className="text-xs text-center py-12" style={{ color: "#aaa" }}>Нет диалогов</p>
          )}
          {filtered.map((d) => {
            const isSelected = selected?.id === d.id;
            const cfg = CHANNEL_COLORS[d.channel];
            return (
              <button key={d.id} onClick={() => setSelected(d)}
                className="w-full text-left px-3 py-2.5 transition-colors hover:bg-gray-50"
                style={{ borderBottom: "1px solid #f5f5f5", background: isSelected ? "#e8f4fd" : "transparent" }}>
                <div className="flex items-center gap-3">
                  {/* Avatar with channel badge */}
                  <div className="relative flex-shrink-0">
                    {d.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.avatar} alt={d.name} className="w-10 h-10 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: cfg.bg + "cc" }}>
                        {getInitials(d.name)}
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white border-2 border-white"
                      style={{ background: cfg.badge, fontSize: 7, fontWeight: 700 }}>
                      {cfg.label}
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm truncate" style={{ color: d.unread ? "#0067a5" : "#333", fontWeight: d.unread ? 700 : 500 }}>{d.name}</span>
                      <span className="text-xs flex-shrink-0 ml-2" style={{ color: d.unread ? "#0067a5" : "#aaa", fontWeight: d.unread ? 600 : 400 }}>{formatTime(d.lastTime)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs truncate" style={{ color: d.unread ? "#333" : "#888", fontWeight: d.unread ? 600 : 400 }}>{d.lastMessage || "..."}</p>
                      {d.unread && (
                        <span className="rounded-full flex-shrink-0 ml-1" style={{ background: cfg.badge, width: 8, height: 8 }} />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex min-w-0" style={{ background: "#f5f5f5" }}>
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <MessageSquare size={40} style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Выберите диалог</p>
          </div>
        ) : selected.channel === "telegram" && selected.peer ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-2" style={{ background: "#fff", borderBottom: "1px solid #e4e4e4" }}>
              <div className="w-3 h-3 rounded-full" style={{ background: "#0088cc" }} />
              <span className="text-sm font-medium" style={{ color: "#333" }}>{selected.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#0088cc20", color: "#0088cc" }}>Telegram</span>
              <div className="flex-1" />
              <button
                onClick={() => setLinkedOpen(!linkedOpen)}
                className="text-xs px-2 py-1 rounded hover:bg-blue-50 flex items-center gap-1"
                style={{ color: "#0088cc", border: "1px solid #b3e0f5" }}
                title="Связанные данные"
              >
                <Link2 size={11} /> Связи
              </button>
              <button
                onClick={async () => {
                  await fetch("/api/telegram/mark-unread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peer: selected.peer }) });
                  refresh();
                }}
                className="text-xs px-2 py-1 rounded hover:bg-blue-50"
                style={{ color: "#0088cc", border: "1px solid #b3e0f5" }}
                title="Пометить как непрочитанное"
              >
                Не прочитано
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <TelegramChat peer={selected.peer} compact phone={selected.phone} />
            </div>
          </div>
        ) : selected.channel === "maks" && selected.chatId ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-2" style={{ background: "#fff", borderBottom: "1px solid #e4e4e4" }}>
              <div className="w-3 h-3 rounded-full" style={{ background: "#0067a5" }} />
              <span className="text-sm font-medium" style={{ color: "#333" }}>{selected.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#0067a520", color: "#0067a5" }}>МАКС</span>
              <div className="flex-1" />
              <button
                onClick={() => setLinkedOpen(!linkedOpen)}
                className="text-xs px-2 py-1 rounded hover:bg-blue-50 flex items-center gap-1"
                style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}
                title="Связанные данные"
              >
                <Link2 size={11} /> Связи
              </button>
              <button
                onClick={async () => {
                  await fetch("/api/max", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_unread", chat_id: selected.chatId }) });
                  refresh();
                }}
                className="text-xs px-2 py-1 rounded hover:bg-blue-50"
                style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}
                title="Пометить как непрочитанное"
              >
                Не прочитано
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <MaxChat chatId={selected.chatId} compact phone={selected.phone} />
            </div>
          </div>
        ) : null}
      </div>
      {linkedOpen && selected && (
        <div style={{ width: 320, borderLeft: "1px solid #e4e4e4" }}>
          <LinkedEntitiesPanel
            phone={selected.phone}
            telegramId={selected.channel === "telegram" ? selected.id.replace("tg_", "") : undefined}
            telegramUsername={selected.channel === "telegram" ? (selected.username || selected.peer) : undefined}
            maksId={selected.channel === "maks" ? selected.chatId : undefined}
            displayName={selected.name}
            channel={selected.channel}
            onClose={() => setLinkedOpen(false)}
          />
        </div>
      )}
      </div>
    </div>
  );
}

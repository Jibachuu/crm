"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Search, UserPlus, Link2, MoreVertical, BellOff } from "lucide-react";
import TelegramChat from "@/components/ui/TelegramChat";
import MaxChat from "@/components/ui/MaxChat";
import LinkedEntitiesPanel from "@/components/ui/LinkedEntitiesPanel";
import ChatListItem from "@/components/inbox/ChatListItem";
import ChatListSkeleton from "@/components/inbox/ChatListSkeleton";
import EmptyChat from "@/components/inbox/EmptyChat";
import ChatHeader from "@/components/inbox/ChatHeader";
import QuickSearchOverlay from "@/components/inbox/QuickSearchOverlay";
import { useInboxNotifications, useNewMessageDetector } from "@/components/inbox/useInboxNotifications";
import { useTabBadge } from "@/components/inbox/useTabBadge";
import InboxSettings from "@/components/inbox/InboxSettings";
import { useInboxStream } from "@/components/inbox/useInboxStream";
import ConnectionBanner from "@/components/inbox/ConnectionBanner";
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
  // R2: Ctrl+K быстрый поиск
  const [quickOpen, setQuickOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickOpen(true);
      }
      // R5: Alt+↑ / Alt+↓ — прыжки по непрочитанным
      else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        setSelected((current: typeof selected) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const unread = (dialogs as any[]).filter((d) => d.unread || (d.unreadCount ?? 0) > 0);
          if (unread.length === 0) return current;
          const idx = current ? unread.findIndex((d) => d.id === current.id) : -1;
          const nextIdx = e.key === "ArrowDown"
            ? (idx + 1) % unread.length
            : (idx - 1 + unread.length) % unread.length;
          return unread[nextIdx];
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogs]);

  // R3b: SSE поток обновлений. При delta мержим lastMessage/unread/lastTime
  // в существующие диалоги. Enrichment (CRM-имена, аватарки) сохраняется —
  // stream отдаёт сырой набор, а loadAll подтянет обогащение при первом
  // холодном рендере и по клику Refresh.
  const { state: streamState } = useInboxStream({
    enabled: true,
    onFullSync: (fresh: UnifiedDialog[]) => {
      setDialogs((prev: UnifiedDialog[]) => {
        const byId = new Map(prev.map((d) => [d.id, d]));
        const next: UnifiedDialog[] = [];
        for (const f of fresh) {
          const old = byId.get(f.id);
          if (old) next.push({ ...old, lastMessage: f.lastMessage, lastTime: f.lastTime, unread: f.unread, unreadCount: f.unreadCount });
          else next.push(f);
        }
        return next.sort((a, b) => (b.lastTime ?? 0) - (a.lastTime ?? 0));
      });
    },
    onDelta: (changed: UnifiedDialog[], removed: string[]) => {
      if (changed.length === 0 && removed.length === 0) return;
      setDialogs((prev: UnifiedDialog[]) => {
        const removedSet = new Set(removed);
        const changedById = new Map(changed.map((c) => [c.id, c]));
        const next: UnifiedDialog[] = prev
          .filter((d) => !removedSet.has(d.id))
          .map((d) => {
            const c = changedById.get(d.id);
            if (!c) return d;
            changedById.delete(d.id);
            return { ...d, lastMessage: c.lastMessage, lastTime: c.lastTime, unread: c.unread, unreadCount: c.unreadCount };
          });
        for (const [, c] of changedById) next.push(c);
        return next.sort((a, b) => (b.lastTime ?? 0) - (a.lastTime ?? 0));
      });
    },
  });

  // R3a: пуш + звук + счётчик на favicon/title
  const notif = useInboxNotifications();
  // Считаем сумму непрочитанных по всем чатам. unreadCount может быть
  // undefined — трактуем «есть-непрочитанные-но-без-числа» как 1.
  const totalUnread = dialogs.reduce((sum, d) => sum + (d.unreadCount ?? (d.unread ? 1 : 0)), 0);
  useTabBadge(totalUnread, "Inbox");

  // Реагируем на новые входящие: играем звук + пушим уведомление,
  // если этот чат сейчас не открыт и вкладка не в фокусе.
  useNewMessageDetector(dialogs, (d) => {
    // Только новые ВХОДЯЩИЕ, не свои отправленные
    const isIncomingUnread = (d.unread === true) || ((d.unreadCount ?? 0) > 0);
    if (!isIncomingUnread) return;
    // Если чат сейчас открыт — не пикаем
    if (selected?.id === d.id) return;
    notif.sound();
    notif.notify(d.name || "Новое сообщение", d.lastMessage || "…", d.id);
  });

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
    // whole inbox spins forever and the page looks broken. 35s gives the
    // tg-proxy room to serve from its in-memory cache after a reconnect
    // (RU ISP often throttles Telegram for tens of seconds at a stretch).
    const TIMEOUT_MS = 35000;
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
    <div className="inbox-scope inbox-shell" style={{ flexDirection: "column" }}>
      <ConnectionBanner state={streamState} />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* — Sidebar — */}
      <aside className="inbox-sidebar">
        <div className="inbox-sidebar-header">
          <div className="inbox-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск"
              autoComplete="off"
            />
          </div>
          <button onClick={() => setShowNewChat(true)} className="inbox-sidebar-btn" title="Новый чат по номеру или @username">
            <UserPlus size={17} />
          </button>
          <button onClick={refresh} disabled={refreshing} className="inbox-sidebar-btn" title="Обновить">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
          <InboxSettings
            soundEnabled={notif.soundEnabled}
            onSoundToggle={notif.setSoundEnabled}
            notifEnabled={notif.notifEnabled}
            onNotifToggle={notif.setNotifEnabled}
            notifPerm={notif.notifPerm}
            onRequestNotif={notif.requestNotif}
          />
        </div>

        {showNewChat && (
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--tg-border)", background: "var(--tg-bg-panel)" }}>
            <p style={{ fontSize: 12, marginBottom: 8, color: "var(--tg-text-secondary)" }}>Начать чат — номер или @username</p>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+7 999 123 45 67  или  @username"
              style={{ width: "100%", fontSize: 14, marginBottom: 8 }}
            />
            <p style={{ fontSize: 10.5, marginBottom: 10, color: "var(--tg-text-tertiary)" }}>МАКС — только по номеру. Telegram — и то, и другое.</p>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => addContact("telegram")}
                disabled={!!addingContact || !newPhone.trim()}
                style={{
                  flex: 1, fontSize: 13, padding: "8px 0", borderRadius: 8, border: "none",
                  background: addingContact ? "var(--tg-bg-input)" : "#28a5f5", color: "#fff",
                  cursor: !!addingContact || !newPhone.trim() ? "default" : "pointer",
                  opacity: !!addingContact || !newPhone.trim() ? 0.5 : 1,
                }}
              >
                {addingContact === "telegram" ? "..." : "Telegram"}
              </button>
              <button
                onClick={() => addContact("maks")}
                disabled={!!addingContact || !newPhone.trim()}
                style={{
                  flex: 1, fontSize: 13, padding: "8px 0", borderRadius: 8, border: "none",
                  background: addingContact ? "var(--tg-bg-input)" : "#4b8fd1", color: "#fff",
                  cursor: !!addingContact || !newPhone.trim() ? "default" : "pointer",
                  opacity: !!addingContact || !newPhone.trim() ? 0.5 : 1,
                }}
              >
                {addingContact === "maks" ? "..." : "МАКС"}
              </button>
              <button
                onClick={() => { setShowNewChat(false); setNewPhone(""); }}
                style={{ fontSize: 13, padding: "8px 12px", background: "transparent", color: "var(--tg-text-secondary)", border: "none", cursor: "pointer" }}
              >
                Отмена
              </button>
            </div>
            {addError && <p style={{ fontSize: 12, marginTop: 6, color: "#e57373" }}>{addError}</p>}
          </div>
        )}

        <div className="inbox-chatlist">
          {loading && <ChatListSkeleton />}
          {!loading && loadError && (
            <div style={{ textAlign: "center", padding: "48px 16px" }}>
              <p style={{ fontSize: 13, marginBottom: 8, color: "#e57373" }}>{loadError}</p>
              <button onClick={refresh} style={{ fontSize: 12, background: "transparent", border: "none", color: "var(--tg-accent)", cursor: "pointer", textDecoration: "underline" }}>
                Попробовать снова
              </button>
            </div>
          )}
          {!loading && !loadError && filtered.length === 0 && (
            <p style={{ fontSize: 13, textAlign: "center", padding: "48px 16px", color: "var(--tg-text-secondary)" }}>Нет диалогов</p>
          )}
          {filtered.map((d) => (
            <ChatListItem
              key={d.id}
              name={d.name}
              preview={d.lastMessage || "…"}
              time={formatTime(d.lastTime)}
              unreadCount={d.unreadCount}
              isUnread={d.unread || (d.unreadCount ?? 0) > 0}
              isSelected={selected?.id === d.id}
              avatarUrl={d.avatar}
              channel={d.channel}
              onClick={() => setSelected(d)}
            />
          ))}
        </div>
      </aside>

      {/* — Main chat area — */}
      <div className="inbox-main">
        {!selected ? (
          <EmptyChat />
        ) : selected.channel === "telegram" && selected.peer ? (
          <>
            <ChatHeader
              name={selected.name}
              avatarUrl={selected.avatar}
              channel="telegram"
              subtitle="Telegram"
              actions={
                <>
                  <button
                    onClick={() => setLinkedOpen(!linkedOpen)}
                    className="inbox-sidebar-btn"
                    title="Связанные данные"
                  >
                    <Link2 size={16} />
                  </button>
                  <button
                    onClick={async () => {
                      await fetch("/api/telegram/mark-unread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peer: selected.peer }) });
                      refresh();
                    }}
                    className="inbox-sidebar-btn"
                    title="Пометить как непрочитанное"
                  >
                    <BellOff size={16} />
                  </button>
                  <button className="inbox-sidebar-btn" title="Меню"><MoreVertical size={16} /></button>
                </>
              }
            />
            <div className="inbox-chat-area">
              <TelegramChat peer={selected.peer} compact phone={selected.phone} />
            </div>
          </>
        ) : selected.channel === "maks" && selected.chatId ? (
          <>
            <ChatHeader
              name={selected.name}
              avatarUrl={selected.avatar}
              channel="maks"
              subtitle="МАКС"
              actions={
                <>
                  <button
                    onClick={() => setLinkedOpen(!linkedOpen)}
                    className="inbox-sidebar-btn"
                    title="Связанные данные"
                  >
                    <Link2 size={16} />
                  </button>
                  <button
                    onClick={async () => {
                      await fetch("/api/max", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_unread", chat_id: selected.chatId }) });
                      refresh();
                    }}
                    className="inbox-sidebar-btn"
                    title="Пометить как непрочитанное"
                  >
                    <BellOff size={16} />
                  </button>
                  <button className="inbox-sidebar-btn" title="Меню"><MoreVertical size={16} /></button>
                </>
              }
            />
            <div className="inbox-chat-area">
              <MaxChat chatId={selected.chatId} compact phone={selected.phone} />
            </div>
          </>
        ) : null}
      </div>

      {/* — Right panel — */}
      {linkedOpen && selected && (
        <aside className="inbox-rightpanel">
          <LinkedEntitiesPanel
            phone={selected.phone}
            telegramId={selected.channel === "telegram" ? selected.id.replace("tg_", "") : undefined}
            telegramUsername={selected.channel === "telegram" ? (selected.username || selected.peer) : undefined}
            maksId={selected.channel === "maks" ? selected.chatId : undefined}
            displayName={selected.name}
            channel={selected.channel}
            onClose={() => setLinkedOpen(false)}
          />
        </aside>
      )}
      </div>

      {quickOpen && (
        <QuickSearchOverlay
          dialogs={dialogs}
          formatTime={formatTime}
          onPick={(d) => setSelected(d)}
          onClose={() => setQuickOpen(false)}
        />
      )}
    </div>
  );
}

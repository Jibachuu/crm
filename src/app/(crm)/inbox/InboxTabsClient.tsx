"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Mail, Send, CircleDot, MessagesSquare } from "lucide-react";
import InboxClient from "./InboxClient";
import EmailInbox from "./EmailInbox";
import CampaignsInbox from "./CampaignsInbox";
import MaxInbox from "./MaxInbox";
import AllMessengersInbox from "./AllMessengersInbox";

const TABS = [
  { id: "all", label: "Все чаты", icon: MessagesSquare },
  { id: "telegram", label: "Telegram", icon: MessageSquare },
  { id: "maks", label: "МАКС", icon: CircleDot },
  { id: "email", label: "Почта", icon: Mail },
  { id: "campaigns", label: "Рассылки", icon: Send },
] as const;

type TabId = typeof TABS[number]["id"];

export default function InboxTabsClient() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "all";
  const [tab, setTab] = useState<TabId>(initialTab);

  // Sync tab with URL param changes
  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) setTab(tabParam as TabId);
  }, [tabParam]);

  return (
    <div className="inbox-scope" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--tg-bg)" }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--tg-border)", background: "var(--tg-bg-panel)", flexShrink: 0 }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: 500,
                color: active ? "var(--tg-accent)" : "var(--tg-text-secondary)",
                background: "transparent",
                border: "none",
                borderBottom: active ? "2px solid var(--tg-accent)" : "2px solid transparent",
                marginBottom: -1,
                cursor: "pointer",
                transition: "color 0.12s",
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "all" && <AllMessengersInbox />}
        {tab === "telegram" && <InboxClient />}
        {tab === "maks" && <MaxInbox />}
        {tab === "email" && <EmailInbox />}
        {tab === "campaigns" && <CampaignsInbox />}
      </div>
    </div>
  );
}

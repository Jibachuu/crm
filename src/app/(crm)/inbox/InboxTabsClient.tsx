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
    <div className="flex flex-col h-full">
      <div className="flex" style={{ borderBottom: "1px solid #e4e4e4", background: "#fff" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors"
              style={{
                borderBottom: tab === t.id ? "2px solid #0067a5" : "2px solid transparent",
                color: tab === t.id ? "#0067a5" : "#888",
                marginBottom: -1,
              }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "all" && <AllMessengersInbox />}
        {tab === "telegram" && <InboxClient />}
        {tab === "maks" && <MaxInbox />}
        {tab === "email" && <EmailInbox />}
        {tab === "campaigns" && <CampaignsInbox />}
      </div>
    </div>
  );
}

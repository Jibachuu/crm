"use client";

import { useState } from "react";
import { MessageSquare, Mail, Send, CircleDot } from "lucide-react";
import InboxClient from "./InboxClient";
import EmailInbox from "./EmailInbox";
import CampaignsInbox from "./CampaignsInbox";
import MaxInbox from "./MaxInbox";

const TABS = [
  { id: "telegram", label: "Telegram", icon: MessageSquare },
  { id: "maks", label: "МАКС", icon: CircleDot },
  { id: "email", label: "Почта", icon: Mail },
  { id: "campaigns", label: "Рассылки", icon: Send },
] as const;

export default function InboxTabsClient() {
  const [tab, setTab] = useState<"telegram" | "maks" | "email" | "campaigns">("telegram");

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
        {tab === "telegram" && <InboxClient />}
        {tab === "maks" && <MaxInbox />}
        {tab === "email" && <EmailInbox />}
        {tab === "campaigns" && <CampaignsInbox />}
      </div>
    </div>
  );
}

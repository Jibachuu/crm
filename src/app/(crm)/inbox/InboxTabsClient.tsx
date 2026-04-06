"use client";

import { useState } from "react";
import { MessageSquare, Mail } from "lucide-react";
import InboxClient from "./InboxClient";
import EmailInbox from "./EmailInbox";

export default function InboxTabsClient() {
  const [tab, setTab] = useState<"telegram" | "email">("telegram");

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: "1px solid #e4e4e4", background: "#fff" }}>
        <button
          onClick={() => setTab("telegram")}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors"
          style={{
            borderBottom: tab === "telegram" ? "2px solid #0067a5" : "2px solid transparent",
            color: tab === "telegram" ? "#0067a5" : "#888",
            marginBottom: -1,
          }}
        >
          <MessageSquare size={14} /> Telegram
        </button>
        <button
          onClick={() => setTab("email")}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors"
          style={{
            borderBottom: tab === "email" ? "2px solid #0067a5" : "2px solid transparent",
            color: tab === "email" ? "#0067a5" : "#888",
            marginBottom: -1,
          }}
        >
          <Mail size={14} /> Почта
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === "telegram" && <InboxClient />}
        {tab === "email" && <EmailInbox />}
      </div>
    </div>
  );
}

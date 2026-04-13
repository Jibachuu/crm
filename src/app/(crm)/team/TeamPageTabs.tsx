"use client";

import { useState } from "react";
import { MessageSquare, Clock } from "lucide-react";
import TeamClient from "./TeamClient";
import TimeSchedule from "./TimeSchedule";

interface User {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  is_active: boolean;
  avatar_url?: string;
  last_seen_at?: string;
}

export default function TeamPageTabs({ currentUserId, users, userRole }: { currentUserId: string; users: User[]; userRole: string }) {
  const [tab, setTab] = useState<"chat" | "schedule">("chat");
  const isAdmin = userRole === "admin" || userRole === "supervisor";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tabs */}
      <div className="flex px-6 pt-2" style={{ borderBottom: "1px solid #e4e4e4", background: "#fff" }}>
        <button
          onClick={() => setTab("chat")}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium"
          style={{
            borderBottom: tab === "chat" ? "2px solid #0067a5" : "2px solid transparent",
            color: tab === "chat" ? "#0067a5" : "#888",
            marginBottom: -1,
          }}
        >
          <MessageSquare size={14} /> Чат
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab("schedule")}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium"
            style={{
              borderBottom: tab === "schedule" ? "2px solid #0067a5" : "2px solid transparent",
              color: tab === "schedule" ? "#0067a5" : "#888",
              marginBottom: -1,
            }}
          >
            <Clock size={14} /> Расписание
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {tab === "chat" && (
          <TeamClient
            currentUserId={currentUserId}
            users={users.filter((u) => u.id !== currentUserId)}
          />
        )}
        {tab === "schedule" && isAdmin && (
          <TimeSchedule users={users} />
        )}
      </div>
    </div>
  );
}

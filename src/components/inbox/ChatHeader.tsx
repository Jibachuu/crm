"use client";

import { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

type Channel = "telegram" | "maks" | "email";

const CHANNEL_BG: Record<Channel, string> = {
  telegram: "#28a5f5",
  maks: "#4b8fd1",
  email: "#7d8b99",
};
const CHANNEL_LABEL: Record<Channel, string> = { telegram: "Telegram", maks: "МАКС", email: "Email" };

function getInitials(name: string) {
  return name.split(/[\s·]/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

interface Props {
  name: string;
  subtitle?: string;
  online?: boolean;
  typing?: boolean;
  avatarUrl?: string | null;
  channel: Channel;
  actions?: ReactNode;
  onNameClick?: () => void;
  onBack?: () => void;
}

export default function ChatHeader({ name, subtitle, online, typing, avatarUrl, channel, actions, onNameClick, onBack }: Props) {
  return (
    <div className="inbox-chat-header">
      {onBack && (
        <button className="inbox-sidebar-btn inbox-back-btn" onClick={onBack} title="Назад к чатам" style={{ flexShrink: 0 }}>
          <ChevronLeft size={20} />
        </button>
      )}
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="inbox-chat-header-avatar" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="inbox-chat-header-avatar" style={{ background: `linear-gradient(135deg, ${CHANNEL_BG[channel]}dd, ${CHANNEL_BG[channel]}88)` }}>{getInitials(name)}</div>
      )}
      <div className="inbox-chat-header-body">
        <div className="inbox-chat-header-name" onClick={onNameClick} style={onNameClick ? { cursor: "pointer" } : undefined}>
          {name}
        </div>
        <div className={`inbox-chat-header-sub ${online ? "is-online" : ""}`}>
          {typing ? <><i>печатает…</i></> : (subtitle ?? CHANNEL_LABEL[channel])}
        </div>
      </div>
      {actions && <div className="inbox-chat-header-actions">{actions}</div>}
    </div>
  );
}

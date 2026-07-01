"use client";

type Channel = "telegram" | "maks" | "email";

interface Props {
  name: string;
  preview: string;
  time: string;
  unreadCount?: number;
  isUnread?: boolean;
  isSelected: boolean;
  avatarUrl?: string | null;
  channel: Channel;
  onClick: () => void;
  online?: boolean;
  isDraft?: boolean;
  isTyping?: boolean;
  isMuted?: boolean;
}

const CHANNEL_LABEL: Record<Channel, string> = { telegram: "TG", maks: "M", email: "@" };
const CHANNEL_BG: Record<Channel, string> = {
  telegram: "#28a5f5",
  maks: "#4b8fd1",
  email: "#7d8b99",
};

function getInitials(name: string) {
  return name
    .split(/[\s·]/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

// Один элемент в списке чатов слева. Точная TG-Web-раскладка:
// аватар с бейджем канала снизу-справа, справа — имя + время,
// снизу — превью + бейдж непрочитанных.
export default function ChatListItem({
  name, preview, time, unreadCount, isUnread, isSelected,
  avatarUrl, channel, onClick, online, isDraft, isTyping, isMuted,
}: Props) {
  return (
    <button
      onClick={onClick}
      className={`inbox-chat-item ${isSelected ? "is-selected" : ""} ${isUnread ? "is-unread" : ""}`}
    >
      <div className="inbox-chat-avatar-wrap">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={name}
            className="inbox-chat-avatar"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="inbox-chat-avatar">{getInitials(name)}</div>
        )}
        <div className="inbox-chat-channel-badge" style={{ background: CHANNEL_BG[channel] }}>
          {CHANNEL_LABEL[channel]}
        </div>
        {online && (
          <div style={{
            position: "absolute",
            bottom: -1,
            left: -1,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "var(--tg-status-online)",
            border: "2px solid var(--tg-bg-panel)",
          }} />
        )}
      </div>

      <div className="inbox-chat-body">
        <div className="inbox-chat-toprow">
          <span className="inbox-chat-name">{name}</span>
          <span className="inbox-chat-time">{time}</span>
        </div>
        <div className="inbox-chat-bottomrow">
          <span className="inbox-chat-preview">
            {isDraft && <b style={{ color: "#e74c3c" }}>Черновик: </b>}
            {isTyping ? <i style={{ color: "var(--tg-accent)" }}>печатает...</i> : preview}
          </span>
          {unreadCount && unreadCount > 0 ? (
            <span className={`inbox-chat-unread ${isMuted ? "" : ""}`} style={isMuted ? { background: "var(--tg-badge-muted)" } : undefined}>
              {unreadCount > 999 ? "999+" : unreadCount}
            </span>
          ) : isUnread ? (
            <span className="inbox-chat-unread is-dot" />
          ) : null}
        </div>
      </div>
    </button>
  );
}

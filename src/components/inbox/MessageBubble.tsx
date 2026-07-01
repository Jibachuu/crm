"use client";

import { ReactNode } from "react";
import { Check, CheckCheck } from "lucide-react";

interface Props {
  own: boolean;
  text?: string | ReactNode;
  media?: ReactNode;
  timeLabel: string;
  status?: "sending" | "sent" | "read" | null;
  hasTail?: boolean;
  senderName?: string | null;
  reply?: { name: string; text: string; onClick?: () => void } | null;
  forwarded?: string | null;
  reactions?: { emoji: string; count: number }[] | null;
  edited?: boolean;
  highlighted?: boolean;
  className?: string;
}

// Универсальный пузырь для инбокса — используется и в TG, и в MAX,
// и в будущем в email-переписке. Логика render-only. Всё что связано
// с меню действий/reactions живёт в родителях, но UI дают через
// проп `reactions`.
export default function MessageBubble({
  own, text, media, timeLabel, status = null, hasTail = false,
  senderName = null, reply = null, forwarded = null, reactions = null,
  edited = false, highlighted = false, className,
}: Props) {
  const isMedia = !!media && !text;
  return (
    <div className={`inbox-msg-row ${own ? "is-own" : ""} ${highlighted ? "is-highlight" : ""}`}>
      <div className={`inbox-msg-bubble ${hasTail ? "has-tail" : ""} ${isMedia ? "is-media" : ""} ${className ?? ""}`}>
        {senderName && !own && <div className="inbox-msg-sender">{senderName}</div>}

        {forwarded && (
          <div className="inbox-msg-forwarded">Переслано от {forwarded}</div>
        )}

        {reply && (
          <div className="inbox-msg-reply" onClick={reply.onClick} role={reply.onClick ? "button" : undefined}>
            <div className="inbox-msg-reply-name">{reply.name}</div>
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{reply.text}</div>
          </div>
        )}

        {media && <div className={text ? "" : ""}>{media}</div>}

        {text && (
          <div style={{ whiteSpace: "pre-wrap", padding: isMedia ? "6px 6px 0 6px" : 0 }}>
            {text}
            <span className="inbox-msg-meta">
              {edited && <span style={{ marginRight: 2 }}>изм.</span>}
              {timeLabel}
              {own && status === "sending" && <Check size={12} className="inbox-msg-tick" style={{ opacity: 0.5 }} />}
              {own && status === "sent" && <Check size={12} className="inbox-msg-tick" />}
              {own && status === "read" && <CheckCheck size={12} className="inbox-msg-tick is-read" />}
            </span>
          </div>
        )}

        {!text && media && (
          <div className="inbox-msg-meta" style={{ padding: "4px 6px 2px 6px" }}>
            {edited && <span style={{ marginRight: 2 }}>изм.</span>}
            {timeLabel}
            {own && status === "sending" && <Check size={12} className="inbox-msg-tick" style={{ opacity: 0.5 }} />}
            {own && status === "sent" && <Check size={12} className="inbox-msg-tick" />}
            {own && status === "read" && <CheckCheck size={12} className="inbox-msg-tick is-read" />}
          </div>
        )}

        {reactions && reactions.length > 0 && (
          <div className="inbox-msg-reactions">
            {reactions.map((r, i) => (
              <span key={i} className="inbox-msg-reaction">
                <span>{r.emoji}</span>
                {r.count > 1 && <span>{r.count}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

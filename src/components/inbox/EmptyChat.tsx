import { MessageSquare } from "lucide-react";

export default function EmptyChat() {
  return (
    <div className="inbox-empty">
      <MessageSquare size={44} style={{ opacity: 0.35 }} />
      <div className="inbox-empty-badge">Выберите чат чтобы начать переписку</div>
    </div>
  );
}

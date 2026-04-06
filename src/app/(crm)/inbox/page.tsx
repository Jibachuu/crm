import Header from "@/components/layout/Header";
import InboxClient from "./InboxClient";

export default function InboxPage() {
  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      <Header title="Inbox" />
      {/* Full-height chat layout */}
      <div className="flex-1 min-h-0">
        <InboxClient />
      </div>
    </div>
  );
}

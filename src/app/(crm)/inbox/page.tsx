import Header from "@/components/layout/Header";
import InboxTabsClient from "./InboxTabsClient";

export default function InboxPage() {
  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      <Header title="Inbox" />
      <div className="flex-1 min-h-0">
        <InboxTabsClient />
      </div>
    </div>
  );
}

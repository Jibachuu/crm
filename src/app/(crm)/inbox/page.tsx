import Header from "@/components/layout/Header";
import InboxTabsClient from "./InboxTabsClient";

export default function InboxPage() {
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 0px)", maxHeight: "100vh", overflow: "hidden" }}>
      <Header title="Inbox" />
      <div className="flex-1" style={{ minHeight: 0, overflow: "hidden" }}>
        <InboxTabsClient />
      </div>
    </div>
  );
}

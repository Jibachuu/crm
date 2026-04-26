import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import InboxTabsClient from "./InboxTabsClient";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <div className="flex flex-col" style={{ height: "100vh", maxHeight: "100vh", overflow: "hidden" }}>
      <Header title="Inbox" />
      <div className="flex-1" style={{ minHeight: 0, overflow: "hidden" }}>
        <InboxTabsClient />
      </div>
    </div>
  );
}

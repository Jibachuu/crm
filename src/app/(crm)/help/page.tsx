import Header from "@/components/layout/Header";
import HelpClient from "./HelpClient";

export default function HelpPage() {
  return (
    <>
      <Header title="Справка" />
      <main className="p-6">
        <HelpClient />
      </main>
    </>
  );
}

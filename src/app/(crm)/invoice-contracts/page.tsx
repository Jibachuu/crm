import Header from "@/components/layout/Header";
import InvoiceContractsClient from "./InvoiceContractsClient";

export default function InvoiceContractsPage() {
  return (
    <>
      <Header title="Счёт-договоры" />
      <main className="p-6">
        <InvoiceContractsClient />
      </main>
    </>
  );
}

import Header from "@/components/layout/Header";
import ContractsClient from "./ContractsClient";

export default function ContractsPage() {
  return (
    <>
      <Header title="Договоры" />
      <main className="p-6">
        <ContractsClient />
      </main>
    </>
  );
}

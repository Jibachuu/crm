import Header from "@/components/layout/Header";
import RentalContractsClient from "./RentalContractsClient";

export default function RentalContractsPage() {
  return (
    <>
      <Header title="Договоры аренды" />
      <main className="p-6">
        <RentalContractsClient />
      </main>
    </>
  );
}

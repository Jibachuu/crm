import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import CampaignsClient from "./CampaignsClient";

export default async function CampaignsPage() {
  const supabase = await createClient();

  const { data: campaigns } = await supabase
    .from("email_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, full_name, email, phone, company_id, companies(name)")
    .not("email", "is", null)
    .order("full_name")
    .limit(5000);

  return (
    <>
      <Header title="Рассылки" />
      <main className="p-6">
        <CampaignsClient
          initialCampaigns={campaigns ?? []}
          contacts={contacts ?? []}
        />
      </main>
    </>
  );
}

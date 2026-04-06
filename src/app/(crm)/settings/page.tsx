import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import UsersSettings from "./UsersSettings";
import CustomFieldsSettings from "./CustomFieldsSettings";
import ChannelsSettings from "./ChannelsSettings";
import DirectoriesSettings from "./DirectoriesSettings";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: currentUser } = await supabase.from("users").select("role").eq("id", authUser.id).single();
  if (currentUser?.role !== "admin") redirect("/");

  const admin = createAdminClient();

  const [{ data: users }, { data: permissions }, { data: customFields }] = await Promise.all([
    admin.from("users").select("*").order("full_name"),
    admin.from("permissions").select("*"),
    supabase.from("custom_fields").select("*").order("entity_type, sort_order"),
  ]);

  return (
    <>
      <Header title="Настройки" />
      <main className="p-6 max-w-5xl">
        <div className="space-y-8">
          <UsersSettings users={users ?? []} permissions={permissions ?? []} />
          <DirectoriesSettings />
          <CustomFieldsSettings customFields={customFields ?? []} />
          <ChannelsSettings />
        </div>
      </main>
    </>
  );
}

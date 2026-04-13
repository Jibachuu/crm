import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import TeamPageTabs from "./TeamPageTabs";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  const { data: currentUser } = await supabase.from("users").select("role").eq("id", authUser?.id ?? "").single();

  const { data: users } = await supabase
    .from("users")
    .select("id, full_name, email, role, is_active, avatar_url, last_seen_at")
    .order("full_name");

  return (
    <>
      <Header title="Команда" />
      <TeamPageTabs
        currentUserId={authUser?.id ?? ""}
        users={users ?? []}
        userRole={currentUser?.role ?? "manager"}
      />
    </>
  );
}

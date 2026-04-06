import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import TeamClient from "./TeamClient";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  const { data: users } = await supabase
    .from("users")
    .select("id, full_name, email, role, is_active, avatar_url")
    .order("full_name");

  return (
    <>
      <Header title="Команда" />
      <main className="flex-1 flex min-h-0">
        <TeamClient
          currentUserId={authUser?.id ?? ""}
          users={users?.filter((u) => u.id !== authUser?.id) ?? []}
        />
      </main>
    </>
  );
}

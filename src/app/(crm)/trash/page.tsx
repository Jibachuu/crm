import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/layout/Header";
import TrashClient from "./TrashClient";

export default async function TrashPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "supervisor"].includes(profile.role)) {
    redirect("/dashboard");
  }

  return (
    <>
      <Header title="Корзина" />
      <main className="p-6">
        <TrashClient />
      </main>
    </>
  );
}

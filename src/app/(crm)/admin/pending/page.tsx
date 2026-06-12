import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/layout/Header";
import PendingUsersClient from "./PendingUsersClient";

export const metadata: Metadata = { title: "Пользователи на подтверждении" };

// Страница для админа: список всех users с is_approved=false. Кнопка
// «Утвердить» вызывает /api/admin/approve-user. Доступ — только role=admin
// (не-админов сразу редиректим на /dashboard, чтобы они даже про существование
// этой страницы не знали по URL).
export default async function PendingUsersPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const admin = createAdminClient();
  const { data: me } = await admin.from("users").select("role").eq("id", authUser.id).single();
  if (me?.role !== "admin") redirect("/dashboard");

  const { data: pending } = await admin
    .from("users")
    .select("id, full_name, email, role, is_approved, created_at")
    .eq("is_approved", false)
    .order("created_at", { ascending: false });

  return (
    <>
      <Header title="Пользователи на подтверждении" />
      <main className="p-6">
        <PendingUsersClient users={pending ?? []} />
      </main>
    </>
  );
}

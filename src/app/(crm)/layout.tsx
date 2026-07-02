import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import PageLoader from "@/components/layout/PageLoader";
import IncomingCallPopup from "@/components/ui/IncomingCallPopup";
import WebPhone from "@/components/ui/WebPhone";
import type { User } from "@/types/database";

export default async function CRMLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const admin = (await import("@/lib/supabase/admin")).createAdminClient();
  const { data: profile } = await admin.from("users").select("*").eq("id", authUser.id).single();
  if (!profile) redirect("/login");

  // v87: пока админ не утвердил юзера, он не видит данные CRM. Это второй
  // забор после закрытой регистрации (Phase 1) — даже если кто-то получил
  // аккаунт через Supabase Dashboard / signUp напрямую через REST,
  // is_approved=false по умолчанию (см. migration_v87.sql и триггер
  // handle_new_user). is_approved отсутствует в TS-типе User (генерится из
  // /types/database) — обращаемся через bracket-доступ, чтобы tsc не ругался
  // до следующего регена типов.
  if ((profile as Record<string, unknown>).is_approved === false) {
    redirect("/pending-approval");
  }

  // Load permissions for non-admin users
  let permissions: Record<string, { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }> = {};
  if (profile.role !== "admin") {
    const { data: perms } = await supabase.from("permissions").select("*").eq("user_id", authUser.id);
    for (const p of perms ?? []) {
      permissions[p.resource] = {
        can_read: p.can_read,
        can_create: p.can_create,
        can_update: p.can_update,
        can_delete: p.can_delete,
      };
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar user={profile as User} permissions={permissions} />
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <PageLoader />
        {children}
      </div>
      <IncomingCallPopup />
      {profile.sip_login && profile.sip_password && (
        <WebPhone
          sipUser={profile.sip_login}
          sipPassword={profile.sip_password}
          displayName={profile.full_name}
        />
      )}
    </div>
  );
}

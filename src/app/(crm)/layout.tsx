import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import PageLoader from "@/components/layout/PageLoader";
import AIChatPanel from "@/components/ui/AIChatPanel";
import IncomingCallPopup from "@/components/ui/IncomingCallPopup";
import WebPhone from "@/components/ui/WebPhone";
import type { User } from "@/types/database";

export default async function CRMLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const { data: profile } = await supabase.from("users").select("*").eq("id", authUser.id).single();
  if (!profile) redirect("/login");

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
      <AIChatPanel />
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

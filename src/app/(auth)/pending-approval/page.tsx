import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";
import { redirect } from "next/navigation";

// Куда попадает залогиненный юзер, у которого is_approved=false. Эта
// страница не показывает никакие данные CRM — только сообщение «ваш
// аккаунт ожидает подтверждения админа» + кнопка «Выйти».
// Если admin поставил is_approved=true — этой проверки больше не будет
// и /(crm) layout пустит его дальше.

export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  // Если юзер уже утверждён — отправим в /dashboard, чтобы не показывать
  // эту страницу случайно (например, по старой закладке).
  const admin = (await import("@/lib/supabase/admin")).createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("is_approved, full_name, email")
    .eq("id", authUser.id)
    .single();
  if (profile?.is_approved) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Аккаунт ожидает подтверждения</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <p className="text-slate-700 mb-2">
            <strong>{profile?.full_name || profile?.email}</strong>, ваш аккаунт создан, но ещё не подтверждён администратором.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Доступ к данным CRM откроется сразу после того, как администратор подтвердит ваш аккаунт. Если это срочно — свяжитесь с руководителем.
          </p>

          <form action={logout}>
            <button
              type="submit"
              className="w-full px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition"
            >
              Выйти
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

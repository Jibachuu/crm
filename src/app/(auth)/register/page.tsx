import Link from "next/link";

// Регистрация в CRM закрыта намеренно — раньше любой посторонний мог
// зарегистрироваться (signUp напрямую через Supabase Auth), получить роль
// «manager» через trigger handle_new_user, и сразу видеть лиды/сделки/
// товары/цены. Это серьёзная утечка для B2B-CRM.
// Доступы выдаёт администратор: создаёт юзера руками через Supabase
// Dashboard → Authentication → Users → «Add user», затем добавляет
// запись в public.users с нужной ролью.
// Server action register() в [actions/auth.ts] тоже возвращает ошибку —
// даже если кто-то постит форму напрямую без UI, ничего не создастся.

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-700 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Регистрация закрыта</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <p className="text-slate-700 mb-2 font-medium">Самостоятельная регистрация недоступна.</p>
          <p className="text-sm text-slate-500 mb-6">
            CRM используется только внутри компании. Аккаунты создаёт администратор. Если вам нужен доступ — обратитесь к руководителю.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
          >
            На страницу входа
          </Link>
        </div>
      </div>
    </div>
  );
}

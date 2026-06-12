"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

// Регистрация в CRM закрыта намеренно — это внутренняя B2B-система.
// Раньше любой посторонний мог зарегистрироваться через эту action,
// получить роль «manager» через trigger handle_new_user и сразу видеть
// лиды, сделки, цены и реквизиты компаний.
// Action оставлена в файле для совместимости с импортом из register/page
// и сразу возвращает ошибку — даже если кто-то посылает POST напрямую,
// в обход disabled UI, signUp не вызовется.
export async function register(_formData: FormData) {
  return { error: "Самостоятельная регистрация отключена. Доступ выдаёт администратор." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPassword(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "Ссылка для сброса пароля отправлена на почту" };
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

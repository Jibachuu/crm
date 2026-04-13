"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: fd.get("email") as string,
      password: fd.get("password") as string,
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    } else {
      window.location.href = "/dashboard";
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">CRM система</h1>
          <p className="text-slate-400 mt-1 text-sm">Войдите в свой аккаунт</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              name="email"
              type="email"
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
            <Input
              label="Пароль"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                Забыли пароль?
              </Link>
            </div>

            <Button type="submit" loading={loading} size="lg" className="w-full">
              Войти
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Нет аккаунта?{" "}
            <Link href="/register" className="text-blue-600 hover:text-blue-700 hover:underline font-medium">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

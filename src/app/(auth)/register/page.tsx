"use client";

import { useState } from "react";
import Link from "next/link";
import { register } from "@/app/actions/auth";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    if (fd.get("password") !== fd.get("confirm_password")) {
      setMessage({ type: "error", text: "Пароли не совпадают" });
      setLoading(false);
      return;
    }
    const result = await register(fd);
    if (result?.error) {
      setMessage({ type: "error", text: result.error });
    } else if (result?.success) {
      setMessage({ type: "success", text: result.success });
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Регистрация</h1>
          <p className="text-slate-400 mt-1 text-sm">Создайте аккаунт</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm border ${
              message.type === "error"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-green-50 border-green-200 text-green-700"
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Полное имя" name="full_name" placeholder="Иван Иванов" required />
            <Input label="Email" name="email" type="email" placeholder="you@company.com" required />
            <Input label="Пароль" name="password" type="password" placeholder="Минимум 6 символов" required minLength={6} />
            <Input label="Подтверждение пароля" name="confirm_password" type="password" placeholder="Повторите пароль" required />

            <Button type="submit" loading={loading} size="lg" className="w-full">
              Создать аккаунт
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 hover:underline font-medium">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

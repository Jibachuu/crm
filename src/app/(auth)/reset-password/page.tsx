"use client";

import { useState } from "react";
import { resetPassword } from "@/app/actions/auth";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("password") !== fd.get("confirm")) {
      setError("Пароли не совпадают");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await resetPassword(fd);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Новый пароль</h1>
          <p className="text-slate-400 mt-1 text-sm">Введите новый пароль</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Новый пароль" name="password" type="password" placeholder="Минимум 6 символов" required minLength={6} />
            <Input label="Подтверждение" name="confirm" type="password" placeholder="Повторите пароль" required />
            <Button type="submit" loading={loading} size="lg" className="w-full">
              Сохранить пароль
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

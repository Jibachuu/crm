"use client";

import { useState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/app/actions/auth";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const result = await forgotPassword(new FormData(e.currentTarget));
    if (result?.error) setMessage({ type: "error", text: result.error });
    else if (result?.success) setMessage({ type: "success", text: result.success });
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Восстановление пароля</h1>
          <p className="text-slate-400 mt-1 text-sm">Отправим ссылку на вашу почту</p>
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
            <Input label="Email" name="email" type="email" placeholder="you@company.com" required />
            <Button type="submit" loading={loading} size="lg" className="w-full">
              Отправить ссылку
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            <Link href="/login" className="text-blue-600 hover:underline">← Вернуться к входу</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

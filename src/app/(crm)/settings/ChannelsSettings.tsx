"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Channel = "telegram" | "email" | "zadarma";

export default function ChannelsSettings() {
  const [activeChannel, setActiveChannel] = useState<Channel>("telegram");

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Каналы коммуникаций</h2>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6 w-fit">
        {(["telegram", "email", "zadarma"] as Channel[]).map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeChannel === ch ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {ch === "telegram" ? "💬 Telegram" : ch === "email" ? "✉️ Email" : "📞 Zadarma"}
          </button>
        ))}
      </div>

      {activeChannel === "telegram" && <TelegramSettings />}
      {activeChannel === "email" && <EmailSettings />}
      {activeChannel === "zadarma" && <ZadarmaSettings />}
    </div>
  );
}

function TelegramSettings() {
  const [step, setStep] = useState<"idle" | "code" | "password" | "done">("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState("");

  async function startAuth() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/telegram/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", phone }),
    });
    const data = await res.json();
    if (data.status === "already_authorized") {
      setUser(data.user?.firstName ?? "");
      setStep("done");
    } else if (data.status === "code_sent") {
      setStep("code");
    } else {
      setError(data.error ?? "Ошибка");
    }
    setLoading(false);
  }

  async function verifyCode() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/telegram/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify_code", phone, code, password }),
    });
    const data = await res.json();
    if (data.status === "authorized") {
      setSession(data.session);
      setUser(data.user?.firstName ?? "");
      setStep("done");
    } else if (data.status === "need_password") {
      setStep("password");
    } else {
      setError(data.error ?? "Неверный код");
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardBody>
        <h3 className="font-semibold text-slate-900 mb-1">Личный Telegram (MTProto)</h3>
        <p className="text-sm text-slate-500 mb-4">
          Подключение личного аккаунта Telegram через MTProto API (не бот). Нужны{" "}
          <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            API ID и API Hash с my.telegram.org
          </a>
          .
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
          Добавьте в <code className="bg-amber-100 px-1 rounded">.env.local</code>:
          <br />
          <code>TELEGRAM_API_ID=ваш_id</code>
          <br />
          <code>TELEGRAM_API_HASH=ваш_hash</code>
          <br />
          <code>TELEGRAM_SESSION=</code> <span className="text-xs">(заполнится после авторизации)</span>
        </div>

        {step === "idle" && (
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input label="Номер телефона" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+79001234567" />
            </div>
            <Button onClick={startAuth} loading={loading} disabled={!phone}>Отправить код</Button>
          </div>
        )}

        {(step === "code" || step === "password") && (
          <div className="space-y-3">
            <Input label="Код из Telegram" value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345" />
            {step === "password" && (
              <Input label="Пароль двухфакторной аутентификации" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={verifyCode} loading={loading}>Подтвердить</Button>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-4 py-3">
              <span className="text-xl">✅</span>
              <span className="text-sm font-medium">Авторизован как {user}</span>
            </div>
            {session && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Скопируйте строку сессии в <code>.env.local</code> как <code>TELEGRAM_SESSION</code>:</p>
                <textarea
                  readOnly
                  value={session}
                  className="w-full text-xs font-mono border border-slate-300 rounded-lg p-2 bg-slate-50 resize-none"
                  rows={3}
                />
              </div>
            )}
          </div>
        )}

        {error && step === "idle" && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </CardBody>
    </Card>
  );
}

function EmailSettings() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");

  async function testEmail() {
    setTesting(true);
    setResult("");
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "test@example.com", subject: "Тест CRM", body: "Тестовое письмо из CRM" }),
    });
    const data = await res.json();
    setResult(data.status === "sent" ? "✅ Письмо отправлено успешно!" : `❌ ${data.error}`);
    setTesting(false);
  }

  async function syncInbox() {
    setTesting(true);
    const res = await fetch("/api/email/sync", { method: "POST" });
    const data = await res.json();
    setResult(data.status === "synced" ? `✅ Синхронизировано, сохранено ${data.saved} писем` : `❌ ${data.error}`);
    setTesting(false);
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900 mb-1">Email — SMTP/IMAP</h3>
          <p className="text-sm text-slate-500">Gmail, Яндекс.Почта или любой SMTP/IMAP сервер.</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm font-mono space-y-1 text-slate-700">
          <p># Отправка (SMTP)</p>
          <p>SMTP_HOST=smtp.yandex.ru</p>
          <p>SMTP_PORT=587</p>
          <p>SMTP_USER=your@yandex.ru</p>
          <p>SMTP_PASS=пароль_приложения</p>
          <p>SMTP_FROM=your@yandex.ru</p>
          <p className="mt-2"># Получение (IMAP)</p>
          <p>IMAP_HOST=imap.yandex.ru</p>
          <p>IMAP_PORT=993</p>
          <p>IMAP_USER=your@yandex.ru</p>
          <p>IMAP_PASS=пароль_приложения</p>
        </div>

        <div className="flex gap-3">
          <Button size="sm" variant="secondary" onClick={testEmail} loading={testing}>
            Тест отправки
          </Button>
          <Button size="sm" variant="secondary" onClick={syncInbox} loading={testing}>
            Синхронизировать входящие
          </Button>
        </div>

        {result && <p className="text-sm">{result}</p>}
      </CardBody>
    </Card>
  );
}

function ZadarmaSettings() {
  const [phone, setPhone] = useState("");
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState("");

  async function testCall() {
    setCalling(true);
    setResult("");
    const res = await fetch("/api/zadarma/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    setResult(data.status === "calling" ? `✅ Звонок инициирован на ${phone}` : `❌ ${data.error}`);
    setCalling(false);
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900 mb-1">Zadarma — телефония</h3>
          <p className="text-sm text-slate-500">Звонки, запись разговоров, транскрипция через Яндекс SpeechKit.</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm font-mono space-y-1 text-slate-700">
          <p>ZADARMA_API_KEY=ваш_ключ</p>
          <p>ZADARMA_SECRET_KEY=ваш_секрет</p>
          <p>ZADARMA_SIP=100 # внутренний номер SIP</p>
          <p className="mt-2"># Webhook URL для настройки в личном кабинете Zadarma:</p>
          <p className="text-blue-600">https://ваш-домен.com/api/zadarma/webhook</p>
        </div>

        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Input label="Номер для теста" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+79001234567" />
          </div>
          <Button size="sm" onClick={testCall} loading={calling} disabled={!phone}>
            📞 Позвонить
          </Button>
        </div>

        {result && <p className="text-sm">{result}</p>}
      </CardBody>
    </Card>
  );
}

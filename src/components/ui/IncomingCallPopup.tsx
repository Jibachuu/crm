"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, PhoneCall, X, ExternalLink } from "lucide-react";
import Link from "next/link";

interface ActiveCall {
  id: string;
  phone: string;
  contactName: string;
  companyName: string | null;
  contactLink: string | null;
  time: string;
}

export default function IncomingCallPopup() {
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function callBack() {
    if (!call) return;
    setCalling(true);
    try {
      const res = await fetch("/api/novofon/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: call.phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Не удалось инициировать звонок: " + (data.error || "неизвестная ошибка"));
      } else {
        setDismissed(call.id);
        setCall(null);
      }
    } catch (err) {
      alert("Ошибка: " + (err as Error).message);
    } finally {
      setCalling(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function poll() {
      if (!active) return;
      try {
        const res = await fetch("/api/novofon/active-call");
        if (res.ok) {
          const data = await res.json();
          if (data.call && data.call.id !== dismissed) {
            if (!call || call.id !== data.call.id) {
              setCall(data.call);
              // Play ring sound
              try {
                if (!audioRef.current) {
                  audioRef.current = new Audio("/notification.mp3");
                }
                audioRef.current.play().catch(() => {});
              } catch {}
            }
          } else if (!data.call) {
            setCall(null);
          }
        }
      } catch {}
    }

    // Poll every 3 seconds for active calls
    poll();
    const interval = setInterval(poll, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [dismissed, call]);

  if (!call) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 animate-bounce"
      style={{ animationDuration: "1s", animationIterationCount: "3" }}
    >
      <div
        className="rounded-xl shadow-2xl"
        style={{ background: "#fff", border: "2px solid #2e7d32", minWidth: 320 }}
      >
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#e8f5e9" }}>
            <Phone size={20} style={{ color: "#2e7d32" }} className="animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: "#333" }}>
              Входящий звонок
            </p>
            <p className="text-sm font-medium" style={{ color: "#0067a5" }}>
              {call.contactName}
            </p>
            {call.companyName && (
              <p className="text-xs" style={{ color: "#888" }}>{call.companyName}</p>
            )}
            <p className="text-xs" style={{ color: "#aaa" }}>{call.phone}</p>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            {call.contactLink && (
              <Link href={call.contactLink} className="p-1.5 rounded-lg hover:bg-blue-50" title="Открыть контакт">
                <ExternalLink size={14} style={{ color: "#0067a5" }} />
              </Link>
            )}
            <button onClick={() => { setDismissed(call.id); setCall(null); }} className="p-1.5 rounded-lg hover:bg-red-50" title="Закрыть">
              <X size={14} style={{ color: "#888" }} />
            </button>
          </div>
        </div>
        <div className="px-4 pb-3">
          <button
            onClick={callBack}
            disabled={calling}
            className="w-full py-2 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "#2e7d32" }}
            title="АТС перезвонит вам, а затем соединит с клиентом"
          >
            <PhoneCall size={16} /> {calling ? "Соединение..." : "Принять / Перезвонить"}
          </button>
          <p className="text-[10px] mt-1 text-center" style={{ color: "#888" }}>
            АТС сначала позвонит на ваш внутренний номер
          </p>
        </div>
      </div>
    </div>
  );
}

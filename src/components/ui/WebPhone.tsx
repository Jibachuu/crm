"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, Mic, MicOff, X } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let JsSIP: any = null;

interface WebPhoneProps {
  sipUser: string;
  sipPassword: string;
  sipServer?: string;
  wsUrl?: string;
  displayName?: string;
}

type CallState = "idle" | "registering" | "registered" | "incoming" | "calling" | "connected" | "failed";

export default function WebPhone({ sipUser, sipPassword, sipServer = "sip.novofon.ru", wsUrl = "wss://sip.novofon.ru/ws", displayName = "CRM" }: WebPhoneProps) {
  const [state, setState] = useState<CallState>("idle");
  const [callerInfo, setCallerInfo] = useState("");
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [dialNumber, setDialNumber] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uaRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ringtoneRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }
    sessionRef.current = null;
    setDuration(0);
    setMuted(false);
    setCallerInfo("");
  }, []);

  // Initialize JsSIP UA
  useEffect(() => {
    if (!sipUser || !sipPassword) return;

    let mounted = true;
    (async () => {
      if (!JsSIP) JsSIP = (await import("jssip")).default;

      const socket = new JsSIP.WebSocketInterface(wsUrl);
      const config = {
        sockets: [socket],
        uri: `sip:${sipUser}@${sipServer}`,
        password: sipPassword,
        display_name: displayName,
        register: true,
        session_timers: false,
      };

      const ua = new JsSIP.UA(config);

      ua.on("registered", () => { if (mounted) setState("registered"); });
      ua.on("unregistered", () => { if (mounted) setState("idle"); });
      ua.on("registrationFailed", () => { if (mounted) setState("failed"); });

      // Incoming call
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ua.on("newRTCSession", (data: any) => {
        const session = data.session;
        if (session.direction === "incoming") {
          sessionRef.current = session;
          const from = session.remote_identity?.display_name || session.remote_identity?.uri?.user || "Unknown";
          if (mounted) {
            setCallerInfo(from);
            setState("incoming");
            setMinimized(false);
          }
          // Play ringtone
          try { ringtoneRef.current?.play().catch(() => {}); } catch {}

          session.on("accepted", () => {
            if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }
            if (mounted) setState("connected");
            startTimer();
            attachAudio(session);
          });
          session.on("ended", () => { if (mounted) { setState("registered"); cleanup(); } });
          session.on("failed", () => { if (mounted) { setState("registered"); cleanup(); } });
        }
      });

      ua.start();
      uaRef.current = ua;
    })();

    return () => {
      mounted = false;
      if (uaRef.current) { try { uaRef.current.stop(); } catch {} }
      cleanup();
    };
  }, [sipUser, sipPassword, sipServer, wsUrl, displayName, cleanup]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function attachAudio(session: any) {
    const streams = session.connection?.getRemoteStreams?.();
    if (streams?.length && audioRef.current) {
      audioRef.current.srcObject = streams[0];
      audioRef.current.play().catch(() => {});
    } else {
      // Modern API
      session.connection?.addEventListener("track", (e: RTCTrackEvent) => {
        if (audioRef.current && e.streams?.[0]) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current.play().catch(() => {});
        }
      });
    }
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }

  function answer() {
    if (sessionRef.current) {
      sessionRef.current.answer({
        mediaConstraints: { audio: true, video: false },
      });
    }
  }

  function reject() {
    if (sessionRef.current) {
      try { sessionRef.current.terminate(); } catch {}
    }
    setState("registered");
    cleanup();
  }

  function hangup() {
    if (sessionRef.current) {
      try { sessionRef.current.terminate(); } catch {}
    }
    setState("registered");
    cleanup();
  }

  function toggleMute() {
    if (!sessionRef.current) return;
    if (muted) { sessionRef.current.unmute(); setMuted(false); }
    else { sessionRef.current.mute(); setMuted(true); }
  }

  function makeCall(number: string) {
    if (!uaRef.current || !number) return;
    const session = uaRef.current.call(`sip:${number}@${sipServer}`, {
      mediaConstraints: { audio: true, video: false },
    });
    sessionRef.current = session;
    setCallerInfo(number);
    setState("calling");
    setMinimized(false);

    session.on("accepted", () => { setState("connected"); startTimer(); attachAudio(session); });
    session.on("ended", () => { setState("registered"); cleanup(); });
    session.on("failed", () => { setState("registered"); cleanup(); });
  }

  const fmtDur = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
  const isActive = state === "incoming" || state === "calling" || state === "connected";

  // Status indicator (always visible)
  const statusColor = state === "registered" ? "#2e7d32" : state === "failed" ? "#c62828" : "#888";
  const statusText = state === "registered" ? "Online" : state === "registering" ? "..." : state === "failed" ? "Offline" : state === "idle" ? "" : "";

  if (!sipUser) return null;

  return (
    <>
      <audio ref={audioRef} autoPlay />
      <audio ref={ringtoneRef} src="/notification.mp3" loop />

      {/* Minimized: small phone icon */}
      {minimized && !isActive && state === "registered" && (
        <button
          onClick={() => setMinimized(false)}
          className="fixed bottom-20 right-4 md:bottom-4 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: "#0067a5" }}
          title="Телефон"
        >
          <Phone size={20} className="text-white" />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full" style={{ background: statusColor }} />
        </button>
      )}

      {/* Incoming call alert */}
      {state === "incoming" && (
        <div className="fixed top-4 right-4 z-[100] bg-white rounded-xl shadow-2xl p-4 animate-bounce" style={{ border: "2px solid #2e7d32", minWidth: 280 }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#e8f5e9" }}>
              <PhoneIncoming size={20} style={{ color: "#2e7d32" }} />
            </div>
            <div>
              <p className="text-sm font-semibold">Входящий звонок</p>
              <p className="text-lg font-bold" style={{ color: "#333" }}>{callerInfo}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={answer} className="flex-1 py-2 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-1" style={{ background: "#2e7d32" }}>
              <Phone size={16} /> Ответить
            </button>
            <button onClick={reject} className="flex-1 py-2 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-1" style={{ background: "#c62828" }}>
              <PhoneOff size={16} /> Сбросить
            </button>
          </div>
        </div>
      )}

      {/* Active call panel */}
      {state === "connected" && (
        <div className="fixed top-4 right-4 z-[100] bg-white rounded-xl shadow-2xl p-4" style={{ border: "1px solid #e4e4e4", minWidth: 260 }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#e8f5e9" }}>
              <Phone size={16} style={{ color: "#2e7d32" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#333" }}>{callerInfo}</p>
              <p className="text-xs font-mono" style={{ color: "#2e7d32" }}>{fmtDur}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={toggleMute} className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1" style={{ background: muted ? "#fff3e0" : "#f5f5f5", color: muted ? "#e65c00" : "#555" }}>
              {muted ? <MicOff size={14} /> : <Mic size={14} />} {muted ? "Вкл. микро" : "Мьют"}
            </button>
            <button onClick={hangup} className="flex-1 py-2 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-1" style={{ background: "#c62828" }}>
              <PhoneOff size={14} /> Завершить
            </button>
          </div>
        </div>
      )}

      {/* Calling (outbound ringing) */}
      {state === "calling" && (
        <div className="fixed top-4 right-4 z-[100] bg-white rounded-xl shadow-2xl p-4" style={{ border: "1px solid #e4e4e4", minWidth: 260 }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center animate-pulse" style={{ background: "#e8f4fd" }}>
              <PhoneOutgoing size={16} style={{ color: "#0067a5" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#333" }}>{callerInfo}</p>
              <p className="text-xs" style={{ color: "#888" }}>Вызов...</p>
            </div>
          </div>
          <button onClick={hangup} className="w-full py-2 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-1" style={{ background: "#c62828" }}>
            <PhoneOff size={14} /> Отмена
          </button>
        </div>
      )}

      {/* Expanded dialer */}
      {!minimized && !isActive && (
        <div className="fixed bottom-20 right-4 md:bottom-4 z-50 bg-white rounded-xl shadow-2xl p-4" style={{ border: "1px solid #e4e4e4", width: 260 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
              <span className="text-xs" style={{ color: statusColor }}>{statusText}</span>
            </div>
            <button onClick={() => setMinimized(true)} className="p-1 rounded hover:bg-gray-100">
              <X size={14} style={{ color: "#888" }} />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={dialNumber}
              onChange={(e) => setDialNumber(e.target.value)}
              placeholder="+7..."
              className="flex-1 text-sm px-3 py-2 rounded-lg"
              style={{ border: "1px solid #e0e0e0" }}
              onKeyDown={(e) => { if (e.key === "Enter" && dialNumber) makeCall(dialNumber); }}
            />
            <button
              onClick={() => { if (dialNumber) makeCall(dialNumber); }}
              disabled={state !== "registered" || !dialNumber}
              className="px-3 py-2 rounded-lg text-white disabled:opacity-40"
              style={{ background: "#2e7d32" }}
            >
              <Phone size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

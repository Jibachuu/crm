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

type CallState = "idle" | "registering" | "registered" | "incoming" | "calling" | "ringing" | "connected" | "failed";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.novofon.ru" },
];

export default function WebPhone({ sipUser, sipPassword, sipServer = "sip.novofon.ru", wsUrl = "wss://sip.novofon.ru/ws", displayName = "CRM" }: WebPhoneProps) {
  const [state, setState] = useState<CallState>("idle");
  const [callerInfo, setCallerInfo] = useState("");
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [dialNumber, setDialNumber] = useState("");

  const stateRef = useRef<CallState>("idle");
  // Sync ref immediately on state change (useEffect is too late for fast callbacks)
  function setStateAndRef(s: CallState) { stateRef.current = s; setState(s); }
  useEffect(() => { stateRef.current = state; }, [state]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uaRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ringtoneRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const outboundNumberRef = useRef<string>("");
  const ringbackRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode; interval: ReturnType<typeof setInterval> } | null>(null);

  // --- Ringback tone (425 Hz, 1s on / 4s off — Russian standard) ---
  const startRingback = useCallback(() => {
    stopRingback();
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 425;
      osc.type = "sine";
      gain.gain.value = 0; // start silent
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      let on = true;
      gain.gain.value = 0.15;
      const interval = setInterval(() => {
        on = !on;
        gain.gain.value = on ? 0.15 : 0;
      }, on ? 1000 : 4000);

      // More accurate: 1s on, 4s off cycle
      clearInterval(interval);
      let phase = 0;
      const tick = setInterval(() => {
        phase++;
        const inCycle = phase % 50; // 50 * 100ms = 5s cycle
        gain.gain.value = inCycle < 10 ? 0.15 : 0; // first 1s on, rest off
      }, 100);

      ringbackRef.current = { ctx, osc, gain, interval: tick };
    } catch (e) {
      console.warn("[WebPhone] ringback failed:", e);
    }
  }, []);

  const stopRingback = useCallback(() => {
    if (ringbackRef.current) {
      try {
        clearInterval(ringbackRef.current.interval);
        ringbackRef.current.osc.stop();
        ringbackRef.current.ctx.close();
      } catch {}
      ringbackRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }
    stopRingback();
    sessionRef.current = null;
    outboundNumberRef.current = "";
    setDuration(0);
    setMuted(false);
    setCallerInfo("");
  }, [stopRingback]);

  const endCall = useCallback(() => {
    console.log("[WebPhone] endCall, current state:", stateRef.current);
    setStateAndRef("registered");
    cleanup();
  }, [cleanup]);

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
        connection_recovery_min_interval: 2,
        connection_recovery_max_interval: 30,
      };

      const ua = new JsSIP.UA(config);

      ua.on("registered", () => { console.log("[WebPhone] registered"); if (mounted) setStateAndRef("registered"); });
      ua.on("unregistered", () => { console.log("[WebPhone] unregistered"); if (mounted) setStateAndRef("idle"); });
      ua.on("registrationFailed", (e: any) => { console.error("[WebPhone] registration failed:", e?.cause); if (mounted) setStateAndRef("failed"); });

      // Incoming call (including callback from Novofon after makeCall)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ua.on("newRTCSession", (data: any) => {
        if (!mounted) return;
        const session = data.session;
        if (session.direction !== "incoming") return;

        sessionRef.current = session;
        const from = session.remote_identity?.display_name || session.remote_identity?.uri?.user || "Unknown";
        console.log("[WebPhone] incoming session from:", from, "current state:", stateRef.current);

        const answerOptions = {
          mediaConstraints: { audio: true, video: false },
          pcConfig: { iceServers: ICE_SERVERS },
        };

        // Bind session events — always use endCall to ensure UI resets
        session.on("accepted", () => {
          console.log("[WebPhone] call accepted");
          if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }
          stopRingback();
          if (mounted) setStateAndRef("connected");
          startTimer();
          attachAudio(session);
        });

        session.on("ended", (e: any) => {
          console.log("[WebPhone] call ended:", e?.cause);
          if (mounted) endCall();
        });

        session.on("failed", (e: any) => {
          console.error("[WebPhone] call failed:", e?.cause, e?.message?.status_code);
          if (mounted) endCall();
        });

        // If we initiated an outbound call via callback API, auto-answer this
        if (stateRef.current === "calling") {
          console.log("[WebPhone] auto-answering Novofon callback");
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          // Request microphone first, then answer — prevents ICE failures
          navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
            console.log("[WebPhone] mic acquired, answering...");
            stream.getTracks().forEach((t) => t.stop()); // release, JsSIP will re-acquire
            session.answer(answerOptions);
          }).catch((err) => {
            console.error("[WebPhone] mic error, answering anyway:", err);
            session.answer(answerOptions);
          });
          return;
        }

        // Regular incoming call — show UI
        if (mounted) {
          setCallerInfo(from);
          setStateAndRef("incoming");
          setMinimized(false);
        }
        try { ringtoneRef.current?.play().catch(() => {}); } catch {}
      });

      ua.start();
      uaRef.current = ua;
    })();

    return () => {
      mounted = false;
      if (uaRef.current) { try { uaRef.current.stop(); } catch {} }
      cleanup();
    };
  }, [sipUser, sipPassword, sipServer, wsUrl, displayName, cleanup, endCall, startRingback, stopRingback]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function attachAudio(session: any) {
    // Try modern API first
    if (session.connection) {
      session.connection.addEventListener("track", (e: RTCTrackEvent) => {
        if (audioRef.current && e.streams?.[0]) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current.play().catch(() => {});
        }
      });
      // Also check existing streams
      const receivers = session.connection.getReceivers?.();
      if (receivers?.length) {
        const stream = new MediaStream(receivers.map((r: RTCRtpReceiver) => r.track));
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          audioRef.current.play().catch(() => {});
        }
      }
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
        pcConfig: { iceServers: ICE_SERVERS },
      });
    }
  }

  function reject() {
    if (sessionRef.current) {
      try { sessionRef.current.terminate(); } catch {}
    }
    endCall();
  }

  function hangup() {
    if (sessionRef.current) {
      try { sessionRef.current.terminate(); } catch {}
    }
    endCall();
  }

  function toggleMute() {
    if (!sessionRef.current) return;
    if (muted) { sessionRef.current.unmute(); setMuted(false); }
    else { sessionRef.current.mute(); setMuted(true); }
  }

  function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
    return digits;
  }

  async function makeCall(number: string) {
    if (!uaRef.current || !number) return;

    const normalized = normalizePhone(number);
    console.log("[WebPhone] calling via callback API:", normalized, "(raw:", number, ")");
    outboundNumberRef.current = number;
    setCallerInfo(number);
    setStateAndRef("calling");
    setMinimized(false);
    startRingback();

    // Timeout: if no callback in 30s, reset
    callTimeoutRef.current = setTimeout(() => {
      console.warn("[WebPhone] callback timeout — no incoming SIP session in 30s");
      if (stateRef.current === "calling") endCall();
    }, 30000);

    try {
      const res = await fetch("/api/novofon/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[WebPhone] callback API error:", data.error);
        endCall();
        return;
      }
      console.log("[WebPhone] callback API response:", data);
      // Novofon will now call our SIP — auto-answer handler in newRTCSession will pick it up
    } catch (err) {
      console.error("[WebPhone] callback API failed:", err);
      endCall();
    }
  }

  const fmtDur = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
  const isActive = state === "incoming" || state === "calling" || state === "ringing" || state === "connected";

  const statusColor = state === "registered" ? "#2e7d32" : state === "failed" ? "#c62828" : "#888";
  const statusText = state === "registered" ? "Online" : state === "registering" ? "..." : state === "failed" ? "Offline" : "";

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

      {/* Calling / Ringing (outbound) */}
      {(state === "calling" || state === "ringing") && (
        <div className="fixed top-4 right-4 z-[100] bg-white rounded-xl shadow-2xl p-4" style={{ border: "1px solid #e4e4e4", minWidth: 260 }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center animate-pulse" style={{ background: "#e8f4fd" }}>
              <PhoneOutgoing size={16} style={{ color: "#0067a5" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#333" }}>{callerInfo}</p>
              <p className="text-xs" style={{ color: "#888" }}>
                {state === "calling" ? "Соединение..." : "Дозвон..."}
              </p>
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

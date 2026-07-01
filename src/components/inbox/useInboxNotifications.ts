"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Настройки инбокса. Персональные — хранятся в localStorage у каждого
// менеджера в браузере, а не в CRM (у разных менеджеров разные
// предпочтения по звуку/дефолту в тёмной теме).
const KEY_SOUND = "inbox:sound";
const KEY_NOTIF = "inbox:notif";

export type InboxPrefs = {
  soundEnabled: boolean;
  notifEnabled: boolean;
};

function readBool(key: string, def: boolean): boolean {
  if (typeof window === "undefined") return def;
  try {
    const v = window.localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
    return def;
  } catch { return def; }
}

function writeBool(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value ? "1" : "0"); } catch { /* skip */ }
}

// Простой WAV-«тик» через WebAudio API. Один короткий бип, без файла.
// Так менеджеру не приходится ждать загрузки mp3 при первом сообщении,
// и мы не тащим бинарник в бандл.
function playTick() {
  try {
    const AC = (typeof window !== "undefined" && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext));
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.26);
    setTimeout(() => { ctx.close().catch(() => {}); }, 500);
  } catch { /* skip */ }
}

export function useInboxNotifications() {
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => readBool(KEY_SOUND, true));
  const [notifEnabled, setNotifEnabledState] = useState<boolean>(() => readBool(KEY_NOTIF, true));
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission)
  );

  const setSoundEnabled = useCallback((v: boolean) => { setSoundEnabledState(v); writeBool(KEY_SOUND, v); }, []);
  const setNotifEnabled = useCallback((v: boolean) => { setNotifEnabledState(v); writeBool(KEY_NOTIF, v); }, []);

  const requestNotif = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") { setNotifPerm("granted"); return; }
    if (Notification.permission === "denied") { setNotifPerm("denied"); return; }
    try {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
    } catch { /* skip */ }
  }, []);

  // Показать десктоп-нотификацию. Ничего не делаем если вкладка в фокусе
  // (менеджер и так видит) — иначе спам.
  const notify = useCallback((title: string, body: string, chatKey?: string) => {
    if (typeof document !== "undefined" && document.hasFocus()) {
      // При активной вкладке пуш не показываем — считаем что менеджер сейчас в UI
      return;
    }
    if (notifEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const n = new Notification(title, { body, tag: chatKey ?? undefined, icon: "/icon.png", badge: "/icon.png" });
        n.onclick = () => { window.focus(); n.close(); };
      } catch { /* skip */ }
    }
  }, [notifEnabled]);

  const sound = useCallback(() => {
    if (!soundEnabled) return;
    // Не пикаем в глухих вкладках без user-gesture тоже бесполезно —
    // WebAudio требует хотя бы один клик на страницу, но в CRM
    // менеджер всё равно уже кликал (логинился).
    playTick();
  }, [soundEnabled]);

  return {
    soundEnabled, setSoundEnabled,
    notifEnabled, setNotifEnabled,
    notifPerm, requestNotif,
    notify, sound,
  };
}

// Отдельный хук — сравнивает старый набор ids с новым и триггерит
// callback для каждой новой записи. Использовать внутри inbox
// loadAll(), чтобы после первого «холодного» рендера не спамить
// уведомлениями обо всех уже прочитанных чатах.
export function useNewMessageDetector<T extends { id: string; lastMessage?: string; name: string; lastTime?: number }>(
  items: T[],
  onNew: (item: T) => void,
) {
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    // Первый прогон — считаем всё уже виденным, чтобы не насыпать
    // уведомлений при заходе в CRM.
    if (!initializedRef.current) {
      for (const it of items) seenRef.current.add(it.id + ":" + (it.lastMessage ?? "") + ":" + (it.lastTime ?? 0));
      initializedRef.current = true;
      return;
    }
    for (const it of items) {
      const key = it.id + ":" + (it.lastMessage ?? "") + ":" + (it.lastTime ?? 0);
      if (!seenRef.current.has(key)) {
        seenRef.current.add(key);
        // Игнорируем только-что-отправленные исходящие: у них unread=false
        // и они добавляются не как «новое от кого-то».
        // Проверить unread — снаружи в callback'е.
        onNew(it);
      }
    }
  }, [items, onNew]);
}

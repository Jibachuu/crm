"use client";

import { useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Volume2, VolumeX, Bell, BellOff } from "lucide-react";

interface Props {
  soundEnabled: boolean;
  onSoundToggle: (v: boolean) => void;
  notifEnabled: boolean;
  onNotifToggle: (v: boolean) => void;
  notifPerm: NotificationPermission | "unsupported";
  onRequestNotif: () => void;
}

// Мини-панель настроек в шапке инбокса. Компактный дропдаун
// с чекбоксами. Хочется большего — в R7 сделаем отдельный /inbox/settings.
export default function InboxSettings({
  soundEnabled, onSoundToggle,
  notifEnabled, onNotifToggle,
  notifPerm, onRequestNotif,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inbox-sidebar-btn"
        title="Настройки инбокса"
      >
        <SettingsIcon size={16} />
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: 38,
          right: 0,
          background: "var(--tg-bg-panel)",
          border: "1px solid var(--tg-border-subtle)",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          minWidth: 240,
          padding: 6,
          zIndex: 40,
        }}>
          <Row
            icon={soundEnabled ? Volume2 : VolumeX}
            label="Звук нового сообщения"
            checked={soundEnabled}
            onChange={onSoundToggle}
          />
          <Row
            icon={notifEnabled ? Bell : BellOff}
            label="Уведомления"
            checked={notifEnabled}
            onChange={(v) => {
              onNotifToggle(v);
              if (v && notifPerm === "default") onRequestNotif();
            }}
            disabledReason={
              notifPerm === "unsupported" ? "Браузер не поддерживает уведомления" :
              notifPerm === "denied" ? "Разрешение отклонено — включите в настройках браузера" :
              null
            }
          />
          {notifEnabled && notifPerm === "default" && (
            <button
              onClick={onRequestNotif}
              style={{
                width: "100%", marginTop: 4, padding: "8px 12px",
                background: "var(--tg-accent-dim)", color: "var(--tg-accent)",
                border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer",
              }}
            >
              Разрешить уведомления браузера
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, checked, onChange, disabledReason }: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabledReason?: string | null;
}) {
  const disabled = !!disabledReason;
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 6,
        opacity: disabled ? 0.55 : 1,
        transition: "background-color 0.1s",
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.background = "var(--tg-bg-panel-hover)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      title={disabledReason ?? undefined}
    >
      <Icon size={16} />
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--tg-accent)", width: 16, height: 16 }}
      />
    </label>
  );
}

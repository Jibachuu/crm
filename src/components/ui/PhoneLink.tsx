"use client";

import { Phone } from "lucide-react";
import type { ReactNode } from "react";

// Click-to-call link that routes through the in-CRM WebPhone instead of
// the OS `tel:` handler. Sipuni (and other softphones) hijack tel: URIs
// system-wide on Windows, so a plain <a href="tel:..."> opens Sipuni's
// dialer instead of our WebPhone — which is the bug Рустем reported on
// 24.04 and 20.04.
//
// We dispatch a window event picked up by <WebPhone>; if WebPhone isn't
// mounted (e.g. user without SIP credentials) we fall back to tel:.
export function makeCrmCall(phone: string, ext?: string): boolean {
  if (typeof window === "undefined") return false;
  const detail = { phone, ext: ext || undefined };
  // WebPhone listens for this and calls makeCall() — its handler also
  // writes to a window flag so we know whether anyone consumed it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__webphone_call_handled = false;
  window.dispatchEvent(new CustomEvent("crm:make-call", { detail }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).__webphone_call_handled;
}

export default function PhoneLink({
  phone,
  ext,
  className,
  iconSize = 14,
  showIcon = true,
  children,
}: {
  phone: string | null | undefined;
  ext?: string;
  className?: string;
  iconSize?: number;
  showIcon?: boolean;
  children?: ReactNode;
}) {
  if (!phone) return null;

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const handled = makeCrmCall(phone!, ext);
    if (!handled) {
      // Fallback to system handler — tel: still useful on mobile or when
      // WebPhone is unavailable. Better than silently doing nothing.
      window.location.href = `tel:${phone}`;
    }
  }

  return (
    <a
      href={`tel:${phone}`}
      onClick={onClick}
      className={className ?? "flex items-center gap-1.5 text-sm text-blue-600 hover:underline"}
      title="Позвонить через CRM"
    >
      {showIcon && <Phone size={iconSize} />}
      {children ?? phone}
    </a>
  );
}

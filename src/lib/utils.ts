import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()} ${hh}:${min}`;
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  // Manual formatting to avoid Intl hydration mismatch (server locale ≠ client locale)
  const n = Math.round(amount * 100) / 100;
  const [int, dec] = n.toFixed(2).split(".");
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec === "00" ? `${formatted} ₽` : `${formatted},${dec} ₽`;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return `+${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9)}`;
  }
  return phone;
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function truncate(str: string | null | undefined, length = 50): string {
  if (!str) return "";
  return str.length > length ? str.slice(0, length) + "…" : str;
}

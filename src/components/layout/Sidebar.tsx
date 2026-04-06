"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, getInitials } from "@/lib/utils";
import type { User } from "@/types/database";
import {
  LayoutDashboard,
  Users,
  Handshake,
  ContactRound,
  Building2,
  Package,
  MessageSquare,
  CheckSquare,
  BarChart3,
  Settings,
  LogOut,
  UsersRound,
  Mail,
} from "lucide-react";
import { logout } from "@/app/actions/auth";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { href: "/leads", label: "Лиды", icon: Users },
  { href: "/deals", label: "Сделки", icon: Handshake },
  { href: "/contacts", label: "Контакты", icon: ContactRound },
  { href: "/companies", label: "Компании", icon: Building2 },
  { href: "/products", label: "Товары", icon: Package },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/tasks", label: "Задачи", icon: CheckSquare },
  { href: "/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/team", label: "Команда", icon: UsersRound },
  { href: "/campaigns", label: "Рассылки", icon: Mail },
];

type SectionPerms = Record<string, { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }>;

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "sidebar-link flex items-center gap-2.5 px-3 py-2 text-sm font-medium",
        isActive ? "text-white" : ""
      )}
      style={{
        borderRadius: 6,
        background: isActive ? "#0067a5" : "transparent",
        color: isActive ? "#ffffff" : "rgba(255,255,255,0.55)",
        transition: "all 0.15s ease",
      }}
    >
      <Icon size={16} className="flex-shrink-0" style={{ transition: "transform 0.15s ease" }} />
      {item.label}
    </Link>
  );
}

export default function Sidebar({ user, permissions = {} }: { user: User; permissions?: SectionPerms }) {
  const pathname = usePathname();

  return (
    <aside
      className="w-56 min-h-screen flex flex-col flex-shrink-0"
      style={{ background: "#1e2330" }}
    >
      {/* Logo */}
      <div className="px-4 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 flex items-center justify-center flex-shrink-0"
            style={{ background: "#0067a5", borderRadius: 4 }}
          >
            <LayoutDashboard size={14} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm tracking-wide">CRM</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.filter((item) => {
          if (user.role === "admin") return true;
          const sectionKey = item.href.replace("/", "");
          const perm = permissions[sectionKey];
          return perm === undefined ? true : perm.can_read;
        }).map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return <NavLink key={item.href} item={item} isActive={isActive} />;
        })}

        {user.role === "admin" && (
          <>
            <div className="my-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />
            <NavLink
              item={{ href: "/settings", label: "Настройки", icon: Settings }}
              isActive={pathname.startsWith("/settings")}
            />
          </>
        )}
      </nav>

      {/* User */}
      <div className="px-2 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div
            className="w-7 h-7 flex items-center justify-center flex-shrink-0"
            style={{ background: "#2d6fcf", borderRadius: "50%" }}
          >
            <span className="text-white text-xs font-bold">{getInitials(user.full_name)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user.full_name}</p>
            <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
              {user.email}
            </p>
          </div>
        </div>
        <form action={logout} className="mt-0.5">
          <button
            type="submit"
            className="sidebar-link w-full flex items-center gap-2.5 px-3 py-2 text-sm"
            style={{ borderRadius: 6, color: "rgba(255,255,255,0.5)", transition: "all 0.15s ease" }}
          >
            <LogOut size={14} />
            Выйти
          </button>
        </form>
      </div>

      <style jsx global>{`
        .sidebar-link:hover:not([style*="background: #0067a5"]) {
          background: rgba(255,255,255,0.08) !important;
          color: #fff !important;
          padding-left: 14px !important;
        }
        .sidebar-link:active {
          transform: scale(0.98);
        }
      `}</style>
    </aside>
  );
}

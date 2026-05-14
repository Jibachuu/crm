"use client";

import { useState, useEffect } from "react";
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
  FlaskConical,
  Receipt,
  FileSpreadsheet,
  FileText,
  FileCheck,
  UserCircle,
  Factory,
  HelpCircle,
  Phone,
  PhoneCall,
  Image,
  Menu,
  X,
  MoreHorizontal,
  Trash2,
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
  { href: "/samples", label: "Пробники", icon: FlaskConical },
  { href: "/invoices", label: "Счета", icon: Receipt },
  { href: "/upd", label: "УПД", icon: FileCheck },
  { href: "/quotes", label: "КП", icon: FileSpreadsheet },
  { href: "/contracts", label: "Договоры", icon: FileText },
  { href: "/invoice-contracts", label: "Счёт-договоры", icon: Receipt },
  { href: "/rental-contracts", label: "Договоры аренды", icon: FileText },
  { href: "/gallery", label: "Галерея", icon: Image },
  { href: "/production", label: "Производство", icon: Factory },
  { href: "/calls", label: "Звонки", icon: Phone },
  { href: "/cold-calls", label: "Прозвон", icon: PhoneCall },
  { href: "/my-clients", label: "Мои клиенты", icon: UserCircle },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/tasks", label: "Задачи", icon: CheckSquare },
  { href: "/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/team", label: "Команда", icon: UsersRound },
  { href: "/campaigns", label: "Рассылки", icon: Mail },
  { href: "/help", label: "Справка", icon: HelpCircle },
];

// Bottom tab bar items (most used)
const TAB_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/leads", label: "Лиды", icon: Users },
  { href: "/deals", label: "Сделки", icon: Handshake },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/tasks", label: "Задачи", icon: CheckSquare },
];

type SectionPerms = Record<string, { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }>;

function NavLink({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
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
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Prevent body scroll when sidebar open on mobile
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const filteredItems = navItems.filter((item) => {
    if (user.role === "admin") return true;
    const sectionKey = item.href.replace("/", "");
    const perm = permissions[sectionKey];
    return perm === undefined ? true : perm.can_read;
  });

  const sidebarContent = (
    <>
      {/* Logo + close button on mobile */}
      <div className="px-4 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 flex items-center justify-center flex-shrink-0" style={{ background: "#0067a5", borderRadius: 4 }}>
            <LayoutDashboard size={14} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm tracking-wide">CRM</span>
        </Link>
        <button className="md:hidden p-1 rounded" onClick={() => setMobileOpen(false)} style={{ color: "rgba(255,255,255,0.5)" }}>
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return <NavLink key={item.href} item={item} isActive={isActive} onClick={() => setMobileOpen(false)} />;
        })}
        {(user.role === "admin" || user.role === "supervisor") && (
          <>
            <div className="my-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />
            <NavLink item={{ href: "/trash", label: "Корзина", icon: Trash2 }} isActive={pathname.startsWith("/trash")} onClick={() => setMobileOpen(false)} />
            <NavLink item={{ href: "/settings", label: "Настройки", icon: Settings }} isActive={pathname.startsWith("/settings")} onClick={() => setMobileOpen(false)} />
          </>
        )}
      </nav>

      {/* User */}
      <div className="px-2 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 flex items-center justify-center flex-shrink-0" style={{ background: "#2d6fcf", borderRadius: "50%" }}>
            <span className="text-white text-xs font-bold">{getInitials(user.full_name)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user.full_name}</p>
            <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.45)" }}>{user.email}</p>
          </div>
        </div>
        <form action={logout} className="mt-0.5">
          <button type="submit" className="sidebar-link w-full flex items-center gap-2.5 px-3 py-2 text-sm" style={{ borderRadius: 6, color: "rgba(255,255,255,0.5)", transition: "all 0.15s ease" }}>
            <LogOut size={14} />
            Выйти
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button — fixed top-left */}
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg"
        style={{ background: "#1e2330", color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={20} />
      </button>

      {/* Desktop sidebar — always visible */}
      <aside className="hidden md:flex w-56 min-h-screen flex-col flex-shrink-0" style={{ background: "#1e2330" }}>
        {sidebarContent}
      </aside>

      {/* Mobile sidebar — overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[80vw] min-h-screen flex flex-col animate-slide-in" style={{ background: "#1e2330" }}>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around bg-white safe-area-bottom" style={{ borderTop: "1px solid #e4e4e4", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 py-2 px-3 min-w-0" style={{ color: isActive ? "#0067a5" : "#999" }}>
              <Icon size={20} />
              <span className="text-[10px] font-medium truncate">{item.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMobileOpen(true)} className="flex flex-col items-center gap-0.5 py-2 px-3" style={{ color: "#999" }}>
          <MoreHorizontal size={20} />
          <span className="text-[10px] font-medium">Ещё</span>
        </button>
      </nav>

      <style jsx global>{`
        .sidebar-link:hover:not([style*="background: #0067a5"]) {
          background: rgba(255,255,255,0.08) !important;
          color: #fff !important;
          padding-left: 14px !important;
        }
        .sidebar-link:active {
          transform: scale(0.98);
        }
        @keyframes slide-in {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slide-in 0.2s ease-out;
        }
        /* Add bottom padding on mobile for tab bar */
        @media (max-width: 767px) {
          .flex-1.flex.flex-col.min-w-0.overflow-auto {
            padding-bottom: 60px;
          }
        }
      `}</style>
    </>
  );
}

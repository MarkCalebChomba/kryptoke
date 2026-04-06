"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { IconKryptoKeLogo } from "@/components/icons";
import { useAuth } from "@/lib/store";

const NAV_ITEMS = [
  { label: "Dashboard",     href: "/admin",               icon: "📊" },
  { label: "Orders",        href: "/admin/orders",         icon: "📋" },
  { label: "Withdrawals",   href: "/admin/withdrawals",    icon: "💸" },
  { label: "Users",         href: "/admin/users",          icon: "👥" },
  { label: "Transactions",  href: "/admin/transactions",   icon: "💳" },
  { label: "Chains",        href: "/admin/chains",         icon: "🔗" },
  { label: "Coins",         href: "/admin/coins",          icon: "🪙" },
  { label: "System Health", href: "/admin/health",         icon: "🔧" },
  { label: "Support",       href: "/admin/support",        icon: "🎫" },
  { label: "Feedback",      href: "/admin/feedback",       icon: "💬" },
  { label: "Announcements", href: "/admin/announcements",  icon: "📢" },
  { label: "Events",        href: "/admin/events",         icon: "📅" },
  { label: "Settings",      href: "/admin/settings",       icon: "⚙️" },
];

function SidebarItem({ label, href, icon, active, onClick }: {
  label: string; href: string; icon: string; active: boolean; onClick?: () => void;
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => { onClick?.(); router.push(href); }}
      className={cn(
        "flex items-center gap-3 w-full px-4 py-2.5 rounded-xl font-outfit text-sm font-medium transition-all text-left",
        active
          ? "bg-primary/10 text-primary border border-primary/20"
          : "text-text-muted hover:bg-bg-surface2 hover:text-text-primary"
      )}
    >
      <span className="text-base leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // No redirect logic — admin API calls are protected server-side by adminMiddleware.
  // If a non-admin hits /admin, all data fetches will return 403 and pages show empty.

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 border-r border-border bg-bg-surface h-screen sticky top-0 overflow-y-auto">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
          <IconKryptoKeLogo size={28} />
          <div>
            <p className="font-syne font-bold text-sm text-gradient">KryptoKe</p>
            <p className="font-outfit text-[10px] text-text-muted">Admin Dashboard</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <SidebarItem
              key={item.href}
              {...item}
              active={pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))}
            />
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-[10px] font-bold text-primary">
                {user?.displayName?.slice(0, 1) ?? user?.email?.slice(0, 1) ?? "A"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-outfit text-xs text-text-primary truncate">
                {user?.displayName ?? user?.email ?? "Admin"}
              </p>
              <p className="font-outfit text-[10px] text-text-muted">Super Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 bg-bg-surface border border-border rounded-xl flex items-center justify-center shadow-lg"
        aria-label="Open menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M3 6H21M3 12H21M3 18H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="lg:hidden fixed left-0 top-0 bottom-0 w-64 bg-bg-surface border-r border-border z-50 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-5 border-b border-border">
              <div className="flex items-center gap-2">
                <IconKryptoKeLogo size={24} />
                <p className="font-syne font-bold text-sm text-gradient">Admin</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-text-muted">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <nav className="px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => (
                <SidebarItem
                  key={item.href}
                  {...item}
                  active={pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))}
                  onClick={() => setSidebarOpen(false)}
                />
              ))}
            </nav>
          </aside>
        </>
      )}

      {/* Main content */}
      <main className="flex-1 min-h-screen overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}

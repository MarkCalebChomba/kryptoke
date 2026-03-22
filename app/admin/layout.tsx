"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/store";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { IconKryptoKeLogo } from "@/components/icons";

const NAV_ITEMS = [
  { label: "Dashboard",     href: "/admin",               icon: "⬛" },
  { label: "Orders",        href: "/admin/orders",         icon: "📋" },
  { label: "Withdrawals",    href: "/admin/withdrawals",    icon: "💸" },
  { label: "Users",         href: "/admin/users",          icon: "👥" },
  { label: "Transactions",  href: "/admin/transactions",   icon: "💳" },
  { label: "Chains",        href: "/admin/chains",         icon: "🔗" },
  { label: "Coins",         href: "/admin/coins",          icon: "🪙" },
  { label: "System Health", href: "/admin/health",         icon: "🔧" },
  { label: "Feedback",      href: "/admin/feedback",       icon: "💬" },
  { label: "Announcements", href: "/admin/announcements",  icon: "📢" },
  { label: "Events",        href: "/admin/events",         icon: "📅" },
  { label: "Settings",      href: "/admin/settings",       icon: "⚙️" },
];

function SidebarItem({ label, href, icon, active }: {
  label: string; href: string; icon: string; active: boolean;
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
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
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      router.replace("/auth/login?redirect=/admin");
      return;
    }
    if (isAuthenticated) {
      apiGet("/auth/me")
        .then(() => {
          // If we got here, middleware already verified admin role
          setIsAdmin(true);
        })
        .catch(() => {
          router.replace("/");
        })
        .finally(() => setCheckingAdmin(false));
    }
  }, [isAuthenticated, isLoadingAuth, router]);

  if (isLoadingAuth || checkingAdmin) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 border-r border-border bg-bg-surface h-screen sticky top-0 overflow-y-auto">
        {/* Brand */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
          <IconKryptoKeLogo size={28} />
          <div>
            <p className="font-syne font-bold text-sm text-gradient">KryptoKe</p>
            <p className="font-outfit text-[10px] text-text-muted">Admin Dashboard</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <SidebarItem
              key={item.href}
              {...item}
              active={pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border">
          <p className="font-outfit text-[10px] text-text-muted">
            KryptoKe v{process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0"}
          </p>
        </div>
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 bg-bg-surface border border-border rounded-xl flex items-center justify-center"
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
            <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
              <IconKryptoKeLogo size={28} />
              <p className="font-syne font-bold text-sm text-gradient">Admin</p>
            </div>
            <nav className="px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => (
                <SidebarItem
                  key={item.href}
                  {...item}
                  active={pathname === item.href}
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

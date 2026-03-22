"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  IconHome,
  IconMarkets,
  IconTrade,
  IconEarn,
  IconProfile,
} from "@/components/icons";

interface NavItem {
  label: string;
  href: string;
  icon: React.FC<{ size?: number; className?: string }>;
  isTrade?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: IconHome },
  { label: "Markets", href: "/markets", icon: IconMarkets },
  { label: "Trade", href: "/trade", icon: IconTrade, isTrade: true },
  { label: "Earn", href: "/earn", icon: IconEarn },
  { label: "Wallet", href: "/me", icon: IconProfile },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);

        if (item.isTrade) {
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className="flex flex-col items-center justify-center gap-1 -mt-4"
              aria-label="Trade"
              aria-current={active ? "page" : undefined}
            >
              {/* Teal-to-gold gradient rounded square */}
              <div
                className={cn(
                  "w-[52px] h-[52px] rounded-[14px] flex items-center justify-center",
                  "shadow-[0_4px_20px_rgba(0,229,180,0.35)]",
                  "transition-transform active:scale-95"
                )}
                style={{ background: "linear-gradient(135deg, #00E5B4 0%, #F0B429 100%)" }}
              >
                <item.icon size={24} className="text-bg" />
              </div>
              <span
                className={cn(
                  "font-outfit text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-text-muted"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        }

        return (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className="flex flex-col items-center justify-center gap-1 flex-1 py-2"
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
          >
            <item.icon
              size={22}
              className={cn(
                "transition-colors",
                active ? "text-primary" : "text-text-muted"
              )}
            />
            <span
              className={cn(
                "font-outfit text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-text-muted"
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

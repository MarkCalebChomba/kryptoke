"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { apiGet } from "@/lib/api/client";
import {
  IconWallet, IconHelp, IconInfo, IconChevronRight, IconProfile,
  IconShield, IconChart,
} from "@/components/icons";
import { cn } from "@/lib/utils/cn";
import type { Announcement } from "@/types";

interface MenuItemProps {
  icon: React.FC<{ size?: number; className?: string }>;
  label: string;
  sublabel?: string;
  onClick: () => void;
  badge?: string;
}

function MenuItem({ icon: Icon, label, sublabel, onClick, badge }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3.5 w-full active:bg-bg-surface2 transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-bg-surface2 border border-border flex items-center justify-center flex-shrink-0">
        <Icon size={18} className="text-text-secondary" />
      </div>
      <div className="flex-1 text-left">
        <p className="font-outfit text-sm font-medium text-text-primary">{label}</p>
        {sublabel && <p className="font-outfit text-xs text-text-muted">{sublabel}</p>}
      </div>
      {badge && (
        <span className="bg-primary/10 text-primary font-outfit text-[10px] font-bold px-2 py-0.5 rounded mr-1">
          {badge}
        </span>
      )}
      <IconChevronRight size={16} className="text-text-muted" />
    </button>
  );
}

interface MenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MenuSheet({ isOpen, onClose }: MenuSheetProps) {
  const router = useRouter();

  const { data: announcements } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => apiGet<Announcement[]>("/market/announcements"),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  });

  const unreadAnnouncements = (announcements ?? []).length;

  function navigate(path: string) {
    onClose();
    // Small delay so close animation completes before navigation
    setTimeout(() => router.push(path), 100);
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Menu">
      {/* Announcements */}
      {unreadAnnouncements > 0 && (
        <div className="mx-4 my-3">
          {(announcements ?? []).slice(0, 2).map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex items-start gap-2 p-3 rounded-xl mb-2 border",
                a.type === "warning"
                  ? "bg-gold/5 border-gold/20"
                  : a.type === "promotion"
                  ? "bg-primary/5 border-primary/20"
                  : "bg-bg-surface2 border-border"
              )}
            >
              <div className={cn(
                "w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                a.type === "warning" ? "bg-gold" : a.type === "promotion" ? "bg-primary" : "bg-text-muted"
              )} />
              <div>
                <p className="font-outfit text-sm font-medium text-text-primary">{a.title}</p>
                <p className="font-outfit text-xs text-text-muted mt-0.5">{a.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="divide-y divide-border/50 pb-4">
        <MenuItem
          icon={IconWallet}
          label="My Wallet"
          sublabel="View all assets and balances"
          onClick={() => navigate("/me")}
        />
        <MenuItem
          icon={IconProfile}
          label="Profile & Settings"
          sublabel="Edit profile, security, preferences"
          onClick={() => navigate("/account")}
        />
        <MenuItem
          icon={IconShield}
          label="Security"
          sublabel="Password, PIN, and 2FA"
          onClick={() => navigate("/account?tab=security")}
        />
        <MenuItem
          icon={IconChart}
          label="Analysis"
          sublabel="PnL calendar and portfolio stats"
          onClick={() => navigate("/analysis")}
        />
        <MenuItem
          icon={IconHelp}
          label="FAQ"
          sublabel="Frequently asked questions"
          onClick={() => navigate("/faq")}
        />
        <MenuItem
          icon={IconInfo}
          label="About KryptoKe"
          sublabel={`v${process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0"} · Built for Kenya`}
          onClick={() => navigate("/about")}
        />
        <MenuItem
          icon={IconHelp}
          label="Terms of Use"
          sublabel="Read our terms and conditions"
          onClick={() => navigate("/terms")}
        />
        <MenuItem
          icon={IconHelp}
          label="Privacy Policy"
          sublabel="How we protect your data"
          onClick={() => navigate("/privacy")}
        />
      </div>
    </BottomSheet>
  );
}

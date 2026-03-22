"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { apiGet } from "@/lib/api/client";
import {
  IconWallet, IconHelp, IconInfo, IconChevronRight, IconProfile,
  IconShield, IconChart, IconGift, IconUsers, IconApi,
} from "@/components/icons";
import { cn } from "@/lib/utils/cn";
import type { Announcement } from "@/types";

function MenuItem({ icon: Icon, label, sublabel, onClick, badge }: {
  icon: React.FC<{ size?: number; className?: string }>;
  label: string; sublabel?: string; onClick: () => void; badge?: string;
}) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-3 px-4 py-3.5 w-full active:bg-bg-surface2 transition-colors">
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

export function MenuSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();

  const { data: announcements } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => apiGet<Announcement[]>("/market/announcements"),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  });

  // Navigate: close sheet THEN immediately push — no setTimeout
  // Using a flag to ensure the close animation doesn't interfere
  function navigate(path: string) {
    onClose();
    // Push on next microtask after state update, not after animation
    Promise.resolve().then(() => router.push(path));
  }

  const unreadAnnouncements = (announcements ?? []).length;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Menu" showCloseButton>
      {unreadAnnouncements > 0 && (
        <div className="mx-4 mb-3 divide-y divide-border/30 rounded-xl border border-border overflow-hidden">
          {(announcements ?? []).slice(0, 2).map((a) => (
            <div key={a.id} className="px-3 py-2.5 bg-bg-surface2">
              <p className="font-outfit text-xs font-semibold text-text-primary">{a.title}</p>
              <p className="font-outfit text-xs text-text-muted mt-0.5 line-clamp-1">{a.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="divide-y divide-border/50 pb-4">
        <MenuItem icon={IconWallet}   label="My Wallet"          sublabel="View all assets and balances"       onClick={() => navigate("/me")} />
        <MenuItem icon={IconProfile}  label="Profile & Settings"  sublabel="Edit profile, security, preferences" onClick={() => navigate("/account")} />
        <MenuItem icon={IconShield}   label="Security Center"    sublabel="2FA, password, device management"    onClick={() => navigate("/security")} />
        <MenuItem icon={IconShield}   label="Identity (KYC)"     sublabel="Verify identity to unlock limits"    onClick={() => navigate("/kyc")} />
        <MenuItem icon={IconChart}    label="Analysis"           sublabel="PnL calendar and portfolio stats"     onClick={() => navigate("/analysis")} />
        <MenuItem icon={IconUsers}    label="P2P Trading"        sublabel="Buy & sell crypto with M-Pesa"       onClick={() => navigate("/p2p")} />
        <MenuItem icon={IconGift}     label="Rewards"            sublabel="Complete tasks and earn USDT"        onClick={() => navigate("/rewards")} />
        <MenuItem icon={IconUsers}    label="Referral Program"   sublabel="Invite friends, earn 20% commission"  onClick={() => navigate("/referral")} />
        <MenuItem icon={IconApi}      label="Price Alerts"       sublabel="Get notified at your target prices"  onClick={() => navigate("/alerts")} />
        <MenuItem icon={IconApi}      label="Trading Bots"       sublabel="Automated Grid, DCA and more"        onClick={() => navigate("/bots")} />
        <MenuItem icon={IconApi}      label="Auto-Invest"        sublabel="Recurring DCA purchases"             onClick={() => navigate("/auto-invest")} />
        <MenuItem icon={IconApi}      label="Crypto Loans"       sublabel="Borrow USDT against your crypto"     onClick={() => navigate("/loans")} />
        <MenuItem icon={IconApi}      label="Notifications"      sublabel="Manage notification preferences"     onClick={() => navigate("/notifications")} />
        <MenuItem icon={IconHelp}     label="FAQ"                sublabel="Frequently asked questions"           onClick={() => navigate("/faq")} />
        <MenuItem icon={IconInfo}     label="About KryptoKe"     sublabel={`v${process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0"} · Built for Kenya`} onClick={() => navigate("/about")} />
        <MenuItem icon={IconHelp}     label="Terms of Use"       sublabel="Read our terms and conditions"        onClick={() => navigate("/terms")} />
        <MenuItem icon={IconHelp}     label="Privacy Policy"     sublabel="How we protect your data"             onClick={() => navigate("/privacy")} />
      </div>
    </BottomSheet>
  );
}

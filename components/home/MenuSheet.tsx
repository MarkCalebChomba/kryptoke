"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

interface MenuSheetProps { isOpen: boolean; onClose: () => void; }

interface WalletInfo {
  displayName?: string; uid?: string; kycStatus?: string;
  level?: string; totalXp?: number;
}

const LEVEL_COLORS: Record<string, string> = {
  Bronze:"#CD7F32", Silver:"#C0C0C0", Gold:"#F0B429", Platinum:"#00E5B4", Diamond:"#60A5FA",
};

// ── Icon tiles ─────────────────────────────────────────────────────────────────

interface TileProps { icon: string; label: string; onClick: () => void; dim?: boolean; }
function Tile({ icon, label, onClick, dim }: TileProps) {
  return (
    <button onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 p-2 rounded-2xl border border-border bg-bg-surface",
        "active:bg-bg-surface2 transition-colors",
        dim && "opacity-50"
      )}
      style={{ width: "calc(25% - 6px)", minWidth: 68 }}>
      <span className="text-2xl leading-none">{icon}</span>
      <span className="font-outfit text-[10px] text-text-muted font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wider px-1 mb-2">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function MenuSheet({ isOpen, onClose }: MenuSheetProps) {
  const router = useRouter();

  const { data: wallet } = useQuery<WalletInfo>({
    queryKey: ["wallet", "menu"],
    queryFn: () => apiGet<WalletInfo>("/wallet/info"),
    staleTime: 60_000,
    enabled: isOpen,
  });

  const { data: gamify } = useQuery<{ level: string; totalXp: number }>({
    queryKey: ["gamify", "me"],
    queryFn: () => apiGet<{ level: string; totalXp: number }>("/gamify/me"),
    staleTime: 60_000,
    enabled: isOpen,
  });

  function go(path: string) { onClose(); router.push(path); }

  const level = gamify?.level ?? "Bronze";
  const levelColor = LEVEL_COLORS[level] ?? "#F0B429";
  const uidShort = wallet?.uid ? `···${wallet.uid.slice(-6)}` : "";

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="">
      <div className="px-1 space-y-5 pb-6">

        {/* User card */}
        <div className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-bg-surface2 border border-border">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center text-xl flex-shrink-0">
            {wallet?.displayName ? wallet.displayName[0]?.toUpperCase() : "👤"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-syne font-bold text-sm text-text-primary truncate">
              {wallet?.displayName ?? "My Account"}
            </p>
            <p className="font-outfit text-[10px] text-text-muted">UID: {uidShort}</p>
            {wallet?.kycStatus === "verified" && (
              <span className="font-outfit text-[9px] bg-up/15 text-up px-1.5 py-0.5 rounded font-semibold">✓ Verified</span>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-price text-xs font-bold" style={{ color: levelColor }}>{level}</p>
            <p className="font-outfit text-[10px] text-text-muted">{gamify?.totalXp?.toLocaleString() ?? "—"} XP</p>
          </div>
        </div>

        {/* Finance */}
        <Section title="Finance">
          <Tile icon="💰" label="Deposit"  onClick={() => go("/deposit")} />
          <Tile icon="📤" label="Withdraw" onClick={() => go("/withdraw")} />
          <Tile icon="✈️" label="Transfer" onClick={() => go("/me")} />
          <Tile icon="⇄"  label="Convert"  onClick={() => go("/convert")} />
        </Section>

        {/* Trade */}
        <Section title="Trade">
          <Tile icon="📈" label="Spot"    onClick={() => go("/trade?mode=Spot")} />
          <Tile icon="⚡" label="Futures" onClick={() => go("/trade?mode=Futures")} />
          <Tile icon="🤝" label="P2P"     onClick={() => go("/p2p")} />
          <Tile icon="🔗" label="DEX"     onClick={() => go("/trade?mode=DEX")} />
        </Section>

        {/* Grow */}
        <Section title="Grow">
          <Tile icon="💎" label="Earn"        onClick={() => go("/earn")} />
          <Tile icon="🏦" label="Loans"       onClick={() => go("/loans")} />
          <Tile icon="🔄" label="Auto-Invest" onClick={() => go("/auto-invest")} />
          <Tile icon="🤖" label="Bots"        onClick={() => go("/trade?mode=Bots")} />
        </Section>

        {/* Account */}
        <Section title="Account">
          <Tile icon="🎁" label="Rewards"  onClick={() => go("/rewards")} />
          <Tile icon="👥" label="Referral" onClick={() => go("/referral")} />
          <Tile icon="📊" label="Analysis" onClick={() => go("/analysis")} />
          <Tile icon="🔑" label="API Keys" onClick={() => go("/account/api")} />
        </Section>

        {/* Support */}
        <Section title="Support">
          <Tile icon="❓" label="FAQ"       onClick={() => go("/about")} />
          <Tile icon="💬" label="Live Chat" onClick={() => go("/support")} />
          <Tile icon="ℹ️" label="About"     onClick={() => go("/about")} />
          <Tile icon="⚙️" label="Settings"  onClick={() => go("/account")} />
        </Section>

      </div>
    </BottomSheet>
  );
}

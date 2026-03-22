"use client";

import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useAuth, useAppStore } from "@/lib/store";
import { useWallet } from "@/lib/hooks/useWallet";
import { apiPost, clearStoredToken } from "@/lib/api/client";
import { formatKes, getUserInitials, maskPhone } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import {
  IconShield, IconEdit, IconCopy, IconChevronRight,
} from "@/components/icons";
import { useToastActions } from "@/components/shared/ToastContainer";

interface QuickProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickProfileSheet({ isOpen, onClose }: QuickProfileSheetProps) {
  const router = useRouter();
  const toast = useToastActions();
  const { user } = useAuth();
  const clearStore = useAppStore((s) => s.clearAuth);
  const { totalKes, totalUsd, kesBalance, usdtBalance, bnbBalance, isLoading } = useWallet();

  if (!user) return null;

  const initials = getUserInitials(user.displayName, user.email);
  const isKycVerified = user.kycStatus === "verified";

  function copyUid() {
    navigator.clipboard.writeText(user.uid);
    toast.copied();
  }

  async function handleSignOut() {
    onClose();
    try { await apiPost("/auth/logout"); } catch { /* ignore */ }
    clearStoredToken();
    clearStore();
    router.replace("/auth/login");
  }

  function goTo(path: string) {
    onClose();
    router.push(path);
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} maxHeight="85dvh">
      <div className="pb-6">

        {/* Avatar + name row */}
        <div className="flex items-center gap-4 px-5 pt-5 pb-4 border-b border-border">
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center overflow-hidden">
              {user.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : <span className="font-syne font-bold text-2xl text-primary">{initials}</span>}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-syne font-bold text-base text-text-primary truncate">
              {user.displayName ?? user.email.split("@")[0]}
            </p>
            <p className="font-outfit text-xs text-text-muted truncate">{user.email}</p>
            {user.phone && (
              <p className="font-outfit text-xs text-text-muted mt-0.5">{maskPhone(user.phone)}</p>
            )}
          </div>

          <button onClick={() => goTo("/me")}
            className="px-3 py-1.5 rounded-xl border border-border font-outfit text-xs text-text-secondary flex items-center gap-1">
            <IconEdit size={11} />
            Edit
          </button>
        </div>

        {/* UID + KYC status */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
          <button onClick={copyUid} className="flex items-center gap-2 flex-1">
            <span className="font-outfit text-xs text-text-muted">UID:</span>
            <span className="font-price text-xs text-text-secondary">{user.uid.slice(0, 18)}…</span>
            <IconCopy size={11} className="text-text-muted" />
          </button>
          <span className={cn(
            "text-[10px] font-outfit font-bold px-2 py-0.5 rounded-full border",
            isKycVerified ? "text-primary border-primary/30" : "text-gold border-gold/30"
          )}>
            {isKycVerified ? "Verified" : "Unverified"}
          </span>
        </div>

        {/* Portfolio summary */}
        <div className="px-5 py-4 border-b border-border">
          <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">Total Balance</p>
          {isLoading ? (
            <div className="skeleton h-7 w-32 mb-1" />
          ) : (
            <>
              <p className="font-price text-2xl font-medium text-text-primary">
                {formatKes(totalKes).replace("KSh ", "")}
                <span className="font-outfit text-sm text-text-muted ml-1">KSh</span>
              </p>
              <p className="font-outfit text-xs text-text-muted mt-0.5">
                ≈ ${parseFloat(totalUsd).toFixed(2)} USD
              </p>
            </>
          )}

          {/* Account breakdown */}
          <div className="flex gap-2 mt-3">
            {[
              { label: "KES", value: isLoading ? "—" : `${parseFloat(kesBalance).toFixed(2)}`, color: "#00E5B4" },
              { label: "USDT", value: isLoading ? "—" : `${parseFloat(usdtBalance).toFixed(4)}`, color: "#F0B429" },
              { label: "BNB", value: isLoading ? "—" : `${parseFloat(bnbBalance).toFixed(4)}`, color: "#4A90E2" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex-1 bg-bg-surface2 rounded-xl px-3 py-2 border-l-2" style={{ borderLeftColor: color }}>
                <p className="font-outfit text-[10px] text-text-muted uppercase">{label}</p>
                <p className="font-price text-xs text-text-primary mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="px-5 py-3 border-b border-border">
          <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">Quick Actions</p>
          <div className="space-y-0.5">
            {[
              { label: "My Assets", path: "/assets" },
              { label: "Transaction History", path: "/analysis" },
              { label: "Security Settings", path: "/me" },
            ].map(({ label, path }) => (
              <button key={label} onClick={() => goTo(path)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl active:bg-bg-surface2 transition-colors">
                <span className="font-outfit text-sm text-text-primary">{label}</span>
                <IconChevronRight size={14} className="text-text-muted" />
              </button>
            ))}
          </div>
        </div>

        {/* Sign out */}
        <div className="px-5 pt-4">
          <button onClick={handleSignOut}
            className="w-full py-3.5 rounded-2xl border border-down/30 bg-down/5 font-outfit font-semibold text-sm text-down active:opacity-80 transition-opacity">
            Sign Out
          </button>
        </div>

      </div>
    </BottomSheet>
  );
}

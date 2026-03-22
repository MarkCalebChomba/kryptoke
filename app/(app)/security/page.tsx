"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { useAuth } from "@/lib/store";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

interface SecurityStatus {
  hasTotp: boolean;
  hasPhone: boolean;
  antiPhishingCode: string | null;
  whitelistEnabled: boolean;
  kycLevel: number;
}

/* ─── Radial security score gauge ──────────────────────────────────────── */
function SecurityGauge({ score }: { score: number }) {
  const color = score >= 70 ? "#0ECB81" : score >= 40 ? "#F6A609" : "#F6465D";
  const label = score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";

  // SVG arc: circumference = 2*pi*45 ≈ 282.7, but we use half circle (pi*45 ≈ 141.4)
  const R = 45;
  const circumference = Math.PI * R; // semicircle
  const dashOffset    = circumference * (1 - score / 100);

  return (
    <div className="flex flex-col items-center py-4">
      <div className="relative w-36 h-20 overflow-hidden">
        <svg viewBox="0 0 100 55" className="w-full h-full">
          {/* Track */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none" stroke="#2B3139" strokeWidth="10" strokeLinecap="round"
          />
          {/* Progress */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${circumference * score / 100} ${circumference}`}
            strokeDashoffset="0"
          />
        </svg>
        {/* Score in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <p className="font-price text-2xl font-bold" style={{ color }}>{score}</p>
        </div>
      </div>
      <p className="font-syne font-bold text-sm mt-1" style={{ color }}>Security Level: {label}</p>
      <p className="font-outfit text-xs text-text-muted mt-0.5">Score: {score}/100</p>
    </div>
  );
}

/* ─── Security Feature Row ──────────────────────────────────────────────── */
function SecurityFeature({
  icon, title, description, enabled, onAction, actionLabel,
}: {
  icon: string;
  title: string;
  description: string;
  enabled: boolean;
  onAction: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-border/50 last:border-0">
      <div className="w-10 h-10 rounded-xl bg-bg-surface2 flex items-center justify-center text-xl flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-outfit text-sm font-medium text-text-primary">{title}</p>
        <p className="font-outfit text-xs text-text-muted mt-0.5 leading-tight">{description}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={cn(
          "text-[10px] font-bold font-outfit px-2 py-0.5 rounded-lg",
          enabled ? "text-up bg-up/10" : "text-gold bg-gold/10"
        )}>
          {enabled ? "Enabled" : "Disabled"}
        </span>
        <button
          onClick={onAction}
          className="font-outfit text-xs text-primary font-semibold px-2 py-1 rounded-lg active:bg-primary/10">
          {actionLabel ?? (enabled ? "Manage" : "Enable")}
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function SecurityPage() {
  const router = useRouter();
  const { user } = useAuth();

  const { data: secStatus } = useQuery({
    queryKey: ["security", "status"],
    queryFn: () => apiGet<SecurityStatus>("/account/security-status"),
    staleTime: 60_000,
  });

  // Calculate score
  const score = (() => {
    let s = 20; // base: password exists
    if (secStatus?.hasTotp)            s += 30;
    if (secStatus?.hasPhone)           s += 15;
    if (secStatus?.antiPhishingCode)   s += 10;
    if (secStatus?.whitelistEnabled)   s += 15;
    if ((secStatus?.kycLevel ?? 0) >= 2) s += 10;
    return Math.min(s, 100);
  })();

  const features = [
    {
      icon: "🔒",
      title: "Login Password",
      description: "Protect your account with a strong password",
      enabled: true,
      action: () => router.push("/account?tab=security"),
      label: "Change",
    },
    {
      icon: "📱",
      title: "Google Authenticator (2FA)",
      description: "Add a time-based one-time password for login and withdrawals",
      enabled: secStatus?.hasTotp ?? false,
      action: () => router.push("/account?tab=security"),
    },
    {
      icon: "📞",
      title: "SMS Authentication",
      description: "Verify actions with a code sent to your phone",
      enabled: secStatus?.hasPhone ?? false,
      action: () => router.push("/account?tab=security"),
    },
    {
      icon: "🎣",
      title: "Anti-Phishing Code",
      description: "A secret code included in all official KryptoKe emails",
      enabled: !!(secStatus?.antiPhishingCode),
      action: () => router.push("/account?tab=security"),
    },
    {
      icon: "✅",
      title: "Identity Verification (KYC)",
      description: "Unlock higher limits and all platform features",
      enabled: (secStatus?.kycLevel ?? 0) >= 2,
      action: () => router.push("/kyc"),
      label: secStatus?.kycLevel === 0 ? "Verify" : secStatus?.kycLevel === 1 ? "Upgrade" : "Verified",
    },
    {
      icon: "📋",
      title: "Address Whitelist",
      description: "Only allow withdrawals to pre-approved addresses",
      enabled: secStatus?.whitelistEnabled ?? false,
      action: () => router.push("/account?tab=security"),
    },
  ];

  return (
    <div className="screen">
      <TopBar title="Security Center" showBack />

      {/* Score gauge */}
      <div className="mx-4 mt-4 card">
        <SecurityGauge score={score} />
        {score < 70 && (
          <p className="font-outfit text-xs text-gold/90 bg-gold/8 border border-gold/20 rounded-lg px-3 py-2 text-center mt-2 leading-relaxed">
            {!secStatus?.hasTotp
              ? "Enable 2FA (Google Authenticator) to significantly improve your security score."
              : !secStatus?.antiPhishingCode
                ? "Set an anti-phishing code to protect yourself from email scams."
                : "Enable address whitelist to protect your funds from unauthorized withdrawals."}
          </p>
        )}
      </div>

      {/* Features */}
      <div className="mx-4 mt-4 card px-4">
        <p className="font-syne font-bold text-sm text-text-primary mb-1 pt-1">Security Features</p>
        {features.map(f => (
          <SecurityFeature
            key={f.title}
            icon={f.icon}
            title={f.title}
            description={f.description}
            enabled={f.enabled}
            onAction={f.action}
            actionLabel={f.label}
          />
        ))}
      </div>

      {/* Recent activity shortcut */}
      <div className="mx-4 mt-3 mb-6">
        <button
          onClick={() => router.push("/account?tab=activity")}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-bg-surface active:bg-bg-surface2">
          <div className="flex items-center gap-3">
            <span className="text-xl">🖥</span>
            <div className="text-left">
              <p className="font-outfit text-sm font-medium text-text-primary">Device & Login Activity</p>
              <p className="font-outfit text-xs text-text-muted">View active sessions and login history</p>
            </div>
          </div>
          <span className="text-text-muted">→</span>
        </button>
      </div>
    </div>
  );
}

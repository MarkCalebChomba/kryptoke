"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useAuth } from "@/lib/store";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { cn } from "@/lib/utils/cn";

interface SecurityStatus {
  hasTotp: boolean;
  hasPhone: boolean;
  antiPhishingCode: string | null;
  whitelistEnabled: boolean;
  kycLevel: number;
  fundPasswordSet: boolean;
}

/* ─── Security gauge ─────────────────────────────────────────────────────── */
function SecurityGauge({ score }: { score: number }) {
  const color = score >= 70 ? "#0ECB81" : score >= 40 ? "#F6A609" : "#F6465D";
  const label = score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";
  const R = 45;
  const circumference = Math.PI * R;
  return (
    <div className="flex flex-col items-center py-4">
      <div className="relative w-36 h-20 overflow-hidden">
        <svg viewBox="0 0 100 55" className="w-full h-full">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#2B3139" strokeWidth="10" strokeLinecap="round"/>
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${circumference * score / 100} ${circumference}`} strokeDashoffset="0"/>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <p className="font-price text-2xl font-bold" style={{ color }}>{score}</p>
        </div>
      </div>
      <p className="font-syne font-bold text-sm mt-1" style={{ color }}>Security Level: {label}</p>
      <p className="font-outfit text-xs text-text-muted mt-0.5">Score: {score}/100</p>
    </div>
  );
}

/* ─── Fund Password Setup Sheet ─────────────────────────────────────────── */
function FundPasswordSheet({ isOpen, onClose, isSet }: { isOpen: boolean; onClose: () => void; isSet: boolean }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const [step, setStep] = useState<"form" | "done">("form");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const PIN_REGEX = /^\d{6}$/;

  async function handleSubmit() {
    setError("");
    if (!PIN_REGEX.test(newPin)) { setError("Fund password must be exactly 6 digits"); return; }
    if (newPin !== confirmPin) { setError("Passwords don't match"); return; }
    if (isSet && !currentPin) { setError("Enter your current fund password first"); return; }

    setLoading(true);
    try {
      await apiPost("/auth/asset-pin", {
        pin: newPin,
        ...(isSet ? { currentPin } : {}),
      });
      setStep("done");
      qc.invalidateQueries({ queryKey: ["security", "status"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set fund password");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setStep("form");
    setCurrentPin(""); setNewPin(""); setConfirmPin(""); setError("");
    onClose();
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title={isSet ? "Change Fund Password" : "Set Fund Password"} showCloseButton>
      <div className="px-4 pb-8">
        {step === "done" ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-up/10 border border-up/30 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17L4 12" stroke="#0ECB81" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="font-syne font-bold text-base text-text-primary mb-1">Fund Password {isSet ? "Updated" : "Set"}</p>
            <p className="font-outfit text-sm text-text-muted mb-6">You can now use your fund password to authorize withdrawals.</p>
            <button onClick={handleClose} className="btn-primary w-full">Done</button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="px-3 py-3 rounded-xl bg-primary/5 border border-primary/15">
              <p className="font-outfit text-xs text-text-secondary leading-relaxed">
                Your <span className="font-semibold">fund password</span> is a 6-digit PIN required to authorize all withdrawals. 
                Keep it secret — it's different from your login password.
              </p>
            </div>

            {error && (
              <div className="px-3 py-2.5 rounded-xl bg-down/10 border border-down/20">
                <p className="font-outfit text-sm text-down">{error}</p>
              </div>
            )}

            {isSet && (
              <div>
                <label className="block font-outfit text-xs text-text-muted mb-1.5">Current Fund Password</label>
                <input
                  type="password" inputMode="numeric" maxLength={6}
                  value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="input-field font-price tracking-widest text-lg text-center"
                  placeholder="••••••"
                />
              </div>
            )}

            <div>
              <label className="block font-outfit text-xs text-text-muted mb-1.5">
                {isSet ? "New Fund Password" : "Fund Password"} <span className="text-text-muted">(6 digits)</span>
              </label>
              <input
                type="password" inputMode="numeric" maxLength={6}
                value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="input-field font-price tracking-widest text-lg text-center"
                placeholder="••••••"
              />
            </div>

            <div>
              <label className="block font-outfit text-xs text-text-muted mb-1.5">Confirm Fund Password</label>
              <input
                type="password" inputMode="numeric" maxLength={6}
                value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="input-field font-price tracking-widest text-lg text-center"
                placeholder="••••••"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || newPin.length < 6 || confirmPin.length < 6}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? "Saving…" : isSet ? "Update Fund Password" : "Set Fund Password"}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ─── Security Feature Row ──────────────────────────────────────────────── */
function SecurityFeature({ icon, title, description, enabled, onAction, actionLabel, highlight }: {
  icon: string; title: string; description: string; enabled: boolean;
  onAction: () => void; actionLabel?: string; highlight?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 py-3.5 border-b border-border/50 last:border-0",
      highlight && !enabled && "bg-gold/3 -mx-4 px-4 rounded-xl"
    )}>
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0",
        highlight && !enabled ? "bg-gold/15" : "bg-bg-surface2"
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-outfit text-sm font-medium text-text-primary">{title}</p>
          {highlight && !enabled && (
            <span className="font-outfit text-[9px] font-bold text-gold bg-gold/15 px-1.5 py-0.5 rounded-md uppercase tracking-wide">
              Required
            </span>
          )}
        </div>
        <p className="font-outfit text-xs text-text-muted mt-0.5 leading-tight">{description}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={cn(
          "text-[10px] font-bold font-outfit px-2 py-0.5 rounded-lg",
          enabled ? "text-up bg-up/10" : highlight ? "text-gold bg-gold/10" : "text-text-muted bg-bg-surface2"
        )}>
          {enabled ? "Enabled" : "Not Set"}
        </span>
        <button onClick={onAction} className="font-outfit text-xs text-primary font-semibold px-2 py-1 rounded-lg active:bg-primary/10">
          {actionLabel ?? (enabled ? "Change" : "Set Up")}
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function SecurityPage() {
  const router = useRouter();
  const [fundPasswordOpen, setFundPasswordOpen] = useState(false);

  const { data: secStatus, isLoading } = useQuery({
    queryKey: ["security", "status"],
    queryFn: () => apiGet<SecurityStatus>("/account/security-status"),
    staleTime: 60_000,
  });

  const score = (() => {
    let s = 20;
    if (secStatus?.hasTotp)           s += 25;
    if (secStatus?.hasPhone)          s += 10;
    if (secStatus?.antiPhishingCode)  s += 10;
    if (secStatus?.whitelistEnabled)  s += 10;
    if ((secStatus?.kycLevel ?? 0) >= 2) s += 10;
    if (secStatus?.fundPasswordSet)   s += 15;
    return Math.min(s, 100);
  })();

  const features = [
    {
      icon: "🔑",
      title: "Fund Password",
      description: "6-digit PIN required to authorize all withdrawals. Must be set before you can withdraw.",
      enabled: secStatus?.fundPasswordSet ?? false,
      action: () => setFundPasswordOpen(true),
      highlight: true,
    },
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
    <div className="screen overflow-y-auto">
      <TopBar title="Security Center" showBack />

      {/* Fund Password banner — shown when not set */}
      {!isLoading && !secStatus?.fundPasswordSet && (
        <div className="mx-4 mt-4 px-4 py-3.5 rounded-2xl bg-gold/8 border border-gold/25 flex items-start gap-3">
          <span className="text-xl mt-0.5">🔑</span>
          <div className="flex-1">
            <p className="font-outfit text-sm font-semibold text-gold mb-0.5">Fund Password Required</p>
            <p className="font-outfit text-xs text-text-secondary leading-relaxed">
              Set a 6-digit fund password before you can make withdrawals. This keeps your funds safe even if your account is compromised.
            </p>
            <button onClick={() => setFundPasswordOpen(true)} className="mt-2.5 px-3 py-1.5 rounded-lg bg-gold text-bg font-outfit text-xs font-bold active:opacity-80">
              Set Fund Password →
            </button>
          </div>
        </div>
      )}

      {/* Score gauge */}
      <div className="mx-4 mt-4 card">
        <SecurityGauge score={score} />
        {score < 70 && (
          <p className="font-outfit text-xs text-gold/90 bg-gold/8 border border-gold/20 rounded-lg px-3 py-2 text-center mt-2 leading-relaxed">
            {!secStatus?.fundPasswordSet
              ? "Set a Fund Password to enable withdrawals and improve your security."
              : !secStatus?.hasTotp
                ? "Enable 2FA (Google Authenticator) to significantly improve your security score."
                : "Set an anti-phishing code to protect yourself from email scams."}
          </p>
        )}
      </div>

      {/* Features */}
      <div className="mx-4 mt-4 card px-4 mb-6">
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
            highlight={f.highlight}
          />
        ))}
      </div>

      <FundPasswordSheet
        isOpen={fundPasswordOpen}
        onClose={() => setFundPasswordOpen(false)}
        isSet={secStatus?.fundPasswordSet ?? false}
      />
    </div>
  );
}

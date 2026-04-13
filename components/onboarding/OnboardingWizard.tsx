"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { apiPost } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";

type OnboardStep = "deposit" | "trade" | "pin";

interface OnboardingWizardProps {
  onComplete: () => void;
}

/* ─── Step dots ─────────────────────────────────────────────────────────── */
function StepDots({ step }: { step: OnboardStep }) {
  const steps: OnboardStep[] = ["deposit", "trade", "pin"];
  const current = steps.indexOf(step);
  return (
    <div className="flex items-center gap-2 justify-center mb-6">
      {steps.map((s, i) => (
        <div
          key={s}
          className={cn(
            "rounded-full transition-all duration-300",
            i < current
              ? "w-2 h-2 bg-primary/40"
              : i === current
              ? "w-6 h-2 bg-primary"
              : "w-2 h-2 bg-border-2"
          )}
        />
      ))}
    </div>
  );
}

/* ─── Step 1: Deposit KES ───────────────────────────────────────────────── */
function DepositStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center text-center">
      {/* Icon */}
      <div className="w-20 h-20 rounded-3xl bg-up/10 border border-up/20 flex items-center justify-center mb-5">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <path d="M12 4v16M4 12h16" stroke="#00E5B4" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      </div>
      <h2 className="font-syne font-bold text-xl text-text-primary mb-2">
        Fund your account
      </h2>
      <p className="font-outfit text-sm text-text-muted leading-relaxed mb-6 max-w-xs">
        Deposit KES via M-Pesa to get started. It takes under 1 minute and your USDT is
        credited instantly.
      </p>

      {/* Why deposit callout */}
      <div className="w-full card bg-up/5 border-up/20 text-left mb-6 space-y-2">
        {[
          { icon: "⚡", text: "STK push — no account numbers to type" },
          { icon: "💱", text: "Instantly converted to USDT at live rate" },
          { icon: "🔒", text: "Funds held securely in your KryptoKe wallet" },
        ].map(({ icon, text }) => (
          <div key={text} className="flex items-center gap-2">
            <span className="text-base">{icon}</span>
            <span className="font-outfit text-xs text-text-secondary">{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => { router.push("/deposit"); onNext(); }}
        className="btn-primary w-full max-w-xs mb-3"
      >
        Deposit via M-Pesa
      </button>
      <button onClick={onSkip} className="font-outfit text-sm text-text-muted">
        Skip for now
      </button>
    </div>
  );
}

/* ─── Step 2: Buy Crypto ────────────────────────────────────────────────── */
function TradeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-3xl bg-gold/10 border border-gold/20 flex items-center justify-center mb-5">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <path d="M4 17l4-4 4 4 8-8" stroke="#F0B429" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2 className="font-syne font-bold text-xl text-text-primary mb-2">
        Start trading
      </h2>
      <p className="font-outfit text-sm text-text-muted leading-relaxed mb-6 max-w-xs">
        Buy BTC, ETH, USDT and 50+ other coins. Prices shown in both USD and KES so
        you always know what you&apos;re paying.
      </p>

      {/* Mini coin strip */}
      <div className="w-full flex gap-2 justify-center mb-6">
        {[
          { symbol: "BTC", color: "#F7931A", icon: "₿" },
          { symbol: "ETH", color: "#627EEA", icon: "Ξ" },
          { symbol: "SOL", color: "#9945FF", icon: "◎" },
          { symbol: "BNB", color: "#F0B429", icon: "⬡" },
        ].map(({ symbol, color, icon }) => (
          <div
            key={symbol}
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-bg-surface border border-border"
          >
            <span className="text-lg" style={{ color }}>{icon}</span>
            <span className="font-outfit text-[10px] font-semibold text-text-muted">{symbol}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => { router.push("/trade"); onNext(); }}
        className="btn-primary w-full max-w-xs mb-3"
      >
        Go to Markets
      </button>
      <button onClick={onSkip} className="font-outfit text-sm text-text-muted">
        Skip for now
      </button>
    </div>
  );
}

/* ─── Step 3: Set up PIN ────────────────────────────────────────────────── */
function PinStep({ onComplete }: { onComplete: () => void }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="#00E5B4" strokeWidth="1.75"/>
          <path d="M7 11V7a5 5 0 0110 0v4" stroke="#00E5B4" strokeWidth="1.75" strokeLinecap="round"/>
          <circle cx="12" cy="16" r="1.5" fill="#00E5B4"/>
        </svg>
      </div>
      <h2 className="font-syne font-bold text-xl text-text-primary mb-2">
        Secure your assets
      </h2>
      <p className="font-outfit text-sm text-text-muted leading-relaxed mb-6 max-w-xs">
        Create a 6-digit asset PIN to protect withdrawals and transfers. You&apos;ll need
        it any time you move funds.
      </p>

      <div className="w-full card bg-primary/5 border-primary/20 text-left mb-6 space-y-2">
        {[
          { icon: "🔐", text: "Required for all withdrawals and transfers" },
          { icon: "📵", text: "Never shared — not even with KryptoKe staff" },
          { icon: "🔄", text: "Can be changed anytime in Security settings" },
        ].map(({ icon, text }) => (
          <div key={text} className="flex items-center gap-2">
            <span className="text-base">{icon}</span>
            <span className="font-outfit text-xs text-text-secondary">{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => { router.push("/account/security"); onComplete(); }}
        className="btn-primary w-full max-w-xs mb-3"
      >
        Set Up PIN
      </button>
      <button onClick={onComplete} className="font-outfit text-sm text-text-muted">
        Do this later
      </button>
    </div>
  );
}

/* ─── Main wizard ────────────────────────────────────────────────────────── */
export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<OnboardStep>("deposit");
  const updateUser = useAppStore((s) => s.updateUser);

  async function finishOnboarding() {
    try {
      const data = await apiPost<{ data: { onboardedAt: string } }>("/auth/onboarding-complete", {});
      // Update local Zustand user so wizard doesn't show again this session
      if (data?.data) updateUser(data.data as Parameters<typeof updateUser>[0]);
    } catch {
      // Non-fatal — mark locally done so wizard doesn't loop
    }
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col">
      {/* Progress header */}
      <div className="px-6 pt-safe pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-syne font-bold text-base text-text-primary">
              {step === "deposit" ? "Step 1 of 3"
                : step === "trade" ? "Step 2 of 3"
                : "Step 3 of 3"}
            </span>
          </div>
          <button
            onClick={finishOnboarding}
            className="font-outfit text-xs text-text-muted px-3 py-1 rounded-lg border border-border"
          >
            Skip all
          </button>
        </div>
        <StepDots step={step} />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 pb-8 flex flex-col justify-center">
        {step === "deposit" && (
          <DepositStep
            onNext={() => setStep("trade")}
            onSkip={() => setStep("trade")}
          />
        )}
        {step === "trade" && (
          <TradeStep
            onNext={() => setStep("pin")}
            onSkip={() => setStep("pin")}
          />
        )}
        {step === "pin" && (
          <PinStep onComplete={finishOnboarding} />
        )}
      </div>

      {/* Footer branding */}
      <div className="px-6 pb-8 pb-safe text-center">
        <p className="font-outfit text-xs text-text-muted opacity-50">
          KryptoKe — Built for Kenya 🇰🇪
        </p>
      </div>
    </div>
  );
}

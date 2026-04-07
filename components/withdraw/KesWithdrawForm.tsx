"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useKesWithdraw, useWithdrawLimits } from "@/lib/hooks/useWithdraw";
import { useWallet } from "@/lib/hooks/useWallet";
import { useAuth } from "@/lib/store";
import { apiGet } from "@/lib/api/client";
import { PinPad } from "@/components/auth/PinPad";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { cn } from "@/lib/utils/cn";
import {
  sanitizeNumberInput,
  isValidKenyanPhone,
  normalizeKenyanPhone,
  formatKes,
} from "@/lib/utils/formatters";
import { calculateWithdrawalFee, gt, lt } from "@/lib/utils/money";
import { IconCheck, IconX } from "@/components/icons";
import Big from "big.js";

type View = "form" | "pin" | "processing" | "success" | "failed";

export function KesWithdrawForm() {
  const router = useRouter();
  const { user } = useAuth();
  const walletData = useWallet();
  const { kesBalance } = walletData;
  const suspendedUntil = (walletData as unknown as { suspendedUntil?: string | null }).suspendedUntil;
  const suspensionReason = (walletData as unknown as { suspensionReason?: string | null }).suspensionReason;
  const kycStatus = walletData.kycStatus;
  const { data: limits } = useWithdrawLimits();
  const withdraw = useKesWithdraw();

  // Check if fund password is set
  const { data: secStatus } = useQuery({
    queryKey: ["security", "status"],
    queryFn: () => apiGet<{ fundPasswordSet: boolean }>("/account/security-status"),
    staleTime: 60_000,
  });

  // Pre-compute all blocking conditions with clear user-facing reasons
  const isSuspended = !!(suspendedUntil && new Date(suspendedUntil) > new Date());
  const isKycBlocked = kycStatus === "pending";
  const isLimitHit = parseFloat(limits?.remaining ?? "150000") <= 0;
  const hasNoBalance = parseFloat(kesBalance) <= 0;
  const fundPasswordMissing = secStatus && !secStatus.fundPasswordSet;

  const [view, setView] = useState<View>("form");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [pinError, setPinError] = useState<string | null>(null);

  const amountNum = parseFloat(amount) || 0;
  const { fee, netAmount } = amountNum > 0
    ? calculateWithdrawalFee(amount, "0.01")
    : { fee: "0", netAmount: "0" };

  const used = parseFloat(limits?.usedToday ?? "0");
  const dailyLimit = parseFloat(limits?.dailyLimit ?? "150000");
  const remaining = parseFloat(limits?.remaining ?? "150000");
  const usedPct = Math.min((used / dailyLimit) * 100, 100);

  const canSubmit =
    amountNum >= 10 &&
    isValidKenyanPhone(phone) &&
    gt(amount, "0") &&
    lt(amount, remaining.toString()) &&
    !gt(amount, kesBalance);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setView("pin");
  }

  async function handlePinComplete(pin: string) {
    setPinError(null);
    setView("processing");
    withdraw.submit(
      { amount: amountNum, phone: normalizeKenyanPhone(phone), assetPin: pin },
      {
        onError: (err) => {
          setPinError(err instanceof Error ? err.message : "PIN incorrect");
          setView("pin");
        },
      }
    );
  }

  // Watch for status changes
  if (withdraw.status === "completed" && view === "processing") setView("success");
  if ((withdraw.status === "failed" || withdraw.status === "refunded") && view === "processing") {
    setView("failed");
  }

  if (view === "pin") {
    return (
      <div className="px-4 py-6">
        <PinPad
          onComplete={handlePinComplete}
          onCancel={() => setView("form")}
          title="Enter Asset PIN"
          subtitle="Required to confirm withdrawal"
          error={pinError}
          isLoading={withdraw.isLoading}
        />
      </div>
    );
  }

  if (view === "processing") {
    return (
      <div className="flex flex-col items-center text-center px-6 py-12">
        <div className="w-16 h-16 rounded-full bg-mpesa/10 border border-mpesa/30 flex items-center justify-center mb-5">
          <div className="w-8 h-8 border-2 border-mpesa border-t-transparent rounded-full animate-spin" />
        </div>
        <h3 className="font-syne font-bold text-lg text-text-primary mb-2">Processing withdrawal</h3>
        <p className="font-outfit text-sm text-text-muted max-w-xs">
          Sending {formatKes(netAmount)} to your M-Pesa. This usually takes under a minute.
        </p>
      </div>
    );
  }

  if (view === "success") {
    return (
      <div className="flex flex-col items-center text-center px-6 py-12">
        <div className="w-16 h-16 rounded-full bg-up/10 border border-up/30 flex items-center justify-center mb-5">
          <IconCheck size={28} className="text-up" />
        </div>
        <h3 className="font-syne font-bold text-lg text-text-primary mb-2">Withdrawal sent</h3>
        <p className="font-outfit text-sm text-text-muted mb-1">
          M-Pesa ref: <span className="font-price text-text-primary">{withdraw.mpesaRef ?? "—"}</span>
        </p>
        <p className="font-outfit text-sm text-text-muted mb-6">
          <span className="font-price text-up">{formatKes(netAmount)}</span> sent to your phone
        </p>
        <button onClick={() => { withdraw.reset(); setView("form"); setAmount(""); }}
          className="btn-primary max-w-xs w-full">
          Done
        </button>
      </div>
    );
  }

  if (view === "failed") {
    return (
      <div className="flex flex-col items-center text-center px-6 py-12">
        <div className="w-16 h-16 rounded-full bg-down/10 border border-down/30 flex items-center justify-center mb-5">
          <IconX size={28} className="text-down" />
        </div>
        <h3 className="font-syne font-bold text-lg text-text-primary mb-2">Withdrawal failed</h3>
        <p className="font-outfit text-sm text-text-muted mb-6 leading-relaxed">
          {withdraw.status === "refunded"
            ? "The payment could not be processed. Your balance has been refunded."
            : "Something went wrong. Please try again."}
        </p>
        <button onClick={() => { withdraw.reset(); setView("form"); }}
          className="btn-primary max-w-xs w-full">
          Try Again
        </button>
      </div>
    );
  }

  // Unified blocker — show the most critical reason first
  const blocker = isSuspended
    ? {
        icon: "🚫",
        color: "down",
        title: "Account Suspended",
        body: suspensionReason ?? "Your account has been suspended.",
        sub: `Access restored ${new Date(suspendedUntil!).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        cta: null,
      }
    : fundPasswordMissing
    ? {
        icon: "🔑",
        color: "gold",
        title: "Fund Password Required",
        body: "Set a 6-digit fund password before you can make withdrawals.",
        sub: "Settings → Security Center → Fund Password",
        cta: { label: "Set Fund Password", action: () => router.push("/security") },
      }
    : isKycBlocked
    ? {
        icon: "🪪",
        color: "gold",
        title: "Identity Verification Required",
        body: "You need to complete KYC verification before withdrawing. This protects your account and complies with financial regulations.",
        sub: null,
        cta: { label: "Verify Identity", action: () => router.push("/kyc") },
      }
    : isLimitHit
    ? {
        icon: "📊",
        color: "gold",
        title: "Daily Limit Reached",
        body: `You've used your full daily withdrawal limit of KSh ${parseFloat(limits?.dailyLimit ?? "150000").toLocaleString()}. Limit resets at midnight.`,
        sub: `Used today: KSh ${parseFloat(limits?.usedToday ?? "0").toLocaleString()}`,
        cta: null,
      }
    : hasNoBalance
    ? {
        icon: "💳",
        color: "down",
        title: "Insufficient KES Balance",
        body: "You don't have any KES balance to withdraw. Deposit funds first or convert USDT to KES via the Convert tab.",
        sub: null,
        cta: { label: "Deposit Funds", action: () => router.push("/deposit") },
      }
    : null;

  if (blocker) {
    const borderColor = blocker.color === "down" ? "border-down/20 bg-down/5" : "border-gold/20 bg-gold/5";
    const iconBg = blocker.color === "down" ? "bg-down/10 border-down/20" : "bg-gold/10 border-gold/20";
    const textColor = blocker.color === "down" ? "text-down" : "text-gold";
    return (
      <div className="px-4 py-10 flex flex-col items-center text-center">
        <div className={`w-16 h-16 rounded-2xl ${iconBg} border flex items-center justify-center mb-5`}>
          <span className="text-3xl">{blocker.icon}</span>
        </div>
        <h3 className="font-syne font-bold text-lg text-text-primary mb-2">{blocker.title}</h3>
        <p className="font-outfit text-sm text-text-muted leading-relaxed mb-2 max-w-xs">{blocker.body}</p>
        {blocker.sub && <p className={`font-outfit text-xs ${textColor} mb-6`}>{blocker.sub}</p>}
        {!blocker.sub && <div className="mb-6" />}
        {blocker.cta && (
          <button onClick={blocker.cta.action} className="btn-primary max-w-xs w-full">
            {blocker.cta.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleFormSubmit} className="px-4 py-5 space-y-4">
      {/* Amount */}
      <div>
        <label className="block font-outfit text-sm text-text-secondary mb-1.5">Amount</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-price text-text-muted text-sm">KSh</span>
          <input
            type="text" inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(sanitizeNumberInput(e.target.value, 2))}
            className="input-field pl-14 font-price text-lg"
            placeholder="0.00"
          />
        </div>

        {/* Fee calc */}
        {amountNum > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between">
              <span className="font-outfit text-xs text-text-muted">Fee (1%)</span>
              <span className="font-price text-xs text-text-secondary">{formatKes(fee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-outfit text-xs text-text-muted">You receive</span>
              <span className="font-price text-xs text-up">{formatKes(netAmount)}</span>
            </div>
          </div>
        )}

        {/* Available */}
        <p className="font-outfit text-xs text-text-muted mt-2">
          Available: <span className="font-price text-text-primary">{formatKes(kesBalance)}</span>
        </p>
      </div>

      {/* Phone */}
      <div>
        <label className="block font-outfit text-sm text-text-secondary mb-1.5">M-Pesa phone</label>
        <input
          type="tel" inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={cn("input-field font-price", phone && !isValidKenyanPhone(phone) && "border-down")}
          placeholder="07XX XXX XXX"
        />
        {phone && !isValidKenyanPhone(phone) && (
          <p className="text-down font-outfit text-xs mt-1">Enter a valid Kenyan phone number</p>
        )}
      </div>

      {/* Daily limit bar */}
      {limits && (
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="font-outfit text-xs text-text-muted">Daily limit used</span>
            <span className="font-price text-xs text-text-secondary">
              {formatKes(limits.usedToday)} / {formatKes(limits.dailyLimit)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                usedPct > 80 ? "bg-down" : usedPct > 50 ? "bg-gold" : "bg-primary"
              )}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="font-outfit text-xs text-text-muted mt-1">
            Remaining today: <span className="font-price text-text-primary">{formatKes(limits.remaining)}</span>
          </p>
        </div>
      )}

      <button type="submit" disabled={!canSubmit} className="btn-primary">
        Continue to PIN
      </button>
    </form>
  );
}

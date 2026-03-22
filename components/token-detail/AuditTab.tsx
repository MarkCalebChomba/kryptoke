"use client";

import { useHoneypotCheck } from "@/lib/hooks/useTokenDetail";
import { truncateAddress } from "@/lib/utils/formatters";
import { useToastActions } from "@/components/shared/ToastContainer";
import { Skeleton } from "@/components/shared/Skeleton";
import { IconShield, IconCopy, IconCheck, IconX, IconAlertTriangle } from "@/components/icons";
import { cn } from "@/lib/utils/cn";

interface AuditTabProps {
  tokenAddress: string;
  isMajorCoin: boolean;
}

export function AuditTab({ tokenAddress, isMajorCoin }: AuditTabProps) {
  const toast = useToastActions();
  const { data: honeypot, isLoading } = useHoneypotCheck(
    isMajorCoin ? null : tokenAddress
  );

  if (isMajorCoin) {
    return (
      <div className="px-4 py-8 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-up/10 border border-up/30 flex items-center justify-center mb-4">
          <IconShield size={28} className="text-up" />
        </div>
        <h3 className="font-syne font-bold text-base text-text-primary mb-2">
          Established Asset
        </h3>
        <p className="font-outfit text-sm text-text-muted leading-relaxed max-w-xs">
          This is a well-established cryptocurrency with a long track record. No contract audit required.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-4 space-y-4">
        <Skeleton height={80} className="rounded-2xl" />
        <Skeleton height={60} className="rounded-2xl" />
        <Skeleton height={60} className="rounded-2xl" />
      </div>
    );
  }

  const riskColors = {
    low: { bg: "bg-up/10", border: "border-up/30", text: "text-up", icon: IconCheck },
    medium: { bg: "bg-gold/10", border: "border-gold/30", text: "text-gold", icon: IconAlertTriangle },
    high: { bg: "bg-down/10", border: "border-down/30", text: "text-down", icon: IconX },
    unknown: { bg: "bg-bg-surface2", border: "border-border", text: "text-text-secondary", icon: IconAlertTriangle },
  };

  const riskLevel = honeypot?.riskLevel ?? "unknown";
  const colors = riskColors[riskLevel];
  const RiskIcon = colors.icon;

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Honeypot status */}
      <div className={cn("card border flex items-start gap-3", colors.bg, colors.border)}>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border", colors.bg, colors.border)}>
          <RiskIcon size={20} className={colors.text} />
        </div>
        <div>
          <p className={cn("font-outfit font-semibold text-sm", colors.text)}>
            {honeypot?.isHoneypot ? "Honeypot Detected" : honeypot?.riskLevel === "low" ? "No Honeypot Detected" : "Audit Inconclusive"}
          </p>
          <p className="font-outfit text-xs text-text-muted mt-0.5 leading-relaxed">
            {honeypot?.message ?? "Could not verify contract"}
          </p>
        </div>
      </div>

      {/* Verification status */}
      <div className="card-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            honeypot?.isVerified ? "bg-up" : "bg-down"
          )} />
          <span className="font-outfit text-sm text-text-primary">Contract Verified</span>
        </div>
        <span className={cn(
          "font-outfit text-xs font-medium",
          honeypot?.isVerified ? "text-up" : "text-down"
        )}>
          {honeypot?.isVerified ? "Open Source" : "Unverified"}
        </span>
      </div>

      {/* Risk level */}
      <div className="card-2 flex items-center justify-between">
        <span className="font-outfit text-sm text-text-primary">Risk Level</span>
        <span className={cn("font-outfit text-xs font-semibold capitalize", colors.text)}>
          {riskLevel}
        </span>
      </div>

      {/* Deployer address */}
      {honeypot?.deployerAddress && (
        <div className="card-2">
          <p className="font-outfit text-xs text-text-muted mb-1.5">Deployer Address</p>
          <div className="flex items-center gap-2">
            <span className="font-price text-xs text-text-primary flex-1">
              {truncateAddress(honeypot.deployerAddress, 10, 6)}
            </span>
            <button
              onClick={() => { navigator.clipboard.writeText(honeypot.deployerAddress!); toast.copied(); }}
              className="text-text-muted hover:text-primary transition-colors"
              aria-label="Copy deployer address"
            >
              <IconCopy size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="font-outfit text-xs text-text-muted text-center leading-relaxed pt-2">
        Audit data is provided by honeypot.is. Always do your own research before trading.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatChange, priceDirection } from "@/lib/utils/formatters";
import { getCurrencyForCountry, formatFiat } from "@/lib/utils/currency";
import { IconEye, IconEyeOff } from "@/components/icons";
import { SkeletonPortfolioCard } from "@/components/shared/Skeleton";

interface PortfolioCardProps {
  totalKes: string;
  totalUsd: string;
  todayPnl?: string;
  sparklineData?: number[];
  isLoading: boolean;
  /** ISO 3166-1 alpha-2 country code from user profile. Default "KE". */
  countryCode?: string;
  /** 1 USD = N local-currency units (e.g. 130 for KES). */
  kesPerUsd?: string;
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 80, h = 24;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`
  );
  const color = positive ? "#00D68F" : "#FF4560";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true">
      <polyline points={points.join(" ")} stroke={color} strokeWidth="1.5"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PortfolioCard({
  totalKes,
  totalUsd,
  todayPnl = "0",
  sparklineData = [],
  isLoading,
  countryCode = "KE",
  kesPerUsd = "130",
}: PortfolioCardProps) {
  const [hidden, setHidden] = useState(false);
  if (isLoading) return <SkeletonPortfolioCard />;

  const dir = priceDirection(todayPnl);
  const currency = getCurrencyForCountry(countryCode);
  const isKe = countryCode === "KE";

  // For KE users: show KES value directly (already computed).
  // For everyone else: convert USD → local currency using the KES rate as a pivot
  // (totalUsd is already in USD, so multiply by local-currency-per-USD).
  // We don't have a per-currency forex rate yet — NEXUS N-A will add the full
  // payment-provider registry. Until then, for non-KE users we show USD equivalent
  // with a subtle "≈ USD" label, and fall back gracefully.
  let primaryDisplay: string;
  let primarySymbol: string;

  if (isKe) {
    primaryDisplay = hidden ? "••••••" : parseFloat(totalKes).toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    primarySymbol = "KSh";
  } else {
    // TODO(NEXUS): Replace with real forex rate once N-A payment-provider registry
    // exposes GET /api/v1/config/forex?base=USD&target={currency.code}
    primaryDisplay = hidden ? "••••••" : parseFloat(totalUsd).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    primarySymbol = "$";
  }

  // Secondary line: USD equivalent for KE, local-currency note for others
  const secondaryLine = isKe
    ? `≈ $${parseFloat(totalUsd).toFixed(2)}`
    : `≈ ${formatFiat(totalUsd, "KE", parseFloat(kesPerUsd))} · via USD`;

  return (
    <div className="mx-4 rounded-2xl border border-border bg-bg-surface px-4 py-3">
      <div className="flex items-start justify-between">
        {/* Left: value */}
        <div>
          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Total Balance
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="font-outfit text-sm text-text-muted font-medium">
              {hidden ? "" : primarySymbol}
            </span>
            <p className="font-price text-[28px] font-medium text-text-primary leading-none tracking-tight">
              {primaryDisplay}
            </p>
          </div>
          <p className="font-outfit text-xs text-text-muted mt-1">
            {hidden ? "••••" : secondaryLine}
            {todayPnl !== "0" && !hidden && (
              <span className={cn("ml-2 font-price text-xs",
                dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-muted")}>
                {formatChange(todayPnl)} today
              </span>
            )}
          </p>
          {!isKe && !hidden && (
            <p className="font-outfit text-[10px] text-text-muted mt-0.5 opacity-60">
              Local rate unavailable · showing USD
            </p>
          )}
        </div>

        {/* Right: sparkline + toggle */}
        <div className="flex flex-col items-end gap-2">
          <button onClick={() => setHidden((h) => !h)}
            className="tap-target text-text-muted" aria-label={hidden ? "Show balance" : "Hide balance"}>
            {hidden ? <IconEyeOff size={15} /> : <IconEye size={15} />}
          </button>
          <Sparkline data={sparklineData} positive={dir !== "down"} />
        </div>
      </div>
    </div>
  );
}

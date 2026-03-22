"use client";

import { cn } from "@/lib/utils/cn";
import { formatPrice, priceDirection } from "@/lib/utils/formatters";
import Big from "big.js";

interface AssetRowProps {
  symbol: string;
  name: string;
  iconUrl: string | null;
  amount: string;
  price: string;
  change: string;
  kesPerUsd: string;
  onEarn?: () => void;
  onTrade: () => void;
  onClick: () => void;
}

export function AssetRow({
  symbol, name, iconUrl, amount, price, change, kesPerUsd,
  onEarn, onTrade, onClick,
}: AssetRowProps) {
  const valueUsd = new Big(amount || "0").times(price || "0").toFixed(2);
  const valueKes = new Big(valueUsd).times(kesPerUsd || "130").toFixed(2);
  const dir = priceDirection(change);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 w-full active:bg-bg-surface2 transition-colors"
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-full bg-bg-surface2 border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
        {iconUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={iconUrl} alt={symbol} className="w-full h-full object-cover" />
          : <span className="font-price text-xs text-text-muted">{symbol.slice(0, 2)}</span>}
      </div>

      {/* Name */}
      <div className="flex-1 text-left min-w-0">
        <p className="font-outfit text-sm font-semibold text-text-primary">{symbol}</p>
        <p className="font-outfit text-xs text-text-muted truncate">{name}</p>
      </div>

      {/* Value */}
      <div className="text-right mr-2">
        <p className="font-price text-sm text-text-primary">{parseFloat(amount).toFixed(4)}</p>
        <p className="font-outfit text-xs text-text-muted">
          ≈ KSh {parseFloat(valueKes).toLocaleString()}
        </p>
      </div>

      {/* Change */}
      <span className={cn(
        "font-price text-xs flex-shrink-0 w-14 text-right",
        dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-muted"
      )}>
        {dir === "up" ? "+" : ""}{parseFloat(change).toFixed(2)}%
      </span>
    </button>
  );
}

"use client";

import { cn } from "@/lib/utils/cn";
import { formatKes, formatUsdt } from "@/lib/utils/formatters";

interface TileProps {
  label: string;
  value: string;
  subValue?: string;
  color: string;
  onClick: () => void;
  isLoading?: boolean;
}

function Tile({ label, value, subValue, color, onClick, isLoading }: TileProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 card-2 text-left active:scale-95 transition-transform",
        "border-l-2"
      )}
      style={{ borderLeftColor: color }}
    >
      <p className="font-outfit text-[10px] text-text-muted mb-1 uppercase tracking-wide">
        {label}
      </p>
      {isLoading ? (
        <div className="skeleton h-4 w-16 mb-1" />
      ) : (
        <p className="font-price text-sm font-medium text-text-primary leading-tight">
          {value}
        </p>
      )}
      {subValue && (
        <p className="font-outfit text-[10px] text-text-muted mt-0.5">{subValue}</p>
      )}
    </button>
  );
}

interface AllocationTilesProps {
  kesBalance: string;
  usdtBalance: string;
  earnBalance?: string;
  kesPerUsd: string;
  isLoading?: boolean;
  onFundingClick: () => void;
  onTradingClick: () => void;
  onEarnClick: () => void;
}

export function AllocationTiles({
  kesBalance,
  usdtBalance,
  earnBalance = "0",
  isLoading = false,
  onFundingClick,
  onTradingClick,
  onEarnClick,
}: AllocationTilesProps) {
  return (
    <div className="flex gap-2 mx-4">
      <Tile
        label="Funding"
        value={formatKes(kesBalance)}
        color="#00E5B4"
        onClick={onFundingClick}
        isLoading={isLoading}
      />
      <Tile
        label="Trading"
        value={formatUsdt(usdtBalance, 2)}
        color="#F0B429"
        onClick={onTradingClick}
        isLoading={isLoading}
      />
      <Tile
        label="Earn"
        value={formatUsdt(earnBalance, 2)}
        subValue="0.00% APR"
        color="#4A90E2"
        onClick={onEarnClick}
        isLoading={isLoading}
      />
    </div>
  );
}

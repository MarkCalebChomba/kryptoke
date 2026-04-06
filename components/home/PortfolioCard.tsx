"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatKes, formatChange, priceDirection } from "@/lib/utils/formatters";
import { IconEye, IconEyeOff } from "@/components/icons";
import { SkeletonPortfolioCard } from "@/components/shared/Skeleton";

interface PortfolioCardProps {
  totalKes: string;
  totalUsd: string;
  todayPnl?: string;
  sparklineData?: number[];
  isLoading: boolean;
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

export function PortfolioCard({ totalKes, totalUsd, todayPnl = "0", sparklineData = [],
  isLoading }: PortfolioCardProps) {
  const [hidden, setHidden] = useState(false);
  if (isLoading) return <SkeletonPortfolioCard />;

  const dir = priceDirection(todayPnl);

  return (
    <div className="mx-4 rounded-2xl border border-border bg-bg-surface px-4 py-3">
      <div className="flex items-start justify-between">
        {/* Left: value */}
        <div>
          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Total Balance
          </p>
          <p className="font-price text-[28px] font-medium text-text-primary leading-none tracking-tight">
            {hidden ? "••••••" : formatKes(totalKes).replace("KSh ", "")}
          </p>
          <p className="font-outfit text-xs text-text-muted mt-1">
            {hidden ? "••••" : `≈ $${parseFloat(totalUsd).toFixed(2)}`}
            {todayPnl !== "0" && !hidden && (
              <span className={cn("ml-2 font-price text-xs",
                dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-muted")}>
                {formatChange(todayPnl)} today
              </span>
            )}
          </p>
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

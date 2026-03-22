"use client";

import { useState } from "react";
import { TradingViewWidget, isTradingViewSymbol } from "@/components/charts/TradingViewWidget";
import { LightweightChart, TimeframeSelector } from "@/components/charts/LightweightChart";
import { cn } from "@/lib/utils/cn";
import type { ChartInterval } from "@/types";

const INDICATORS = ["MA", "EMA", "BOLL", "SAR", "VOL"] as const;
type Indicator = (typeof INDICATORS)[number];

interface ChartSectionProps {
  symbol: string;
  tokenAddress: string;
}

export function ChartSection({ symbol, tokenAddress }: ChartSectionProps) {
  const [interval, setInterval] = useState<ChartInterval>("1h");
  const [activeIndicators, setActiveIndicators] = useState<Indicator[]>(["VOL"]);
  const useTv = isTradingViewSymbol(symbol);

  function toggleIndicator(ind: Indicator) {
    setActiveIndicators((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind]
    );
  }

  return (
    <div className="bg-bg-surface border-b border-border">
      {/* Chart */}
      {useTv ? (
        <TradingViewWidget symbol={symbol} interval={interval} height={300} />
      ) : (
        <LightweightChart
          tokenAddress={tokenAddress}
          interval={interval}
          activeIndicators={activeIndicators as string[]}
          height={300}
        />
      )}

      {/* Timeframe row */}
      <div className="flex items-center justify-between px-2 py-1.5 border-t border-border">
        <TimeframeSelector active={interval} onChange={setInterval} />
      </div>

      {/* Indicators row — only for Lightweight Charts */}
      {!useTv && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar border-t border-border">
          {INDICATORS.map((ind) => (
            <button
              key={ind}
              onClick={() => toggleIndicator(ind)}
              className={cn(
                "flex-shrink-0 px-2.5 py-1 rounded-md font-outfit text-[11px] font-medium transition-all border",
                activeIndicators.includes(ind)
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "text-text-muted border-border"
              )}
            >
              {ind}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

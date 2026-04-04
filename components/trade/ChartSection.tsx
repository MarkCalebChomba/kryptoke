"use client";

import { useState, useRef, useCallback } from "react";
import { TradingViewWidget, isTradingViewSymbol } from "@/components/charts/TradingViewWidget";
import { LightweightChart, TimeframeSelector } from "@/components/charts/LightweightChart";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { cn } from "@/lib/utils/cn";
import type { ChartInterval } from "@/types";

const INDICATORS = ["MA", "EMA", "BOLL", "SAR", "VOL"] as const;
type Indicator = (typeof INDICATORS)[number];

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 520;
const DEFAULT_HEIGHT = 300;

interface ChartSectionProps {
  symbol: string;
  tokenAddress: string;
}

export function ChartSection({ symbol, tokenAddress }: ChartSectionProps) {
  const [interval, setInterval] = useState<ChartInterval>("1h");
  const [activeIndicators, setActiveIndicators] = useState<Indicator[]>(["VOL"]);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [fullscreen, setFullscreen] = useState(false);
  const useTv = isTradingViewSymbol(symbol);

  // Drag-to-resize handle
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientY = "touches" in e ? e.touches[0]!.clientY : e.clientY;
    dragRef.current = { startY: clientY, startH: height };

    const onMove = (ev: TouchEvent | MouseEvent) => {
      if (!dragRef.current) return;
      const y = "touches" in ev ? (ev as TouchEvent).touches[0]!.clientY : (ev as MouseEvent).clientY;
      const delta = y - dragRef.current.startY;
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragRef.current.startH + delta));
      setHeight(newH);
    };
    const onEnd = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchend", onEnd);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchend", onEnd);
  }, [height]);

  function toggleIndicator(ind: Indicator) {
    setActiveIndicators((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind]
    );
  }

  return (
    <>
      <div className="bg-bg-surface border-b border-border">
        {/* Resizable chart */}
        <div style={{ height }}>
          {useTv ? (
            <TradingViewWidget symbol={symbol} interval={interval} height={height} />
          ) : (
            <LightweightChart
              tokenAddress={tokenAddress}
              interval={interval}
              activeIndicators={activeIndicators as string[]}
              height={height}
            />
          )}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          className="flex items-center justify-center h-5 cursor-row-resize border-t border-border bg-bg-surface2/50 select-none"
          aria-label="Drag to resize chart"
        >
          <div className="flex gap-0.5">
            <span className="block w-8 h-[2px] rounded-full bg-border" />
          </div>
        </div>

        {/* Timeframe + fullscreen */}
        <div className="flex items-center justify-between px-2 py-1.5 border-t border-border">
          <TimeframeSelector active={interval} onChange={setInterval} />
          <button
            onClick={() => setFullscreen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded border border-border font-outfit text-[10px] text-text-muted ml-1 active:bg-bg-surface2"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
            Full
          </button>
        </div>

        {/* Indicators row */}
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

      {/* Fullscreen chart sheet */}
      <BottomSheet isOpen={fullscreen} onClose={() => setFullscreen(false)} maxHeight="100dvh">
        <div className="flex flex-col" style={{ height: "96dvh" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-syne font-bold text-sm text-text-primary">{symbol}/USDT Chart</span>
            <button onClick={() => setFullscreen(false)} className="tap-target text-text-muted">✕</button>
          </div>
          {/* Chart fills remaining */}
          <div className="flex-1 min-h-0" style={{ height: "calc(96dvh - 110px)" }}>
            {useTv ? (
              <TradingViewWidget symbol={symbol} interval={interval} height={Math.round(window?.innerHeight * 0.82) || 600} />
            ) : (
              <LightweightChart
                tokenAddress={tokenAddress}
                interval={interval}
                activeIndicators={activeIndicators as string[]}
                height={Math.round((typeof window !== "undefined" ? window.innerHeight : 700) * 0.82)}
              />
            )}
          </div>
          {/* Controls */}
          <div className="border-t border-border px-3 py-2">
            <TimeframeSelector active={interval} onChange={setInterval} />
          </div>
          {!useTv && (
            <div className="flex gap-1.5 px-3 pb-3 overflow-x-auto no-scrollbar">
              {INDICATORS.map((ind) => (
                <button
                  key={ind}
                  onClick={() => toggleIndicator(ind)}
                  className={cn(
                    "flex-shrink-0 px-2.5 py-1 rounded-md font-outfit text-[11px] font-medium border",
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
      </BottomSheet>
    </>
  );
}

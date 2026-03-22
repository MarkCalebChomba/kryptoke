"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import type { ChartInterval, OHLCV } from "@/types";

interface LightweightChartProps {
  tokenAddress: string;
  interval: ChartInterval;
  activeIndicators: string[];
  height?: number;
}

const INTERVAL_LABELS: Record<ChartInterval, string> = {
  "15m": "15m", "1h": "1H", "4h": "4H", "1D": "1D", "1W": "1W", "3m": "3M",
};

export function LightweightChart({
  tokenAddress,
  interval,
  activeIndicators,
  height = 300,
}: LightweightChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const candleSeriesRef = useRef<unknown>(null);

  const { data: candles, isLoading } = useQuery({
    queryKey: ["candles", tokenAddress, interval],
    queryFn: () =>
      apiGet<OHLCV[]>(`/market/candles/${tokenAddress}?interval=${interval}&limit=100`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const initChart = useCallback(async () => {
    if (!containerRef.current || chartRef.current) return;

    const lc = await import("lightweight-charts");
    const { createChart, ColorType } = lc;
    // v4 and v5 compatibility: v5 uses addSeries(CandlestickSeries), v4 uses addCandlestickSeries()
    const CandlestickSeries = (lc as Record<string, unknown>).CandlestickSeries as unknown;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#0E1420" },
        textColor: "#8A9CC0",
      },
      grid: {
        vertLines: { color: "#1C2840" },
        horzLines: { color: "#1C2840" },
      },
      crosshair: {
        vertLine: { color: "#243250", labelBackgroundColor: "#141D2E" },
        horzLine: { color: "#243250", labelBackgroundColor: "#141D2E" },
      },
      rightPriceScale: {
        borderColor: "#1C2840",
        textColor: "#8A9CC0",
      },
      timeScale: {
        borderColor: "#1C2840",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const seriesOpts = {
      upColor: "#00D68F",
      downColor: "#FF4560",
      borderUpColor: "#00D68F",
      borderDownColor: "#FF4560",
      wickUpColor: "#00D68F",
      wickDownColor: "#FF4560",
    };

    // Support both v4 (addCandlestickSeries) and v5 (addSeries + CandlestickSeries)
    const candleSeries = CandlestickSeries
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (chart as any).addSeries(CandlestickSeries, seriesOpts)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (chart as any).addCandlestickSeries(seriesOpts);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chart) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initChart().then((fn) => { cleanup = fn; });
    return () => cleanup?.();
  }, [initChart]);

  // Feed candle data
  useEffect(() => {
    if (!candles || !candleSeriesRef.current) return;

    const series = candleSeriesRef.current as {
      setData: (data: unknown[]) => void;
    };

    const formatted = candles
      .filter((c) => c.time && c.open && c.high && c.low && c.close)
      .map((c) => ({
        time: c.time as number,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
      }))
      .sort((a, b) => a.time - b.time);

    if (formatted.length > 0) {
      series.setData(formatted);
    }
  }, [candles]);

  return (
    <div className="relative w-full" style={{ height }}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-surface/80 z-10">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      {!isLoading && (!candles || candles.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-text-muted font-outfit text-sm">No chart data available</p>
        </div>
      )}
    </div>
  );
}

/* ─── Timeframe selector ────────────────────────────────────────────────── */

interface TimeframeSelectorProps {
  active: ChartInterval;
  onChange: (interval: ChartInterval) => void;
  intervals?: ChartInterval[];
}

const DEFAULT_INTERVALS: ChartInterval[] = ["15m", "1h", "4h", "1D", "1W"];

export function TimeframeSelector({
  active,
  onChange,
  intervals = DEFAULT_INTERVALS,
}: TimeframeSelectorProps) {
  return (
    <div className="flex gap-1 px-1">
      {intervals.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={`
            px-3 py-1.5 rounded-lg font-outfit text-xs font-medium transition-all
            ${active === tf
              ? "bg-primary/10 text-primary border border-primary/20"
              : "text-text-muted hover:text-text-secondary"}
          `}
        >
          {INTERVAL_LABELS[tf]}
        </button>
      ))}
    </div>
  );
}

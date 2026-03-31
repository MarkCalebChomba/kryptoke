"use client";

import { useEffect, useRef } from "react";
import type { ChartInterval } from "@/types";

// Major pairs served by TradingView
const TRADINGVIEW_SYMBOLS: Record<string, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  BNB: "BINANCE:BNBUSDT",
  SOL: "BINANCE:SOLUSDT",
  XRP: "BINANCE:XRPUSDT",
  ADA: "BINANCE:ADAUSDT",
  DOT: "BINANCE:DOTUSDT",
  MATIC: "BINANCE:MATICUSDT",
  LINK: "BINANCE:LINKUSDT",
  LTC: "BINANCE:LTCUSDT",
};

const TV_INTERVALS: Record<ChartInterval, string> = {
  "15m": "15",
  "1h": "60",
  "4h": "240",
  "1D": "D",
  "1W": "W",
  "3m": "3",
};

interface TradingViewWidgetProps {
  symbol: string;
  interval: ChartInterval;
  height?: number;
}

export function TradingViewWidget({
  symbol,
  interval,
  height = 300,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const tvSymbol = TRADINGVIEW_SYMBOLS[symbol.toUpperCase()] ?? `BINANCE:${symbol.toUpperCase()}USDT`;
  const tvInterval = TV_INTERVALS[interval] ?? "60";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Small delay to ensure DOM is fully mounted before TradingView script runs
    const timer = setTimeout(() => {
      if (!containerRef.current) return;

      // Clear previous widget
      containerRef.current.innerHTML = "";
      if (scriptRef.current) {
        scriptRef.current.remove();
        scriptRef.current = null;
      }

      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        autosize: true,
        symbol: tvSymbol,
        interval: tvInterval,
        timezone: "Africa/Nairobi",
        theme: "dark",
        style: "1",
        locale: "en",
        backgroundColor: "#0E1420",
        gridColor: "#1C2840",
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        hide_volume: false,
        support_host: "https://www.tradingview.com",
      });

      containerRef.current.appendChild(script);
      scriptRef.current = script;
    }, 50);

    return () => {
      clearTimeout(timer);
      if (scriptRef.current) {
        scriptRef.current.remove();
        scriptRef.current = null;
      }
    };
  }, [tvSymbol, tvInterval]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full"
      style={{ height }}
    />
  );
}

export function isTradingViewSymbol(symbol: string): boolean {
  return symbol.toUpperCase() in TRADINGVIEW_SYMBOLS;
}

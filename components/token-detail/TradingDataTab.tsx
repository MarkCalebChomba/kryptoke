"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { useRealtimeTable } from "@/lib/hooks/useRealtime";
import { useTicker } from "@/lib/hooks/useMarketData";
import { formatPrice, formatVolume, formatTimeAgo } from "@/lib/utils/formatters";
import { Skeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils/cn";

interface TradeItem {
  id: string;
  price: string;
  amount_in: string;
  side: "buy" | "sell";
  created_at: string;
}

interface TradingDataTabProps {
  symbol: string;
  tokenAddress: string;
}

export function TradingDataTab({ symbol, tokenAddress }: TradingDataTabProps) {
  const [recentTrades, setRecentTrades] = useState<TradeItem[]>([]);
  const { high, low, volume } = useTicker(`${symbol}USDT`);

  const { data: initialTrades, isLoading } = useQuery({
    queryKey: ["market", "trades", tokenAddress],
    queryFn: () => apiGet<TradeItem[]>(`/market/trades/${tokenAddress}`),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (initialTrades) setRecentTrades(initialTrades);
  }, [initialTrades]);

  // Subscribe to new trades in real time
  useRealtimeTable<TradeItem>({
    table: "trades",
    event: "INSERT",
    filter: `token_in=eq.${tokenAddress}`,
    onPayload: ({ new: trade }) => {
      setRecentTrades((prev) => [trade, ...prev].slice(0, 20));
    },
  });

  // Compute buy/sell split from recent trades
  const buys = recentTrades.filter((t) => t.side === "buy").length;
  const sells = recentTrades.filter((t) => t.side === "sell").length;
  const total = buys + sells || 1;
  const buyPct = Math.round((buys / total) * 100);
  const sellPct = 100 - buyPct;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* 24h stats */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "24h High", value: formatPrice(high) },
          { label: "24h Low",  value: formatPrice(low) },
          { label: "24h Volume", value: formatVolume(volume) },
          { label: "Volume (USDT)", value: formatVolume(parseFloat(volume) * parseFloat(high)) },
        ].map(({ label, value }) => (
          <div key={label} className="card-2">
            <p className="font-outfit text-[10px] text-text-muted uppercase">{label}</p>
            <p className="font-price text-sm text-text-primary mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Order flow */}
      <div className="card-2">
        <p className="font-outfit text-xs text-text-muted mb-2">Order Flow (last 20 trades)</p>
        <div className="flex h-2 rounded-full overflow-hidden mb-2">
          <div
            className="bg-up transition-all duration-500"
            style={{ width: `${buyPct}%` }}
          />
          <div className="bg-down flex-1 transition-all duration-500" />
        </div>
        <div className="flex justify-between">
          <span className="font-price text-xs text-up">Buy {buyPct}%</span>
          <span className="font-price text-xs text-down">Sell {sellPct}%</span>
        </div>
      </div>

      {/* Recent trades */}
      <div>
        <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">
          Recent Trades
        </p>

        {/* Column headers */}
        <div className="flex items-center px-2 py-1.5 border-b border-border">
          <span className="flex-1 font-outfit text-[10px] text-text-muted">Price</span>
          <span className="w-20 text-right font-outfit text-[10px] text-text-muted">Amount</span>
          <span className="w-20 text-right font-outfit text-[10px] text-text-muted">Time</span>
        </div>

        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-2">
              <Skeleton height={12} className="flex-1" />
              <Skeleton height={12} width={60} />
              <Skeleton height={12} width={50} />
            </div>
          ))
        ) : recentTrades.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-outfit text-sm text-text-muted">No trades yet</p>
          </div>
        ) : (
          recentTrades.map((trade, i) => (
            <div
              key={trade.id ?? i}
              className={cn(
                "flex items-center px-2 py-1.5 border-b border-border/30",
                i === 0 && "animate-fade-in"
              )}
            >
              <span className={cn(
                "flex-1 font-price text-xs",
                trade.side === "buy" ? "text-up" : "text-down"
              )}>
                {formatPrice(trade.price)}
              </span>
              <span className="w-20 text-right font-price text-xs text-text-secondary">
                {parseFloat(trade.amount_in).toFixed(4)}
              </span>
              <span className="w-20 text-right font-outfit text-xs text-text-muted">
                {formatTimeAgo(trade.created_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

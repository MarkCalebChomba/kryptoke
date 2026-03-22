"use client";

import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/formatters";
import { useOrderBook } from "@/lib/hooks/useTrades";
import { usePrices } from "@/lib/store";

interface OrderRowProps {
  price: string;
  quantity: string;
  depth: number;
  side: "ask" | "bid";
}

function OrderRow({ price, quantity, depth, side }: OrderRowProps) {
  return (
    <div className="relative flex items-center justify-between px-2 py-0.5 overflow-hidden">
      {/* Depth fill */}
      <div
        className={cn("depth-fill", side === "ask" ? "depth-fill-ask" : "depth-fill-bid")}
        style={{ width: `${Math.min(depth * 100, 100)}%` }}
      />
      <span className={cn(
        "font-price text-xs z-10",
        side === "ask" ? "text-down" : "text-up"
      )}>
        {formatPrice(price)}
      </span>
      <span className="font-price text-xs text-text-secondary z-10">
        {parseFloat(quantity).toFixed(4)}
      </span>
    </div>
  );
}

interface OrderBookProps {
  symbol: string;
  currentPrice: string;
  kesPerUsd: string;
}

export function OrderBook({ symbol, currentPrice, kesPerUsd }: OrderBookProps) {
  const { data: orderBook, isLoading } = useOrderBook(symbol);
  const { prices } = usePrices();

  const livePrice = prices[symbol] ?? currentPrice;
  const kesPrice = livePrice
    ? (parseFloat(livePrice) * parseFloat(kesPerUsd)).toFixed(2)
    : "—";

  if (isLoading || !orderBook) {
    return (
      <div className="flex flex-col h-full">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex justify-between px-2 py-0.5">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-3 w-12" />
          </div>
        ))}
      </div>
    );
  }

  const asks = [...(orderBook.asks ?? [])].reverse().slice(0, 8);
  const bids = (orderBook.bids ?? []).slice(0, 8);

  const totalBidQty = bids.reduce((s, b) => s + parseFloat(b.quantity), 0);
  const totalAskQty = asks.reduce((s, a) => s + parseFloat(a.quantity), 0);
  const total = totalBidQty + totalAskQty;
  const bidPct = total > 0 ? Math.round((totalBidQty / total) * 100) : 50;
  const askPct = 100 - bidPct;

  return (
    <div className="flex flex-col h-full text-[11px]">
      {/* Column headers */}
      <div className="flex justify-between px-2 py-1 border-b border-border">
        <span className="font-outfit text-text-muted">Price(USDT)</span>
        <span className="font-outfit text-text-muted">Qty</span>
      </div>

      {/* Asks */}
      <div className="flex-1 flex flex-col justify-end">
        {asks.map((ask, i) => (
          <OrderRow key={i} {...ask} side="ask" />
        ))}
      </div>

      {/* Spread / current price */}
      <div className="py-1.5 px-2 border-y border-border bg-bg-surface2">
        <p className="font-price text-sm font-medium text-up text-center leading-tight">
          {formatPrice(livePrice)}
        </p>
        <p className="font-outfit text-[10px] text-text-muted text-center">
          ≈ KSh {parseFloat(kesPrice).toLocaleString()}
        </p>
        <p className="font-outfit text-[10px] text-text-muted text-center mt-0.5">
          Spread: {orderBook.spread}
        </p>
      </div>

      {/* Bids */}
      <div className="flex-1">
        {bids.map((bid, i) => (
          <OrderRow key={i} {...bid} side="bid" />
        ))}
      </div>

      {/* Buy/Sell ratio bar */}
      <div className="px-2 py-1.5 border-t border-border">
        <div className="flex h-1.5 rounded-full overflow-hidden mb-1">
          <div
            className="bg-up transition-all duration-500"
            style={{ width: `${bidPct}%` }}
          />
          <div
            className="bg-down flex-1 transition-all duration-500"
          />
        </div>
        <div className="flex justify-between">
          <span className="font-price text-[10px] text-up">B {bidPct}%</span>
          <span className="font-price text-[10px] text-down">S {askPct}%</span>
        </div>
      </div>
    </div>
  );
}

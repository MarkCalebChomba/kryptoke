"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/formatters";
import { useOrderBook } from "@/lib/hooks/useTrades";
import { usePrices } from "@/lib/store";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { priceDirection } from "@/lib/utils/formatters";

// ── Types ──────────────────────────────────────────────────────────────────────
type OrderBookView = "both" | "bids" | "asks";

interface OrderEntry {
  price: string;
  quantity: string;
  depth: number;
}

// ── Clickable Row ──────────────────────────────────────────────────────────────
function OrderRow({
  price, quantity, depth, side, total, compact = false, onClick,
}: {
  price: string; quantity: string; depth: number;
  side: "ask" | "bid"; total?: string; compact?: boolean;
  onClick?: (price: string, quantity: string) => void;
}) {
  return (
    <button
      className="relative flex items-center justify-between w-full px-2 py-[3px] overflow-hidden active:opacity-70"
      onClick={() => onClick?.(price, quantity)}
    >
      {/* Depth bar */}
      <div
        className={cn("absolute inset-y-0 right-0 transition-all duration-300", side === "ask" ? "bg-down/12" : "bg-up/12")}
        style={{ width: `${Math.min(depth * 100, 100)}%` }}
      />
      <span className={cn("font-price text-xs z-10 tabular-nums", side === "ask" ? "text-down" : "text-up")}>
        {formatPrice(price)}
      </span>
      <span className="font-price text-xs text-text-secondary z-10 tabular-nums">
        {parseFloat(quantity).toFixed(3)}
      </span>
      {!compact && total && (
        <span className="font-price text-[10px] text-text-muted z-10 tabular-nums w-14 text-right">
          {parseFloat(total).toFixed(2)}
        </span>
      )}
    </button>
  );
}

// ── Full orderbook sheet ───────────────────────────────────────────────────────
function FullOrderBookSheet({ isOpen, onClose, symbol, asks, bids, spread, livePrice, kesPrice, onRowClick }: {
  isOpen: boolean; onClose: () => void; symbol: string;
  asks: OrderEntry[]; bids: OrderEntry[]; spread: string;
  livePrice: string; kesPrice: string;
  onRowClick?: (price: string, qty: string) => void;
}) {
  const [view, setView] = useState<OrderBookView>("both");

  const displayAsks = [...asks].reverse().slice(0, view === "bids" ? 0 : 30);
  const displayBids = bids.slice(0, view === "asks" ? 0 : 30);

  const asksWithTotal = displayAsks.map((a, i) => ({
    ...a,
    total: displayAsks.slice(0, i + 1).reduce((s, x) => s + parseFloat(x.quantity), 0).toFixed(4),
  }));
  const bidsWithTotal = displayBids.map((b, i) => ({
    ...b,
    total: displayBids.slice(0, i + 1).reduce((s, x) => s + parseFloat(x.quantity), 0).toFixed(4),
  }));

  const totalBidQty = bids.slice(0, 20).reduce((s, b) => s + parseFloat(b.quantity), 0);
  const totalAskQty = asks.slice(0, 20).reduce((s, a) => s + parseFloat(a.quantity), 0);
  const total = totalBidQty + totalAskQty || 1;
  const bidPct = Math.round((totalBidQty / total) * 100);

  function handleRowClick(price: string, qty: string) {
    onRowClick?.(price, qty);
    onClose();
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} maxHeight="92dvh">
      <div className="flex flex-col h-[85dvh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-syne font-bold text-sm text-text-primary">{symbol} Order Book</span>
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(["both", "bids", "asks"] as OrderBookView[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={cn("px-3 py-1 font-outfit text-xs font-medium transition-colors capitalize",
                  view === v ? "bg-primary/10 text-primary" : "text-text-muted")}>
                {v === "both" ? "All" : v === "bids" ? "Buys" : "Sells"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-2 py-1.5 bg-bg-surface2 border-b border-border">
          <span className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Price (USDT)</span>
          <span className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Qty</span>
          <span className="font-outfit text-[10px] text-text-muted uppercase tracking-wide w-14 text-right">Total</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view !== "bids" && (
            <div>
              <div className="px-2 py-1 bg-down/5 border-b border-down/10">
                <span className="font-outfit text-[10px] text-down font-medium uppercase tracking-wide">Sell Orders · tap to set price</span>
              </div>
              {asksWithTotal.map((ask, i) => (
                <OrderRow key={i} {...ask} side="ask" onClick={handleRowClick} />
              ))}
            </div>
          )}

          {view === "both" && (
            <div className="px-3 py-2 border-y border-border bg-bg-surface2 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-price text-sm font-bold text-up">{formatPrice(livePrice)}</p>
                  <p className="font-outfit text-[10px] text-text-muted">≈ KSh {parseFloat(kesPrice).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-outfit text-[10px] text-text-muted">Spread</p>
                  <p className="font-price text-xs text-text-secondary">{spread}</p>
                </div>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden mt-2">
                <div className="bg-up transition-all" style={{ width: `${bidPct}%` }} />
                <div className="bg-down flex-1" />
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="font-price text-[10px] text-up">B {bidPct}%</span>
                <span className="font-price text-[10px] text-down">S {100 - bidPct}%</span>
              </div>
            </div>
          )}

          {view !== "asks" && (
            <div>
              {view !== "both" && (
                <div className="px-2 py-1 bg-up/5 border-b border-up/10">
                  <span className="font-outfit text-[10px] text-up font-medium uppercase tracking-wide">Buy Orders · tap to set price</span>
                </div>
              )}
              {bidsWithTotal.map((bid, i) => (
                <OrderRow key={i} {...bid} side="bid" onClick={handleRowClick} />
              ))}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Compact orderbook ──────────────────────────────────────────────────────────
interface OrderBookProps {
  symbol: string;
  currentPrice: string;
  kesPerUsd: string;
  onPriceClick?: (price: string, qty: string) => void;
}

export function OrderBook({ symbol, currentPrice, kesPerUsd, onPriceClick }: OrderBookProps) {
  const { data: orderBook, isLoading } = useOrderBook(symbol);
  const { prices } = usePrices();
  const [fullOpen, setFullOpen] = useState(false);
  const [view, setView] = useState<OrderBookView>("both");

  const livePrice = prices[symbol.replace("USDT", "")] ?? currentPrice;
  const kesPrice = livePrice !== "0" ? (parseFloat(livePrice) * parseFloat(kesPerUsd)).toFixed(0) : "0";

  if (isLoading || !orderBook) {
    return (
      <div className="flex flex-col h-full p-1">
        <div className="flex gap-1 px-1 py-1 border-b border-border mb-1">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-5 w-10 rounded" />)}
        </div>
        {Array.from({ length: 21 }).map((_, i) => (
          <div key={i} className="flex justify-between px-2 py-[3px]">
            <div className="skeleton h-3 w-14" />
            <div className="skeleton h-3 w-10" />
          </div>
        ))}
      </div>
    );
  }

  const rawAsks = [...(orderBook.asks ?? [])];
  const rawBids = orderBook.bids ?? [];
  const asks = rawAsks.slice(0, 10);
  const bids = rawBids.slice(0, 10);

  const totalBidQty = bids.reduce((s, b) => s + parseFloat(b.quantity), 0);
  const totalAskQty = asks.reduce((s, a) => s + parseFloat(a.quantity), 0);
  const total = totalBidQty + totalAskQty || 1;
  const bidPct = Math.round((totalBidQty / total) * 100);

  const displayAsks = view === "bids" ? [] : [...asks].reverse();
  const displayBids = view === "asks" ? [] : bids;

  function handleRowClick(price: string, qty: string) {
    onPriceClick?.(price, qty);
  }

  return (
    <>
      <div className="flex flex-col h-full text-[11px]">
        {/* Header */}
        <div className="flex items-center justify-between px-1.5 py-1 border-b border-border">
          <div className="flex rounded-md overflow-hidden border border-border/60">
            {(["both", "bids", "asks"] as OrderBookView[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={cn("px-2 py-0.5 font-outfit text-[10px] font-medium transition-colors",
                  view === v ? "bg-primary/10 text-primary" : "text-text-muted")}>
                {v === "both" ? "All" : v === "bids" ? "B" : "S"}
              </button>
            ))}
          </div>
          <button onClick={() => setFullOpen(true)}
            className="px-2 py-0.5 rounded border border-border/60 font-outfit text-[10px] text-text-muted active:bg-bg-surface2">
            Full
          </button>
        </div>

        {/* Column headers */}
        <div className="flex justify-between px-2 py-0.5 bg-bg-surface2/50">
          <span className="font-outfit text-[10px] text-text-muted">Price</span>
          <span className="font-outfit text-[10px] text-text-muted">Qty</span>
        </div>

        {/* Asks */}
        <div className="flex flex-col justify-end" style={{ flex: view === "bids" ? 0 : view === "asks" ? 1 : "1 1 0" }}>
          {displayAsks.map((ask, i) => (
            <OrderRow key={i} {...ask} side="ask" compact onClick={handleRowClick} />
          ))}
        </div>

        {/* Spread */}
        <div className="py-1.5 px-2 border-y border-border bg-bg-surface2">
          <p className="font-price text-sm font-bold text-up text-center tabular-nums leading-tight">
            {formatPrice(livePrice)}
          </p>
          <p className="font-outfit text-[10px] text-text-muted text-center">
            KSh {parseInt(kesPrice).toLocaleString()}
          </p>
        </div>

        {/* Bids */}
        <div style={{ flex: view === "asks" ? 0 : "1 1 0" }}>
          {displayBids.map((bid, i) => (
            <OrderRow key={i} {...bid} side="bid" compact onClick={handleRowClick} />
          ))}
        </div>

        {/* Ratio bar */}
        <div className="px-2 py-1.5 border-t border-border mt-auto">
          <div className="flex h-1 rounded-full overflow-hidden mb-0.5">
            <div className="bg-up transition-all duration-500" style={{ width: `${bidPct}%` }} />
            <div className="bg-down flex-1" />
          </div>
          <div className="flex justify-between">
            <span className="font-price text-[10px] text-up">B {bidPct}%</span>
            <span className="font-price text-[10px] text-down">S {100 - bidPct}%</span>
          </div>
        </div>
      </div>

      <FullOrderBookSheet
        isOpen={fullOpen}
        onClose={() => setFullOpen(false)}
        symbol={symbol}
        asks={rawAsks}
        bids={rawBids}
        spread={orderBook.spread}
        livePrice={livePrice}
        kesPrice={kesPrice}
        onRowClick={handleRowClick}
      />
    </>
  );
}

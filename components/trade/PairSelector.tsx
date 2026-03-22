"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useMarketOverview } from "@/lib/hooks/useMarketData";
import { usePrices } from "@/lib/store";
import { formatPrice, formatChange, priceDirection } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import { IconSearch } from "@/components/icons";

// Major Binance pairs always shown
const MAJOR_PAIRS = [
  { symbol: "BTC", address: "BTCUSDT", name: "Bitcoin" },
  { symbol: "ETH", address: "ETHUSDT", name: "Ethereum" },
  { symbol: "BNB", address: "BNBUSDT", name: "BNB" },
  { symbol: "SOL", address: "SOLUSDT", name: "Solana" },
  { symbol: "XRP", address: "XRPUSDT", name: "XRP" },
];

interface PairSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symbol: string, address: string) => void;
  currentSymbol: string;
}

export function PairSelector({
  isOpen,
  onClose,
  onSelect,
  currentSymbol,
}: PairSelectorProps) {
  const [query, setQuery] = useState("");
  const { data: tokens } = useMarketOverview();
  const { prices, priceChanges } = usePrices();

  const allPairs = [
    ...MAJOR_PAIRS.map((p) => ({
      symbol: p.symbol,
      address: p.address,
      name: p.name,
      price: prices[`${p.symbol}USDT`] ?? "0",
      change: priceChanges[`${p.symbol}USDT`] ?? "0",
      iconUrl: null as string | null,
    })),
    ...(tokens ?? []).map((t) => ({
      symbol: t.symbol,
      address: t.address,
      name: t.name,
      price: prices[`${t.symbol}USDT`] ?? t.price,
      change: priceChanges[`${t.symbol}USDT`] ?? "0",
      iconUrl: t.iconUrl,
    })),
  ];

  const filtered = allPairs.filter(
    (p) =>
      p.symbol.toLowerCase().includes(query.toLowerCase()) ||
      p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} maxHeight="88dvh">
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <IconSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search coin pairs"
            className="input-field pl-9 text-sm"
            autoFocus
          />
        </div>
      </div>

      <div className="overflow-y-auto max-h-[72vh] divide-y divide-border/50">
        {filtered.map((pair) => {
          const dir = priceDirection(pair.change);
          const isActive = pair.symbol === currentSymbol;

          return (
            <button
              key={pair.address}
              onClick={() => {
                onSelect(pair.symbol, pair.address);
                onClose();
              }}
              className={cn(
                "flex items-center gap-3 w-full px-4 py-3 transition-colors",
                isActive ? "bg-primary/5" : "active:bg-bg-surface2"
              )}
            >
              <div className="w-8 h-8 rounded-full bg-bg-surface2 border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                {pair.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pair.iconUrl} alt={pair.symbol} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-price text-xs text-text-muted">
                    {pair.symbol.slice(0, 2)}
                  </span>
                )}
              </div>
              <div className="flex-1 text-left">
                <p className={cn(
                  "font-outfit text-sm font-semibold",
                  isActive ? "text-primary" : "text-text-primary"
                )}>
                  {pair.symbol}
                  <span className="text-text-muted font-normal">/USDT</span>
                </p>
                <p className="font-outfit text-xs text-text-muted">{pair.name}</p>
              </div>
              <div className="text-right">
                <p className="font-price text-sm text-text-primary">{formatPrice(pair.price)}</p>
                <span className={cn(
                  "font-price text-[11px]",
                  dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-muted"
                )}>
                  {formatChange(pair.change)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

"use client";

import { useState, useMemo } from "react";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { apiGet } from "@/lib/api/client";
import { useQuery } from "@tanstack/react-query";
import { formatPrice, formatChange, priceDirection } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import { IconSearch, IconStarFilled, IconStar } from "@/components/icons";
import { usePreferences } from "@/lib/store";

// ── Category tabs ──────────────────────────────────────────────────────────────

type MarketCategory = "Favourites" | "All" | "Gainers" | "Hot" | "New";

const CATEGORY_TABS: { id: MarketCategory; label: string; color: string }[] = [
  { id: "Favourites", label: "★ Saved",   color: "text-gold border-gold/40 bg-gold/5" },
  { id: "All",        label: "All",        color: "text-primary border-primary/40 bg-primary/5" },
  { id: "Gainers",    label: "↑ Gainers",  color: "text-up border-up/40 bg-up/5" },
  { id: "Hot",        label: "🔥 Hot",     color: "text-orange-400 border-orange-400/40 bg-orange-400/5" },
];

interface Coin {
  symbol: string;
  name: string;
  logo_url: string;
  price: string;
  change_24h: string;
  volume_24h: string;
}

interface PairSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symbol: string, address: string) => void;
  currentSymbol: string;
}

export function PairSelector({ isOpen, onClose, onSelect, currentSymbol }: PairSelectorProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketCategory>("All");
  const { isFavorite, toggleFavorite } = usePreferences();

  const { data: coins, isLoading } = useQuery({
    queryKey: ["market", "coins", "pair-selector"],
    queryFn: () => apiGet<Coin[]>("/market/coins?page=1&limit=100&tab=all"),
    staleTime: 30_000,
    enabled: isOpen,
  });

  const { data: gainers } = useQuery({
    queryKey: ["market", "coins", "gainers"],
    queryFn: () => apiGet<Coin[]>("/market/coins?page=1&limit=50&tab=gainers"),
    staleTime: 60_000,
    enabled: isOpen && category === "Gainers",
  });

  const { data: hot } = useQuery({
    queryKey: ["market", "coins", "hot"],
    queryFn: () => apiGet<Coin[]>("/market/coins?page=1&limit=50&tab=hot"),
    staleTime: 60_000,
    enabled: isOpen && category === "Hot",
  });

  const baseList = useMemo(() => {
    if (category === "Gainers") return gainers ?? coins ?? [];
    if (category === "Hot")     return hot ?? coins ?? [];
    return coins ?? [];
  }, [category, coins, gainers, hot]);

  const filtered = useMemo(() => {
    let list = baseList;
    if (category === "Favourites") {
      list = list.filter((c) => isFavorite(c.symbol));
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((c) =>
        c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [baseList, category, query, isFavorite]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} maxHeight="92dvh">
      <div className="flex flex-col h-[88dvh]">
        {/* Search bar */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pairs…"
              className="input-field pl-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Category tabs — visually distinct with colored borders */}
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto no-scrollbar">
          {CATEGORY_TABS.map(({ id, label, color }) => (
            <button
              key={id}
              onClick={() => setCategory(id)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-full font-outfit text-xs font-semibold border transition-all",
                category === id
                  ? color
                  : "text-text-muted border-border bg-transparent"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Column headers */}
        <div className="flex items-center justify-between px-4 py-1.5 border-y border-border bg-bg-surface2/50">
          <span className="font-outfit text-[10px] text-text-muted uppercase tracking-wide flex-1">Pair</span>
          <span className="font-outfit text-[10px] text-text-muted uppercase tracking-wide w-20 text-right">Price</span>
          <span className="font-outfit text-[10px] text-text-muted uppercase tracking-wide w-16 text-right">24h %</span>
          <div className="w-8" />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex flex-col gap-1 p-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton w-8 h-8 rounded-full" />
                  <div className="flex-1">
                    <div className="skeleton h-3 w-16 mb-1" />
                    <div className="skeleton h-2.5 w-12" />
                  </div>
                  <div className="skeleton h-3 w-16" />
                  <div className="skeleton h-3 w-12" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-outfit text-sm text-text-muted">
                {category === "Favourites" ? "No saved pairs yet — star a coin" : `No results for "${query}"`}
              </p>
            </div>
          )}

          {filtered.map((coin) => {
            const dir = priceDirection(coin.change_24h);
            const isActive = coin.symbol === currentSymbol;
            const isFav = isFavorite(coin.symbol);

            return (
              <button
                key={coin.symbol}
                onClick={() => {
                  onSelect(coin.symbol, `${coin.symbol}USDT`);
                  onClose();
                }}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-2.5 transition-colors",
                  isActive ? "bg-primary/5" : "active:bg-bg-surface2"
                )}
              >
                {/* Icon */}
                <div className="w-8 h-8 rounded-full bg-bg-surface2 border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {coin.logo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={coin.logo_url} alt={coin.symbol} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    : <span className="font-price text-[10px] text-text-muted">{coin.symbol.slice(0, 2)}</span>
                  }
                </div>

                {/* Name */}
                <div className="flex-1 text-left min-w-0">
                  <p className={cn("font-outfit text-sm font-semibold truncate", isActive ? "text-primary" : "text-text-primary")}>
                    {coin.symbol}
                    <span className="text-text-muted font-normal text-xs">/USDT</span>
                  </p>
                  <p className="font-outfit text-[10px] text-text-muted truncate">{coin.name}</p>
                </div>

                {/* Price */}
                <div className="w-20 text-right flex-shrink-0">
                  <p className="font-price text-xs font-medium text-text-primary tabular-nums">
                    {formatPrice(coin.price)}
                  </p>
                </div>

                {/* 24h change */}
                <div className="w-16 text-right flex-shrink-0">
                  <span className={cn(
                    "inline-block font-price text-xs px-1.5 py-0.5 rounded font-semibold tabular-nums",
                    dir === "up"   ? "bg-up/10 text-up"
                    : dir === "down" ? "bg-down/10 text-down"
                    : "text-text-muted"
                  )}>
                    {formatChange(coin.change_24h)}
                  </span>
                </div>

                {/* Star */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(coin.symbol); }}
                  className="w-8 h-8 flex items-center justify-center flex-shrink-0 tap-target"
                  aria-label={isFav ? "Remove favourite" : "Add favourite"}
                >
                  {isFav
                    ? <IconStarFilled size={14} className="text-gold" />
                    : <IconStar size={14} className="text-text-muted" />
                  }
                </button>
              </button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}

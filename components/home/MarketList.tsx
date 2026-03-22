"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatPrice, formatVolume, formatChange, priceDirection } from "@/lib/utils/formatters";
import { usePrices, usePreferences } from "@/lib/store";
import { SkeletonCoinRow } from "@/components/shared/Skeleton";
import { IconStarFilled } from "@/components/icons";

type MarketTab = "Hot" | "Favorites" | "Gainers" | "New";

interface MarketData {
  symbol: string;
  name: string;
  price: string;
  change: string;
  volume: string;
  iconUrl: string | null;
  address: string;
  isNew: boolean;
  isSeed: boolean;
}

// Inline coin row — reads live prices directly from WS store for instant updates
function CoinRow({ coin, showChange, onClick }: {
  coin: MarketData;
  showChange: "1h" | "24h";
  onClick: () => void;
}) {
  const { prices, priceChanges, priceChanges1h, volumes } = usePrices();
  const { isFavorite } = usePreferences();

  const ticker    = `${coin.symbol}USDT`;
  const price     = prices[ticker]          ?? coin.price;
  const change24h = priceChanges[ticker]    ?? coin.change;
  const change1h  = priceChanges1h[ticker]  ?? "0";
  const volume    = volumes[ticker]         ?? coin.volume;
  const change    = showChange === "1h" ? change1h : change24h;
  const dir       = priceDirection(change);
  const fav       = isFavorite(coin.address);

  return (
    <button onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 w-full active:bg-bg-surface2 transition-colors">
      <div className="w-8 h-8 rounded-full bg-bg-surface2 border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
        {coin.iconUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={coin.iconUrl} alt={coin.symbol} className="w-full h-full object-cover" loading="lazy" />
          : <span className="font-price text-[10px] font-bold text-text-muted">{coin.symbol.slice(0, 2)}</span>}
      </div>

      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-outfit font-semibold text-sm text-text-primary">{coin.symbol}</span>
          <span className="font-outfit text-xs text-text-muted">/USDT</span>
          {coin.isNew && <span className="text-[9px] font-outfit font-bold text-primary bg-primary/10 px-1 py-0.5 rounded">NEW</span>}
          {coin.isSeed && <span className="text-[9px] font-outfit font-bold text-down bg-down/10 px-1 py-0.5 rounded">SEED</span>}
          {fav && <IconStarFilled size={9} className="text-gold" />}
        </div>
        <p className="font-outfit text-[10px] text-text-muted">{coin.name} · {formatVolume(volume)}</p>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="font-price text-sm font-medium text-text-primary tabular-nums">{formatPrice(price)}</p>
        <span className={cn(
          "inline-block text-[10px] font-price font-semibold mt-0.5 px-2 py-0.5 rounded-lg tabular-nums",
          dir === "up"   ? "bg-up/20 text-up ring-1 ring-up/30" :
          dir === "down" ? "bg-down/20 text-down ring-1 ring-down/30" :
          "bg-bg-surface2 text-text-muted"
        )}>
          {formatChange(change)}
        </span>
      </div>
    </button>
  );
}

interface MarketListProps {
  data: MarketData[];
  isLoading: boolean;
  onSeeAll: () => void;
  onCoinClick: (address: string, symbol: string) => void;
}

const TABS: MarketTab[] = ["Hot", "Favorites", "Gainers", "New"];

// Major coins to always show on home even if not in DB yet
const ALWAYS_SHOW = ["BTC","ETH","BNB","SOL","XRP","DOGE","ADA","AVAX","TRX","DOT","LINK","MATIC"];

export function MarketList({ data, isLoading, onSeeAll, onCoinClick }: MarketListProps) {
  const [activeTab,  setActiveTab]  = useState<MarketTab>("Hot");
  const [showChange, setShowChange] = useState<"1h" | "24h">("24h");
  const [expanded,   setExpanded]   = useState(false);
  const { prices, priceChanges } = usePrices();
  const { isFavorite } = usePreferences();

  // Merge DB tokens with must-show major coins (fill gaps with WS-only entries)
  const dbSymbols = new Set(data.map(c => c.symbol));
  const extraCoins: MarketData[] = ALWAYS_SHOW
    .filter(s => !dbSymbols.has(s))
    .filter(s => prices[`${s}USDT`]) // only include if WS has a price
    .map(s => ({
      symbol: s, name: s, price: prices[`${s}USDT`] ?? "0",
      change: priceChanges[`${s}USDT`] ?? "0",
      volume: "0", iconUrl: null, address: `${s}USDT`, isNew: false, isSeed: false,
    }));

  const allCoins = [...data, ...extraCoins];

  const filtered = (() => {
    switch (activeTab) {
      case "Favorites":
        return allCoins.filter(c => isFavorite(c.address));
      case "Gainers":
        return [...allCoins]
          .filter(c => parseFloat(priceChanges[`${c.symbol}USDT`] ?? c.change) > 0)
          .sort((a, b) => parseFloat(priceChanges[`${b.symbol}USDT`] ?? b.change) - parseFloat(priceChanges[`${a.symbol}USDT`] ?? a.change));
      case "New":
        return allCoins.filter(c => c.isNew || parseFloat(priceChanges[`${c.symbol}USDT`] ?? c.change) > 8);
      default:
        return allCoins;
    }
  })();

  const visibleCount = expanded ? filtered.length : 8;
  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-1.5">
        <h2 className="font-syne font-bold text-sm text-text-primary">Markets</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(["1h", "24h"] as const).map((t) => (
              <button key={t} onClick={() => setShowChange(t)}
                className={cn("px-2 py-1 font-outfit text-[10px] font-medium transition-colors",
                  showChange === t ? "bg-primary/10 text-primary" : "text-text-muted")}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={onSeeAll} className="font-outfit text-xs text-primary font-medium">
            See all →
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-1 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("flex-shrink-0 px-3 py-1.5 rounded-lg font-outfit text-xs font-medium transition-all",
              activeTab === tab
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-text-muted border border-transparent")}>
            {tab}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="flex items-center px-4 py-1 border-b border-border">
        <p className="flex-1 font-outfit text-[9px] text-text-muted uppercase tracking-wide">Coin / Volume</p>
        <p className="w-20 text-right font-outfit text-[9px] text-text-muted uppercase tracking-wide">Price</p>
        <p className="w-16 text-right font-outfit text-[9px] text-text-muted uppercase tracking-wide">{showChange} %</p>
      </div>

      {/* Rows */}
      {isLoading
        ? Array.from({ length: 6 }).map((_, i) => <SkeletonCoinRow key={i} />)
        : visible.length === 0
          ? <div className="py-8 text-center"><p className="text-text-muted font-outfit text-sm">No coins found</p></div>
          : visible.map((coin) => (
              <CoinRow
                key={coin.address}
                coin={coin}
                showChange={showChange}
                onClick={() => onCoinClick(coin.address, coin.symbol)}
              />
            ))
      }

      {/* Show more / less */}
      {!isLoading && filtered.length > 8 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full py-2.5 font-outfit text-xs text-primary text-center border-t border-border/40 active:bg-bg-surface2">
          {expanded ? "Show less ↑" : `Show ${filtered.length - 8} more ↓`}
        </button>
      )}
    </div>
  );
}

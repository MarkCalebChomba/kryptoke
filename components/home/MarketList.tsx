"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatPrice, formatVolume, formatChange, priceDirection } from "@/lib/utils/formatters";
import { usePrices, usePreferences } from "@/lib/store";
import { SkeletonCoinRow } from "@/components/shared/Skeleton";
import { IconStarFilled } from "@/components/icons";

type MarketTab = "Hot" | "Favorites" | "New" | "Gainers";

interface CoinRowProps {
  symbol: string;
  name: string;
  iconUrl: string | null;
  volume: string;
  price: string;
  change24h: string;
  change1h: string;
  address: string;
  isFavorite: boolean;
  isNew?: boolean;
  isSeed?: boolean;
  showChange: "1h" | "24h";
  onClick: () => void;
}

function CoinRow({ symbol, name, iconUrl, volume, price, change24h, change1h, isNew, isSeed, isFavorite, showChange, onClick }: CoinRowProps) {
  const change = showChange === "1h" ? change1h : change24h;
  const dir = priceDirection(change);

  return (
    <button onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 w-full active:bg-bg-surface2 transition-colors">
      {/* Icon */}
      <div className="w-8 h-8 rounded-full bg-bg-surface2 border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
        {iconUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={iconUrl} alt={symbol} className="w-full h-full object-cover" />
          : <span className="font-price text-[10px] text-text-muted">{symbol.slice(0, 2)}</span>}
      </div>

      {/* Name + volume */}
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-outfit font-semibold text-sm text-text-primary">{symbol}</span>
          <span className="font-outfit text-xs text-text-muted">/USDT</span>
          {isNew && <span className="text-[9px] font-outfit font-bold text-primary bg-primary/10 px-1 py-0.5 rounded">NEW</span>}
          {isSeed && <span className="text-[9px] font-outfit font-bold text-down bg-down/10 px-1 py-0.5 rounded">SEED</span>}
          {isFavorite && <IconStarFilled size={9} className="text-gold" />}
        </div>
        <p className="font-outfit text-[10px] text-text-muted">
          Vol {formatVolume(volume)}
        </p>
      </div>

      {/* Price + change */}
      <div className="text-right flex-shrink-0">
        <p className="font-price text-sm font-medium text-text-primary tabular-nums">{formatPrice(price)}</p>
        <span className={cn(
          "inline-block text-[10px] font-price font-semibold mt-0.5 px-2 py-0.5 rounded-lg tabular-nums",
          dir === "up" ? "bg-up/20 text-up ring-1 ring-up/30" :
          dir === "down" ? "bg-down/20 text-down ring-1 ring-down/30" :
          "bg-bg-surface2 text-text-muted"
        )}>
          {formatChange(change)}
        </span>
      </div>
    </button>
  );
}

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

interface MarketListProps {
  data: MarketData[];
  isLoading: boolean;
  onSeeAll: () => void;
  onCoinClick: (address: string, symbol: string) => void;
}

const TABS: MarketTab[] = ["Hot", "Favorites", "New", "Gainers"];

// Top coins to always show
const MAJOR_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "TRXUSDT"];

const LIST_PAGE_SIZE = 50;

export function MarketList({ data, isLoading, onSeeAll, onCoinClick }: MarketListProps) {
  const [activeTab, setActiveTab] = useState<MarketTab>("Hot");
  const [showChange, setShowChange] = useState<"1h" | "24h">("24h");
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const { prices, priceChanges, priceChanges1h, volumes } = usePrices();
  const { isFavorite } = usePreferences();

  // Reset visible count on tab change
  const handleTabChange = (tab: MarketTab) => {
    setActiveTab(tab);
    setVisibleCount(LIST_PAGE_SIZE);
  };

  // Enrich DB tokens with live data
  const enriched = data.map((coin) => {
    const ticker = `${coin.symbol}USDT`;
    return {
      ...coin,
      price: prices[ticker] ?? coin.price,
      change: priceChanges[ticker] ?? coin.change,
      change1h: priceChanges1h[ticker] ?? "0",
      volume: volumes[ticker] ?? coin.volume,
    };
  });

  // Add major pairs not already in DB tokens
  const existingSymbols = new Set(enriched.map((c) => `${c.symbol}USDT`));
  const majorCoins = MAJOR_SYMBOLS
    .filter((sym) => !existingSymbols.has(sym))
    .map((sym) => {
      const base = sym.replace("USDT", "");
      return {
        symbol: base, name: base,
        price: prices[sym] ?? "0",
        change: priceChanges[sym] ?? "0",
        change1h: priceChanges1h[sym] ?? "0",
        volume: volumes[sym] ?? "0",
        iconUrl: null, address: sym, isNew: false, isSeed: false,
      };
    });

  const allCoins = [...enriched, ...majorCoins];

  const filtered = (() => {
    switch (activeTab) {
      case "Favorites": return allCoins.filter((c) => isFavorite(c.address));
      case "New": return allCoins.filter((c) => c.isNew);
      case "Gainers": return [...allCoins].sort((a, b) => parseFloat(b.change) - parseFloat(a.change));
      default: return allCoins;
    }
  })();

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-2">
        <h2 className="font-syne font-bold text-base text-text-primary">Markets</h2>
        <div className="flex items-center gap-2">
          {/* 1h / 24h toggle */}
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
            See all
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-1 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button key={tab} onClick={() => handleTabChange(tab)}
            className={cn("flex-shrink-0 px-3 py-1.5 rounded-lg font-outfit text-xs font-medium transition-all",
              activeTab === tab ? "bg-primary/10 text-primary border border-primary/20" : "text-text-muted")}>
            {tab}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="flex items-center px-4 py-1 border-b border-border">
        <p className="flex-1 font-outfit text-[9px] text-text-muted uppercase tracking-wide">Name / Volume</p>
        <p className="w-20 text-right font-outfit text-[9px] text-text-muted uppercase tracking-wide">Price</p>
        <p className="w-16 text-right font-outfit text-[9px] text-text-muted uppercase tracking-wide">{showChange}</p>
      </div>

      {/* Rows */}
      {isLoading
        ? Array.from({ length: 5 }).map((_, i) => <SkeletonCoinRow key={i} />)
        : visible.length === 0
          ? <div className="py-8 text-center"><p className="text-text-muted font-outfit text-sm">No coins found</p></div>
          : visible.map((coin) => (
              <CoinRow key={coin.address} {...coin}
                change24h={coin.change}
                change1h={(coin as { change1h?: string }).change1h ?? "0"}
                showChange={showChange}
                isFavorite={isFavorite(coin.address)}
                onClick={() => onCoinClick(coin.address, coin.symbol)} />
            ))}

      {/* Load more */}
      {hasMore && !isLoading && (
        <button
          onClick={() => setVisibleCount((n) => n + LIST_PAGE_SIZE)}
          className="w-full py-3 font-outfit text-xs text-primary font-semibold border-t border-border active:bg-bg-surface2 transition-colors">
          Load more ({filtered.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

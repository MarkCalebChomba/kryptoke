"use client";

import { cn } from "@/lib/utils/cn";
import { formatPrice, formatVolume, formatChange, priceDirection } from "@/lib/utils/formatters";
import { usePrices, usePreferences } from "@/lib/store";
import { IconStar, IconStarFilled } from "@/components/icons";

interface MarketRowProps {
  symbol: string;
  name: string;
  address: string;
  basePrice: string;
  baseChange: string;
  volume: string;
  iconUrl: string | null;
  isNew: boolean;
  isSeed: boolean;
  kesPerUsd: string;
  onClick: () => void;
}

export function MarketRow({
  symbol, name, address, basePrice, baseChange,
  volume, iconUrl, isNew, isSeed, kesPerUsd, onClick,
}: MarketRowProps) {
  const { prices, priceChanges } = usePrices();
  const { isFavorite, toggleFavorite } = usePreferences();

  const tickerKey = `${symbol}USDT`;
  const price = prices[tickerKey] ?? basePrice;
  const change = priceChanges[tickerKey] ?? baseChange;
  const dir = priceDirection(change);
  const fav = isFavorite(address);

  const kesPrice = price !== "0"
    ? (parseFloat(price) * parseFloat(kesPerUsd)).toFixed(2)
    : null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 w-full active:bg-bg-surface2 transition-colors border-b border-border/40"
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-full bg-bg-surface2 border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt={symbol} className="w-full h-full object-cover" />
        ) : (
          <span className="font-price text-xs text-text-muted">{symbol.slice(0, 2)}</span>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-outfit text-sm font-semibold text-text-primary">{symbol}</span>
          <span className="font-outfit text-xs text-text-muted">/USDT</span>
          {isNew && (
            <span className="text-[9px] font-bold text-primary bg-primary/10 px-1 py-0.5 rounded">NEW</span>
          )}
          {isSeed && (
            <span className="text-[9px] font-bold text-down bg-down/10 px-1 py-0.5 rounded">SEED</span>
          )}
        </div>
        <p className="font-outfit text-[11px] text-text-muted">
          Vol {formatVolume(volume)}
        </p>
      </div>

      {/* Price */}
      <div className="text-right mr-2">
        <p className="font-price text-sm font-medium text-text-primary">
          {formatPrice(price)}
        </p>
        {kesPrice && (
          <p className="font-outfit text-[10px] text-text-muted">
            KSh {parseFloat(kesPrice).toLocaleString()}
          </p>
        )}
      </div>

      {/* Change — luminous green/red pill */}
      <div className="w-[64px] text-right flex-shrink-0">
        <span className={cn(
          "inline-block font-price text-[11px] font-semibold px-2 py-1 rounded-lg",
          dir === "up"
            ? "bg-up/20 text-up ring-1 ring-up/30"
            : dir === "down"
            ? "bg-down/20 text-down ring-1 ring-down/30"
            : "bg-bg-surface2 text-text-muted"
        )}>
          {formatChange(change)}
        </span>
      </div>

      {/* Star — div to avoid nested button hydration error */}
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); toggleFavorite(address); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleFavorite(address); }}}
        className="tap-target flex-shrink-0 text-text-muted hover:text-gold transition-colors cursor-pointer"
        aria-label={fav ? "Remove from favorites" : "Add to favorites"}
      >
        {fav
          ? <IconStarFilled size={16} className="text-gold" />
          : <IconStar size={16} />}
      </div>
    </button>
  );
}

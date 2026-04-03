"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ChartSection } from "@/components/trade/ChartSection";
import { TokenInfoTab } from "@/components/token-detail/TokenInfoTab";
import { AuditTab } from "@/components/token-detail/AuditTab";
import { TradingDataTab } from "@/components/token-detail/TradingDataTab";
import { PriceAlertSheet } from "@/components/token-detail/PriceAlertSheet";
import { ComingSoonSheet } from "@/components/shared/BottomSheet";
import { useMultiPeriodReturns } from "@/lib/hooks/useTokenDetail";
import { useTicker } from "@/lib/hooks/useMarketData";
import { usePreferences } from "@/lib/store";
import { useWallet } from "@/lib/hooks/useWallet";
import { isTradingViewSymbol } from "@/components/charts/TradingViewWidget";
import { formatPrice, formatChange, priceDirection } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import {
  IconChevronLeft, IconBell, IconStarFilled, IconStar, IconChevronDown,
} from "@/components/icons";

type DetailTab = "Price" | "Info" | "Trading Data" | "Audit" | "Square";

const DETAIL_TABS: DetailTab[] = ["Price", "Info", "Trading Data", "Audit", "Square"];

const MAJOR_COINS = ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOT", "MATIC", "LINK", "LTC"];

export default function TokenDetailPage() {
  const router = useRouter();
  const params = useParams();
  const symbolParam = (params.symbol as string).toUpperCase();

  // Resolve address — for major coins, use symbol+USDT as address key
  const isMajor = MAJOR_COINS.includes(symbolParam);
  const tokenAddress = isMajor ? `${symbolParam}USDT` : symbolParam;
  const symbol = isMajor ? symbolParam : symbolParam;

  const [activeTab, setActiveTab] = useState<DetailTab>("Price");
  const [alertOpen, setAlertOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);

  const { price, change, high, low, volume } = useTicker(`${symbol}USDT`);
  const { isFavorite, toggleFavorite } = usePreferences();
  const { rate } = useWallet();
  const { data: returns } = useMultiPeriodReturns(symbol);

  const kesPerUsd = rate?.kesPerUsd ?? "130";
  const kesPrice = price !== "0"
    ? (parseFloat(price) * parseFloat(kesPerUsd)).toLocaleString("en-KE", { maximumFractionDigits: 2 })
    : "—";

  const dir = priceDirection(change);
  const fav = isFavorite(tokenAddress);

  return (
    <div className="screen">
      {/* Top bar */}
      <div className="top-bar border-b border-border">
        <div className="flex items-center gap-2 flex-1">
          <button
            onClick={() => router.back()}
            className="tap-target text-text-muted hover:text-text-secondary transition-colors -ml-2"
            aria-label="Back"
          >
            <IconChevronLeft size={24} />
          </button>
          <button className="flex items-center gap-1">
            <span className="font-syne font-bold text-base text-text-primary">{symbol}</span>
            <span className="font-outfit text-sm text-text-muted">/USDT</span>
            <IconChevronDown size={14} className="text-text-muted" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleFavorite(tokenAddress)}
            className="tap-target transition-colors"
            aria-label={fav ? "Remove from favorites" : "Add to favorites"}
          >
            {fav
              ? <IconStarFilled size={20} className="text-gold" />
              : <IconStar size={20} className="text-text-muted" />}
          </button>
          <button
            onClick={() => setAlertOpen(true)}
            className="tap-target text-text-muted hover:text-primary transition-colors"
            aria-label="Set price alert"
          >
            <IconBell size={20} />
          </button>
        </div>
      </div>

      {/* Price header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-baseline gap-3">
          <span className={cn(
            "font-price text-3xl font-medium",
            dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-primary"
          )}>
            {formatPrice(price)}
          </span>
          <span className={cn(
            "font-price text-sm font-medium",
            dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-muted"
          )}>
            {formatChange(change)}
          </span>
        </div>
        <p className="font-outfit text-sm text-text-muted mt-0.5">≈ KSh {kesPrice}</p>
      </div>

      {/* Tab row */}
      <div className="flex border-b border-border overflow-x-auto no-scrollbar px-1">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              if (tab === "Square") { setComingSoon(true); return; }
              setActiveTab(tab);
            }}
            className={cn(
              "flex-shrink-0 px-4 py-2.5 font-outfit text-sm font-medium border-b-2 transition-all whitespace-nowrap",
              activeTab === tab
                ? "text-text-primary border-primary"
                : "text-text-muted border-transparent"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "Price" && (
        <>
          {/* Chart */}
          <ChartSection symbol={symbol} tokenAddress={tokenAddress} />

          {/* 24h stats row */}
          <div className="flex border-b border-border overflow-x-auto no-scrollbar">
            {[
              { label: "High", value: formatPrice(high) },
              { label: "Low",  value: formatPrice(low) },
              { label: "Vol",  value: `${parseFloat(volume).toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex-shrink-0 px-4 py-2.5 border-r border-border last:border-r-0">
                <p className="font-outfit text-[10px] text-text-muted uppercase">{label}</p>
                <p className="font-price text-xs text-text-primary mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Multi-period returns table */}
          {Array.isArray(returns) && returns.length > 0 && (
            <div className="px-4 py-3 border-b border-border">
              <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">Returns</p>
              <div className="grid grid-cols-6 gap-1">
                {(returns as Array<{ label: string; change: string | null }>).map(({ label, change: ret }) => {
                  const retDir = priceDirection(ret ?? "0");
                  return (
                    <div key={label} className="text-center">
                      <p className="font-outfit text-[10px] text-text-muted mb-1">{label}</p>
                      <p className={cn(
                        "font-price text-[11px] font-medium",
                        retDir === "up" ? "text-up" : retDir === "down" ? "text-down" : "text-text-muted"
                      )}>
                        {ret !== null
                          ? `${parseFloat(ret) >= 0 ? "+" : ""}${parseFloat(ret).toFixed(1)}%`
                          : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "Info" && (
        <TokenInfoTab symbol={symbol} />
      )}

      {activeTab === "Trading Data" && (
        <TradingDataTab symbol={symbol} tokenAddress={tokenAddress} />
      )}

      {activeTab === "Audit" && (
        <AuditTab tokenAddress={tokenAddress} isMajorCoin={isMajor} />
      )}

      {/* Buy / Sell bottom bar — sticky above bottom nav */}
      <div
        className="fixed left-0 right-0 flex gap-3 px-4 py-3 bg-bg border-t border-border"
        style={{ bottom: "var(--bottom-nav-height)" }}
      >
        <button
          onClick={() => router.push(`/trade?symbol=${symbol}&side=buy`)}
          className="flex-1 py-3 rounded-2xl bg-up font-outfit font-semibold text-sm text-bg active:opacity-85 transition-opacity"
        >
          Buy {symbol}
        </button>
        <button
          onClick={() => router.push(`/trade?symbol=${symbol}&side=sell`)}
          className="flex-1 py-3 rounded-2xl bg-down font-outfit font-semibold text-sm text-white active:opacity-85 transition-opacity"
        >
          Sell {symbol}
        </button>
      </div>

      {/* Extra space for the fixed buy/sell bar */}
      <div className="h-20" />

      <PriceAlertSheet
        isOpen={alertOpen}
        onClose={() => setAlertOpen(false)}
        tokenAddress={tokenAddress}
        tokenSymbol={symbol}
        currentPrice={price}
      />
      <ComingSoonSheet
        isOpen={comingSoon}
        onClose={() => setComingSoon(false)}
        featureName="Square Community"
        description="Discuss price action, share analysis, and get signals from other KryptoKe traders. Community features are launching soon — join our Telegram in the meantime."
      />
    </div>
  );
}

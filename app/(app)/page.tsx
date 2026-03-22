"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HomeTopBar } from "@/components/home/HomeTopBar";
import { PortfolioCard } from "@/components/home/PortfolioCard";
import { MarketList } from "@/components/home/MarketList";
import { NotificationsSheet } from "@/components/home/NotificationsSheet";
import { MenuSheet } from "@/components/home/MenuSheet";
import { DepositSheet } from "@/components/home/DepositSheet";
import { useWallet } from "@/lib/hooks/useWallet";
import { useMarketOverview, useBinanceWebSocket, useFearGreed } from "@/lib/hooks/useMarketData";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { usePreferences, usePrices } from "@/lib/store";
import { cn } from "@/lib/utils/cn";
import { formatChange, priceDirection } from "@/lib/utils/formatters";

// Compact inline Fear & Greed — no separate component import needed for speed
function CompactFearGreed() {
  const { data, isLoading } = useFearGreed();
  if (isLoading || !data) return null;
  const v = data.value;
  const color = v <= 20 ? "#FF4560" : v <= 40 ? "#FF8C42" : v <= 60 ? "#F0B429" : v <= 80 ? "#7EC850" : "#00D68F";
  const label = v <= 20 ? "Extreme Fear" : v <= 40 ? "Fear" : v <= 60 ? "Neutral" : v <= 80 ? "Greed" : "Extreme Greed";
  return (
    <div className="mx-4 mt-2 card py-2.5 px-3 flex items-center gap-3" style={{ borderColor: color + "30" }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: color + "18", border: `1px solid ${color}40` }}>
        <span className="font-price text-sm font-bold" style={{ color }}>{v}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-outfit text-[10px] text-text-muted leading-none mb-1">Fear &amp; Greed Index</p>
        <div className="relative h-1.5 rounded-full overflow-hidden"
          style={{ background: "linear-gradient(to right,#FF4560 0%,#FF8C42 25%,#F0B429 50%,#7EC850 75%,#00D68F 100%)" }}>
          <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-bg transition-all duration-700"
            style={{ left: `calc(${v}% - 5px)`, backgroundColor: color }} />
        </div>
      </div>
      <span className="font-syne font-bold text-xs flex-shrink-0" style={{ color }}>{label}</span>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  useBinanceWebSocket();
  useNotifications();

  const { totalKes, totalUsd, isLoading: walletLoading } = useWallet();
  const { data: marketData, isLoading: marketLoading } = useMarketOverview();
  const { isFavorite } = usePreferences();
  const { prices, priceChanges } = usePrices();

  // Quick-access ticker strip — favorites first, then major coins
  const MAJOR = ["BTC","ETH","BNB","SOL","XRP","DOGE","ADA","AVAX","DOT","LINK","UNI","MATIC"];
  const favoriteCoins = (marketData ?? []).filter(t => isFavorite(t.address)).slice(0, 4);
  const stripCoins = favoriteCoins.length > 0 ? favoriteCoins : (marketData ?? [])
    .filter(t => MAJOR.includes(t.symbol)).slice(0, 6);

  return (
    <div className="screen">
      <HomeTopBar onBellClick={() => setNotifOpen(true)} onMenuClick={() => setMenuOpen(true)} />

      <div className="h-2" />

      <PortfolioCard
        totalKes={totalKes}
        totalUsd={totalUsd}
        isLoading={walletLoading}
        onDeposit={() => setDepositOpen(true)}
        onWithdraw={() => router.push("/withdraw")}
      />

      {/* Quick action buttons */}
      <div className="mx-4 mt-2.5 grid grid-cols-3 gap-2">
        {[
          { label: "Deposit",  icon: "↓", color: "text-up",      bg: "bg-up/10 border-up/20",          action: () => setDepositOpen(true) },
          { label: "Withdraw", icon: "↑", color: "text-down",    bg: "bg-down/10 border-down/20",       action: () => router.push("/withdraw") },
          { label: "Transfer", icon: "⇄", color: "text-primary", bg: "bg-primary/10 border-primary/20", action: () => router.push("/assets") },
        ].map(({ label, icon, color, bg, action }) => (
          <button key={label} onClick={action}
            className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl border ${bg} active:scale-95 transition-transform`}>
            <span className={`text-base leading-none ${color}`}>{icon}</span>
            <span className={`font-outfit text-[11px] font-semibold ${color}`}>{label}</span>
          </button>
        ))}
      </div>

      {/* Fear & Greed — right below deposit buttons */}
      <CompactFearGreed />

      {/* Ticker strip — major coins or favorites */}
      {stripCoins.length > 0 && (
        <div className="mx-4 mt-2.5 flex gap-2 overflow-x-auto no-scrollbar">
          {stripCoins.map((coin) => {
            const tickerKey = `${coin.symbol}USDT`;
            const livePrice  = prices[tickerKey]       ?? coin.price;
            const liveChange = priceChanges[tickerKey] ?? "0";
            const dir = priceDirection(liveChange);
            return (
              <button key={coin.address}
                onClick={() => router.push(`/markets/${coin.symbol}`)}
                className="flex-shrink-0 px-3 py-2 rounded-xl border border-border bg-bg-surface2 text-left min-w-[76px]">
                <div className="flex items-center gap-1 mb-0.5">
                  {coin.iconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coin.iconUrl} alt={coin.symbol} className="w-3.5 h-3.5 rounded-full" />
                  )}
                  <span className="font-outfit font-bold text-[10px] text-text-primary">{coin.symbol}</span>
                </div>
                <p className="font-price text-xs text-text-primary tabular-nums">
                  ${parseFloat(livePrice) > 0
                    ? parseFloat(livePrice) < 1
                      ? parseFloat(livePrice).toFixed(5)
                      : parseFloat(livePrice).toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : "—"}
                </p>
                <span className={cn(
                  "font-price text-[9px] font-semibold",
                  dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-muted"
                )}>
                  {formatChange(liveChange)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="h-3" />

      {/* Quick nav shortcuts — Binance-style feature cards */}
      <div className="px-4 mb-3">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Buy Crypto",  icon: "↓",  path: "/deposit",  color: "text-up",      bg: "bg-up/8" },
            { label: "Convert",     icon: "⇄",  path: "/convert",  color: "text-primary", bg: "bg-primary/8" },
            { label: "P2P",         icon: "🤝", path: "/p2p",      color: "text-gold",    bg: "bg-gold/8" },
            { label: "Rewards",     icon: "🎁", path: "/rewards",  color: "text-primary", bg: "bg-primary/8" },
          ].map(({ label, icon, path, color, bg }) => (
            <button key={label} onClick={() => router.push(path)}
              className={cn("flex flex-col items-center gap-1.5 py-2.5 rounded-xl border border-border/60 active:scale-95 transition-transform", bg)}>
              <span className="text-base leading-none">{icon}</span>
              <span className={cn("font-outfit text-[10px] font-semibold leading-tight text-center", color)}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Market list — all coins with live prices and percentages */}
      <MarketList
        data={(marketData ?? []).map((t) => ({
          symbol:  t.symbol,
          name:    t.name,
          price:   t.price,
          change:  "0",
          volume:  t.volume ?? "0",
          iconUrl: t.iconUrl,
          address: t.address,
          isNew:   t.isNew,
          isSeed:  t.isSeed,
        }))}
        isLoading={marketLoading}
        onSeeAll={() => router.push("/markets")}
        onCoinClick={(_address, symbol) => router.push(`/markets/${symbol}`)}
      />

      <div className="h-8" />

      <NotificationsSheet isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
      <MenuSheet isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <DepositSheet isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  );
}

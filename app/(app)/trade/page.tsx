"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import { ChartSection } from "@/components/trade/ChartSection";
import { DepositSheet } from "@/components/home/DepositSheet";

// Lazy load heavy trading components
const FuturesTab = dynamic(() => import('@/components/trade/FuturesTab').then(m => ({ default: m.FuturesTab })), { ssr: false });
const OrderForm    = dynamic(() => import("@/components/trade/OrderForm").then(m => ({ default: m.OrderForm })), { ssr: false });
const OrderBook    = dynamic(() => import("@/components/trade/OrderBook").then(m => ({ default: m.OrderBook })), { ssr: false });
const ConvertTab   = dynamic(() => import("@/components/trade/ConvertTab").then(m => ({ default: m.ConvertTab })), { ssr: false });
const PairSelector = dynamic(() => import("@/components/trade/PairSelector").then(m => ({ default: m.PairSelector })), { ssr: false });
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useTicker } from "@/lib/hooks/useMarketData";
import { useWallet } from "@/lib/hooks/useWallet";
import { formatPrice, formatChange, priceDirection } from "@/lib/utils/formatters";
import { IconChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils/cn";

type TradeTab = "Convert" | "Spot" | "Futures" | "DEX" | "Bots";
const TABS: TradeTab[] = ["Convert", "Spot", "Futures", "DEX", "Bots"];

export default function TradePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TradeTab>("Spot");
  const [symbol, setSymbol] = useState("BTC");
  const [tokenAddress, setTokenAddress] = useState("BTCUSDT");
  const [pairSelectorOpen, setPairSelectorOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  const { price, change } = useTicker(`${symbol}USDT`);
  const { rate } = useWallet();
  const dir = priceDirection(change);

  const kesPerUsd = rate?.kesPerUsd ?? "130";
  const kesPrice = price !== "0"
    ? (parseFloat(price) * parseFloat(kesPerUsd)).toFixed(2)
    : "—";

  function handleTabClick(tab: TradeTab) {
    if (tab === "Bots") { router.push("/bots"); return; }
    if (tab === "DEX")  { router.push("/dex");  return; }
    setActiveTab(tab);
  }

  return (
    <div className="screen overflow-hidden flex flex-col">
      {/* Top bar */}
      <div className="top-bar border-b border-border">
        <button
          onClick={() => setPairSelectorOpen(true)}
          className="flex items-center gap-2"
          aria-label="Select trading pair"
        >
          <div>
            <div className="flex items-center gap-1">
              <span className="font-syne font-bold text-base text-text-primary">
                {symbol}
              </span>
              <span className="font-outfit text-sm text-text-muted">/USDT</span>
              <IconChevronDown size={14} className="text-text-muted" />
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "font-price text-sm font-medium",
                dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-secondary"
              )}>
                {formatPrice(price)}
              </span>
              <span className={cn(
                "font-price text-xs",
                dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-muted"
              )}>
                {formatChange(change)}
              </span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <span className="font-outfit text-xs text-text-muted">
            ≈ KSh {parseFloat(kesPrice).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Tab row */}
      <div className="flex border-b border-border px-1 overflow-x-auto no-scrollbar flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabClick(tab)}
            className={cn(
              "flex-shrink-0 px-4 py-2.5 font-outfit text-sm font-medium transition-all border-b-2",
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
      <div className="flex-1 overflow-y-auto">
        {activeTab === "Convert" && <ConvertTab />}

        {activeTab === "Futures" && <FuturesTab />}

      {activeTab === "Spot" && (
          <>
            {/* Chart */}
            <ChartSection symbol={symbol} tokenAddress={tokenAddress} />

            {/* Order form + order book side by side */}
            <div className="flex border-t border-border" style={{ minHeight: 420 }}>
              {/* Order form — left 55% */}
              <div className="flex-[55] border-r border-border overflow-y-auto">
                <OrderForm
                  symbol={symbol}
                  tokenAddress={tokenAddress}
                  onDepositClick={() => setDepositOpen(true)}
                />
              </div>

              {/* Order book — right 45% */}
              <div className="flex-[45] overflow-hidden">
                <OrderBook
                  symbol={`${symbol}USDT`}
                  currentPrice={price}
                  kesPerUsd={kesPerUsd}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sheets */}
      <PairSelector
        isOpen={pairSelectorOpen}
        onClose={() => setPairSelectorOpen(false)}
        onSelect={(sym, addr) => {
          setSymbol(sym);
          setTokenAddress(addr);
        }}
        currentSymbol={symbol}
      />
      <DepositSheet isOpen={depositOpen} onClose={() => setDepositOpen(false)} />

    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ChartSection } from "@/components/trade/ChartSection";
import { DepositSheet } from "@/components/home/DepositSheet";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useTicker } from "@/lib/hooks/useMarketData";
import { useWallet } from "@/lib/hooks/useWallet";
import { formatPrice, formatChange, priceDirection } from "@/lib/utils/formatters";
import { IconChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils/cn";

// Lazy load heavy components
const FuturesTab   = dynamic(() => import("@/components/trade/FuturesTab").then(m => ({ default: m.FuturesTab })), { ssr: false });
const OrderForm    = dynamic(() => import("@/components/trade/OrderForm").then(m => ({ default: m.OrderForm })), { ssr: false });
const OrderBook    = dynamic(() => import("@/components/trade/OrderBook").then(m => ({ default: m.OrderBook })), { ssr: false });
const ConvertTab   = dynamic(() => import("@/components/trade/ConvertTab").then(m => ({ default: m.ConvertTab })), { ssr: false });
const PairSelector = dynamic(() => import("@/components/trade/PairSelector").then(m => ({ default: m.PairSelector })), { ssr: false });

type TradeMode = "Convert" | "Spot" | "Futures" | "DEX" | "Bots";

// ── Persistent last-used state ────────────────────────────────────────────────
function getLastTrade(): { symbol: string; mode: TradeMode } {
  if (typeof window === "undefined") return { symbol: "BTC", mode: "Spot" };
  try {
    const raw = localStorage.getItem("_kk_last_trade");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { symbol: "BTC", mode: "Spot" };
}

function saveLastTrade(symbol: string, mode: TradeMode) {
  try { localStorage.setItem("_kk_last_trade", JSON.stringify({ symbol, mode })); } catch { /* ignore */ }
}

// ── Trade mode tab bar ────────────────────────────────────────────────────────
const TRADE_MODES: { mode: TradeMode; label: string; color: string }[] = [
  { mode: "Convert", label: "Convert", color: "#00B4FF" },
  { mode: "Spot",    label: "Spot",    color: "#00D68F" },
  { mode: "Futures", label: "Futures", color: "#F0B429" },
];

// ── Main trade page ───────────────────────────────────────────────────────────
export default function TradePage() {
  const searchParams = useSearchParams();
  const last = getLastTrade();

  // Honour ?symbol=BTC&side=buy&mode=Spot from token detail page
  const qSymbol = searchParams.get("symbol")?.toUpperCase() ?? null;
  const qSide   = searchParams.get("side") as "buy" | "sell" | null;
  const qMode   = searchParams.get("mode") as TradeMode | null;

  const [activeMode,       setActiveMode]       = useState<TradeMode>(qMode ?? last.mode);
  const [symbol,           setSymbol]           = useState(qSymbol ?? last.symbol);
  const [tokenAddress,     setTokenAddress]     = useState(`${qSymbol ?? last.symbol}USDT`);
  const [pairSelectorOpen, setPairSelectorOpen] = useState(false);
  const [depositOpen,      setDepositOpen]      = useState(false);
  const [comingSoon,       setComingSoon]        = useState<{ open: boolean; feature: string }>({ open: false, feature: "" });

  // Orderbook → OrderForm bridge
  const [injectedPrice,  setInjectedPrice]  = useState<string | undefined>();
  const [injectedAmount, setInjectedAmount] = useState<string | undefined>();
  // Inject the buy/sell side from query param
  const [injectedSide,   setInjectedSide]   = useState<"buy" | "sell" | undefined>(qSide ?? undefined);

  const { price, change } = useTicker(`${symbol}USDT`);
  const { rate } = useWallet();
  const dir = priceDirection(change);
  const kesPerUsd = rate?.kesPerUsd ?? "130";
  const kesPrice = price !== "0"
    ? `KSh ${(parseFloat(price) * parseFloat(kesPerUsd)).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`
    : "—";

  function handleModeChange(mode: TradeMode) {
    if (mode === "DEX" || mode === "Bots") {
      setComingSoon({ open: true, feature: mode === "DEX" ? "DEX Trading" : "Trading Bots" });
      return;
    }
    setActiveMode(mode);
    saveLastTrade(symbol, mode);
  }

  function handlePairChange(sym: string, addr: string) {
    setSymbol(sym);
    setTokenAddress(addr);
    saveLastTrade(sym, activeMode);
  }

  function handleOrderBookClick(price: string, qty: string) {
    setInjectedPrice(price);
    setInjectedAmount(qty);
  }

  return (
    <div className="screen overflow-hidden flex flex-col">
      {/* Top bar */}
      <div className="top-bar border-b border-border">
        <button onClick={() => setPairSelectorOpen(true)} className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-1">
              <span className="font-syne font-bold text-sm text-text-primary">{symbol}</span>
              <span className="font-outfit text-xs text-text-muted">/USDT</span>
              <IconChevronDown size={12} className="text-text-muted" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("font-price text-xs font-semibold",
                dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-secondary")}>
                {formatPrice(price)}
              </span>
              <span className="font-outfit text-[10px] text-text-muted">{kesPrice}</span>
              <span className={cn("font-price text-[10px]",
                dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-muted")}>
                {formatChange(change)}
              </span>
            </div>
          </div>
        </button>

        {/* Mode tabs */}
        <div className="flex items-center gap-1">
          {TRADE_MODES.map(({ mode, label, color }) => (
            <button key={mode} onClick={() => handleModeChange(mode)}
              className={cn("px-2.5 py-1 rounded-lg font-outfit text-[11px] font-semibold transition-all border",
                activeMode === mode ? "border-current bg-current/10" : "border-border text-text-muted")}
              style={activeMode === mode ? { color, borderColor: `${color}50`, backgroundColor: `${color}15` } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeMode === "Convert" && <ConvertTab defaultFrom={symbol} />}
        {activeMode === "Futures" && <FuturesTab symbol={symbol} onSymbolChange={(s) => handlePairChange(s, `${s}USDT`)} />}

        {activeMode === "Spot" && (
          <>
            <ChartSection symbol={symbol} tokenAddress={tokenAddress} />
            <div className="flex border-t border-border" style={{ minHeight: 380 }}>
              <div className="flex-[55] border-r border-border overflow-y-auto">
                <OrderForm
                  symbol={symbol}
                  tokenAddress={tokenAddress}
                  onDepositClick={() => setDepositOpen(true)}
                  externalPrice={injectedPrice}
                  externalAmount={injectedAmount}
                  externalSide={injectedSide}
                  onExternalConsumed={() => {
                    setInjectedPrice(undefined);
                    setInjectedAmount(undefined);
                    setInjectedSide(undefined);
                  }}
                />
              </div>
              <div className="flex-[45] overflow-hidden">
                <OrderBook
                  symbol={`${symbol}USDT`}
                  currentPrice={price}
                  kesPerUsd={kesPerUsd}
                  onPriceClick={handleOrderBookClick}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pair selector */}
      <PairSelector
        isOpen={pairSelectorOpen}
        onClose={() => setPairSelectorOpen(false)}
        onSelect={handlePairChange}
        currentSymbol={symbol}
      />
      <DepositSheet isOpen={depositOpen} onClose={() => setDepositOpen(false)} />

      {/* Coming soon */}
      <BottomSheet isOpen={comingSoon.open} onClose={() => setComingSoon({ open: false, feature: "" })}
        title={comingSoon.feature} showCloseButton>
        <div className="px-4 pb-8">
          <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/25 flex items-center justify-center mb-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                stroke="#F0B429" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="font-outfit text-sm text-text-secondary leading-relaxed mb-5">
            {comingSoon.feature === "DEX Trading"
              ? "Trade directly on-chain without leaving KryptoKe. Coming soon."
              : "Automate your trades with TWAP, Iceberg, and grid bots. Coming soon."}
          </p>
          <button onClick={() => setComingSoon({ open: false, feature: "" })} className="btn-primary w-full">Got it</button>
        </div>
      </BottomSheet>
    </div>
  );
}

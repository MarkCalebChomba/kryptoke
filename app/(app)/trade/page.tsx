"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { ChartSection } from "@/components/trade/ChartSection";
import { DepositSheet } from "@/components/home/DepositSheet";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useTicker } from "@/lib/hooks/useMarketData";
import { useWallet } from "@/lib/hooks/useWallet";
import { usePreferences } from "@/lib/store";
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

// ── Persistent last-used state via localStorage ───────────────────────────────
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

// ── Animated trade FAB menu ───────────────────────────────────────────────────
const TRADE_MODES: { mode: TradeMode; label: string; icon: string; color: string }[] = [
  { mode: "Convert", label: "Convert", icon: "⇄", color: "#00B4FF" },
  { mode: "Spot",    label: "Spot",    icon: "◈", color: "#00D68F" },
  { mode: "Futures", label: "Futures", icon: "⚡", color: "#F0B429" },
  { mode: "DEX",     label: "DEX",     icon: "⬡", color: "#A855F7" },
  { mode: "Bots",    label: "Bots",    icon: "⚙", color: "#FF8C42" },
];

function TradeModeButton({ activeMode, onChange }: {
  activeMode: TradeMode;
  onChange: (mode: TradeMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function toggleMenu() {
    setAnimating(true);
    setOpen((v) => !v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAnimating(false), 300);
  }

  function select(mode: TradeMode) {
    setOpen(false);
    onChange(mode);
  }

  return (
    <div className="relative">
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Mode pill */}
      <button
        onClick={toggleMenu}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-outfit text-xs font-semibold transition-all",
          "border active:scale-95",
          open ? "bg-primary/10 border-primary/30 text-primary" : "bg-bg-surface2 border-border text-text-muted"
        )}
      >
        {/* Animated lines icon */}
        <span className={cn("flex flex-col gap-[3px] transition-all duration-300", open && "rotate-45")}>
          <span className={cn(
            "block h-[2px] w-4 rounded-full bg-current transition-all duration-300",
            open ? "translate-y-[5px]" : ""
          )} />
          <span className={cn(
            "block h-[2px] w-4 rounded-full bg-current transition-all duration-300",
            open ? "opacity-0 scale-x-0" : ""
          )} />
          <span className={cn(
            "block h-[2px] w-4 rounded-full bg-current transition-all duration-300",
            open ? "-translate-y-[5px] -rotate-90" : ""
          )} />
        </span>
        <span>{activeMode}</span>
        <IconChevronDown size={12} className={cn("transition-transform duration-200", open && "rotate-180")} />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className={cn(
          "absolute top-full left-0 mt-2 z-50 bg-bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden",
          "animate-in fade-in slide-in-from-top-2 duration-150"
        )}>
          {TRADE_MODES.map(({ mode, label, icon, color }) => (
            <button
              key={mode}
              onClick={() => select(mode)}
              className={cn(
                "flex items-center gap-3 w-full px-4 py-3 font-outfit text-sm transition-colors",
                mode === activeMode ? "bg-bg-surface2" : "hover:bg-bg-surface2",
                "active:bg-bg-surface2"
              )}
            >
              <span className="text-base leading-none w-5 text-center" style={{ color }}>{icon}</span>
              <span className={cn("font-medium", mode === activeMode ? "text-text-primary" : "text-text-secondary")}>
                {label}
              </span>
              {mode === activeMode && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main trade page ───────────────────────────────────────────────────────────
export default function TradePage() {
  const { setPreferences } = usePreferences();
  const last = getLastTrade();

  const [activeMode,       setActiveMode]       = useState<TradeMode>(last.mode);
  const [symbol,           setSymbol]           = useState(last.symbol);
  const [tokenAddress,     setTokenAddress]     = useState(`${last.symbol}USDT`);
  const [pairSelectorOpen, setPairSelectorOpen] = useState(false);
  const [depositOpen,      setDepositOpen]      = useState(false);
  const [comingSoon,       setComingSoon]        = useState<{ open: boolean; feature: string }>({ open: false, feature: "" });

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

  return (
    <div className="screen overflow-hidden flex flex-col">
      {/* Top bar */}
      <div className="top-bar border-b border-border">
        {/* Pair selector */}
        <button onClick={() => setPairSelectorOpen(true)} className="flex items-center gap-2.5">
          <div>
            <div className="flex items-center gap-1">
              <span className="font-syne font-bold text-base text-text-primary">{symbol}</span>
              <span className="font-outfit text-sm text-text-muted">/USDT</span>
              <IconChevronDown size={14} className="text-text-muted" />
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("font-price text-sm font-semibold",
                dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-secondary")}>
                {formatPrice(price)}
              </span>
              <span className={cn("font-price text-xs",
                dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-muted")}>
                {formatChange(change)}
              </span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <span className="font-outfit text-xs text-text-muted">{kesPrice}</span>
          <TradeModeButton activeMode={activeMode} onChange={handleModeChange} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeMode === "Convert" && <ConvertTab />}

        {activeMode === "Futures" && <FuturesTab />}

        {activeMode === "Spot" && (
          <>
            <ChartSection symbol={symbol} tokenAddress={tokenAddress} />
            <div className="flex border-t border-border" style={{ minHeight: 420 }}>
              <div className="flex-[55] border-r border-border overflow-y-auto">
                <OrderForm
                  symbol={symbol}
                  tokenAddress={tokenAddress}
                  onDepositClick={() => setDepositOpen(true)}
                />
              </div>
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

      {/* Pair selector */}
      <PairSelector
        isOpen={pairSelectorOpen}
        onClose={() => setPairSelectorOpen(false)}
        onSelect={handlePairChange}
        currentSymbol={symbol}
      />
      <DepositSheet isOpen={depositOpen} onClose={() => setDepositOpen(false)} />

      {/* Coming soon sheet */}
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
              ? "Trade directly on-chain without leaving KryptoKe. Swap any token on Uniswap, PancakeSwap, and more — coming soon."
              : "Automate your trades with TWAP, Iceberg, and grid bots. Set it and let it run — coming soon."}
          </p>
          <button onClick={() => setComingSoon({ open: false, feature: "" })} className="btn-primary w-full">Got it</button>
        </div>
      </BottomSheet>
    </div>
  );
}

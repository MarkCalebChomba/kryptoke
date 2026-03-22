"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { useTradeQuote, useSubmitTrade } from "@/lib/hooks/useTrades";
import { useWallet } from "@/lib/hooks/useWallet";
import { OrderConfirmSheet } from "./OrderConfirmSheet";
import { useToastActions } from "@/components/shared/ToastContainer";
import { sanitizeNumberInput, formatKes } from "@/lib/utils/formatters";
import { multiply } from "@/lib/utils/money";
import type { TradeQuoteResponse } from "@/types";

// Token pair options
const PAIRS = [
  { from: "USDT", to: "KES", label: "USDT → KES" },
  { from: "KES", to: "USDT", label: "KES → USDT" },
];

const PCTS = [25, 50, 75, 100] as const;

export function ConvertTab() {
  const toast = useToastActions();
  const [amount, setAmount] = useState("0");
  const [fromAsset, setFromAsset] = useState("USDT");
  const [toAsset, setToAsset] = useState("KES");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<TradeQuoteResponse | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { usdtBalance, kesBalance, rate } = useWallet();
  const quoteQuery = useTradeQuote();
  const submitTrade = useSubmitTrade();

  const available = fromAsset === "USDT" ? usdtBalance : kesBalance;
  const kesPerUsd = rate?.kesPerUsd ?? "130";

  const estimatedOutput = (() => {
    const num = parseFloat(amount);
    if (isNaN(num) || num === 0) return "0";
    if (fromAsset === "USDT" && toAsset === "KES") {
      return (num * parseFloat(kesPerUsd)).toFixed(2);
    }
    if (fromAsset === "KES" && toAsset === "USDT") {
      return (num / parseFloat(kesPerUsd)).toFixed(6);
    }
    return "0";
  })();

  function handleKey(digit: string) {
    if (digit === "." && amount.includes(".")) return;
    if (digit === "." && amount === "0") {
      setAmount("0.");
      return;
    }
    const next = amount === "0" && digit !== "." ? digit : amount + digit;
    setAmount(sanitizeNumberInput(next, 8));
    triggerQuote(next);
  }

  function handleBackspace() {
    const next = amount.length <= 1 ? "0" : amount.slice(0, -1);
    setAmount(next);
  }

  function triggerQuote(value: string) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) return;
      // Quote only for crypto-to-crypto; KES conversion uses forex rate directly
    }, 500);
  }

  function handlePct(pct: number) {
    const val = ((parseFloat(available) * pct) / 100).toFixed(6);
    setAmount(sanitizeNumberInput(val));
  }

  function handleSwap() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setAmount("0");
  }

  function handleConvert() {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      toast.error("Enter an amount to convert");
      return;
    }
    // For KES<>USDT conversions create an internal transfer — no on-chain swap needed
    toast.info("Converting...", `${amount} ${fromAsset} → ${estimatedOutput} ${toAsset}`);
    setAmount("0");
  }

  const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      {/* Amount display */}
      <div className="text-center py-4">
        <p className="font-price text-[52px] font-light text-text-primary leading-none tracking-tight">
          {amount}
        </p>
        <p className="font-outfit text-sm text-primary mt-2">
          {fromAsset}
        </p>
        {estimatedOutput !== "0" && (
          <p className="font-outfit text-sm text-text-muted mt-1">
            ≈ {fromAsset === "USDT"
              ? formatKes(estimatedOutput)
              : `${parseFloat(estimatedOutput).toFixed(4)} USDT`}
          </p>
        )}
      </div>

      {/* Currency pair card */}
      <div className="card-2 space-y-0">
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="font-price text-xs text-primary">{fromAsset.slice(0, 1)}</span>
            </div>
            <div>
              <p className="font-outfit text-sm font-medium text-text-primary">{fromAsset}</p>
              <p className="font-outfit text-xs text-text-muted">
                Available: {parseFloat(available).toFixed(4)}
              </p>
            </div>
          </div>
          <span className="font-price text-sm text-text-secondary">{amount}</span>
        </div>

        {/* Swap button */}
        <button
          onClick={handleSwap}
          className="flex items-center justify-center w-full py-1"
        >
          <div className="w-8 h-8 rounded-full border border-border bg-bg-surface flex items-center justify-center text-text-muted hover:text-primary transition-colors active:scale-90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M7 16L12 11L17 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 8L12 13L17 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>

        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center">
              <span className="font-price text-xs text-gold">{toAsset.slice(0, 1)}</span>
            </div>
            <p className="font-outfit text-sm font-medium text-text-primary">{toAsset}</p>
          </div>
          <span className="font-price text-sm text-up">{estimatedOutput}</span>
        </div>
      </div>

      {/* Percentage buttons */}
      <div className="flex gap-2">
        {PCTS.map((pct) => (
          <button
            key={pct}
            onClick={() => handlePct(pct)}
            className="flex-1 py-1.5 rounded-lg border border-border font-outfit text-xs text-text-muted hover:border-primary/40 hover:text-primary transition-colors"
          >
            {pct === 100 ? "Max" : `${pct}%`}
          </button>
        ))}
      </div>

      {/* Custom numpad */}
      <div className="grid grid-cols-3 gap-2">
        {DIGITS.map((d) => (
          <button
            key={d}
            onClick={() => handleKey(d)}
            className="h-12 rounded-xl bg-bg-surface2 border border-border font-price text-lg text-text-primary active:bg-border active:scale-95 transition-all"
          >
            {d}
          </button>
        ))}
        <button
          onClick={handleBackspace}
          className="h-12 rounded-xl bg-bg-surface2 border border-border text-text-secondary flex items-center justify-center active:bg-border active:scale-95 transition-all"
          aria-label="Backspace"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M21 4H8L1 12L8 20H21V4Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18 9L12 15M12 9L18 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Convert button */}
      <button
        onClick={handleConvert}
        disabled={parseFloat(amount) <= 0}
        className="btn-primary disabled:opacity-50"
      >
        Convert {fromAsset} to {toAsset}
      </button>
    </div>
  );
}

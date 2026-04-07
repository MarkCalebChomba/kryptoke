"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { OrderTypeSheet } from "./OrderTypeSheet";
import { OrderConfirmSheet } from "./OrderConfirmSheet";
import { useTradeQuote, useSubmitTrade } from "@/lib/hooks/useTrades";
import { useWallet } from "@/lib/hooks/useWallet";
import { usePrices } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { sanitizeNumberInput, formatPrice } from "@/lib/utils/formatters";
import { multiply, validateAmount } from "@/lib/utils/money";
import { IconChevronDown, IconPlus } from "@/components/icons";
import type { TradeSide, OrderType, TradeQuoteResponse } from "@/types";

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  limit: "Limit Order",
  market: "Market Order",
  tp_sl: "TP / SL",
  trailing_stop: "Trailing Stop",
  trigger: "Trigger",
  advanced_limit: "Advanced Limit",
};

interface OrderFormProps {
  symbol: string;
  tokenAddress: string;
  onDepositClick: () => void;
  externalPrice?: string;
  externalAmount?: string;
  externalSide?: "buy" | "sell";
  onExternalConsumed?: () => void;
}

export function OrderForm({ symbol, tokenAddress, onDepositClick, externalPrice, externalAmount, externalSide, onExternalConsumed }: OrderFormProps) {
  const router = useRouter();
  const toast = useToastActions();

  const [side, setSide] = useState<TradeSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  const [orderTypeSheetOpen, setOrderTypeSheetOpen] = useState(false);
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<TradeQuoteResponse | null>(null);

  const { prices } = usePrices();
  const { usdtBalance, kesBalance, rate } = useWallet();
  const quoteQuery = useTradeQuote();
  const submitTrade = useSubmitTrade();

  const livePrice = prices[`${symbol}USDT`] ?? "0";
  const available = side === "buy" ? usdtBalance : "0"; // simplified — buy uses USDT


  // Consume external price/amount from orderbook click
  useEffect(() => {
    if (externalPrice) {
      setPrice(externalPrice);
      if (orderType === "market") setOrderType("limit");
      onExternalConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPrice]);

  useEffect(() => {
    if (externalAmount) {
      setAmount(externalAmount);
      setSliderPct(0);
      onExternalConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAmount]);

  // Consume external side (e.g. from Buy/Sell on token detail)
  useEffect(() => {
    if (externalSide) {
      setSide(externalSide);
      onExternalConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSide]);

  // Pre-fill price with market price
  useEffect(() => {
    if (livePrice && livePrice !== "0" && !price) {
      setPrice(livePrice);
    }
  }, [livePrice, price]);

  // Recalc amount from slider
  useEffect(() => {
    if (sliderPct === 0 || !available || available === "0") return;
    const pct = sliderPct / 100;
    const total = parseFloat(available) * pct;
    const effectivePrice = parseFloat(price || livePrice);
    if (effectivePrice > 0) {
      setAmount(sanitizeNumberInput((total / effectivePrice).toFixed(6)));
    }
  }, [sliderPct, available, price, livePrice]);

  const total = price && amount
    ? multiply(price, amount)
    : "";

  const handleBbo = useCallback(() => {
    setPrice(livePrice);
  }, [livePrice]);

  async function handleSubmit() {
    // For market orders use live price, for others use typed price
    const effectivePrice = orderType === "market" ? livePrice : price;
    const effectiveTotal = effectivePrice && amount
      ? multiply(effectivePrice, amount)
      : total;

    const { valid, error } = validateAmount(
      effectiveTotal || "0",
      "0.0001",
      available,
      available
    );

    if (!valid) {
      toast.error(error ?? "Invalid amount");
      return;
    }

    const tokenIn = side === "buy" ? "USDT" : tokenAddress;
    const tokenOut = side === "buy" ? tokenAddress : "USDT";
    const amountIn = side === "buy" ? effectiveTotal : amount;

    // Get quote first
    quoteQuery.mutate(
      { tokenIn, tokenOut, amountIn },
      {
        onSuccess: (quote) => {
          setPendingQuote(quote);
          setConfirmSheetOpen(true);
        },
        onError: (err) => {
          toast.error("Quote failed", err instanceof Error ? err.message : undefined);
        },
      }
    );
  }

  function handleConfirm() {
    if (!pendingQuote) return;

    const tokenIn = side === "buy" ? "USDT" : tokenAddress;
    const tokenOut = side === "buy" ? tokenAddress : "USDT";

    submitTrade.mutate(
      {
        tokenIn,
        tokenOut,
        amountIn: pendingQuote.amountIn,
        side,
        orderType,
      },
      {
        onSuccess: () => {
          setConfirmSheetOpen(false);
          setPendingQuote(null);
          setAmount("");
          setSliderPct(0);
        },
      }
    );
  }

  const isBuy = side === "buy";
  const submitDisabled =
    (orderType !== "market" && !price) ||
    !amount || parseFloat(amount) <= 0 ||
    quoteQuery.isPending;

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* Buy / Sell toggle */}
      <div className="flex rounded-lg overflow-hidden border border-border">
        <button onClick={() => setSide("buy")}
          className={cn("flex-1 py-2 font-outfit font-semibold text-xs transition-all",
            isBuy ? "bg-up text-white" : "text-text-muted")}>
          Buy
        </button>
        <button onClick={() => setSide("sell")}
          className={cn("flex-1 py-2 font-outfit font-semibold text-xs transition-all",
            !isBuy ? "bg-down text-white" : "text-text-muted")}>
          Sell
        </button>
      </div>

      {/* Order type — compact pill */}
      <button onClick={() => setOrderTypeSheetOpen(true)}
        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-bg-surface2 border border-border">
        <span className="font-outfit text-xs text-text-primary">{ORDER_TYPE_LABELS[orderType]}</span>
        <IconChevronDown size={13} className="text-text-muted" />
      </button>

      {/* Price input */}
      {orderType !== "market" && (
        <div className="relative">
          <input type="text" inputMode="decimal" value={price}
            onChange={(e) => setPrice(sanitizeNumberInput(e.target.value))}
            className="input-field font-price text-sm py-2 pr-12"
            placeholder={`Price: ${formatPrice(livePrice)}`} />
          <button onClick={handleBbo}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-primary font-outfit text-[10px] font-bold bg-primary/10 px-1.5 py-0.5 rounded">
            BBO
          </button>
        </div>
      )}

      {orderType === "market" && (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-bg-surface2 border border-border">
          <span className="font-outfit text-xs text-text-muted">Market</span>
          <span className="font-price text-xs text-text-primary">{formatPrice(livePrice)} USDT</span>
        </div>
      )}

      {/* Amount input */}
      <input type="text" inputMode="decimal" value={amount}
        onChange={(e) => { setAmount(sanitizeNumberInput(e.target.value)); setSliderPct(0); }}
        className="input-field font-price text-sm py-2"
        placeholder={`Amount (${symbol})`} />

      {/* Trigger price */}
      {(orderType === "trigger" || orderType === "trailing_stop") && (
        <input type="text" inputMode="decimal" value={triggerPrice}
          onChange={(e) => setTriggerPrice(sanitizeNumberInput(e.target.value))}
          className="input-field font-price text-sm py-2"
          placeholder={orderType === "trailing_stop" ? "Callback rate %" : "Trigger price"} />
      )}

      {/* TP / SL fields */}
      {orderType === "tp_sl" && (
        <div className="grid grid-cols-2 gap-1.5">
          <input type="text" inputMode="decimal" value={tpPrice}
            onChange={(e) => setTpPrice(sanitizeNumberInput(e.target.value))}
            className="input-field font-price text-sm py-2 border-up/30 focus:border-up/60" placeholder="Take profit" />
          <input type="text" inputMode="decimal" value={slPrice}
            onChange={(e) => setSlPrice(sanitizeNumberInput(e.target.value))}
            className="input-field font-price text-sm py-2 border-down/30 focus:border-down/60" placeholder="Stop loss" />
        </div>
      )}

      {/* % quick-select row */}
      <div className="flex gap-1">
        {[0, 25, 50, 75, 100].map((pct) => (
          <button key={pct} onClick={() => setSliderPct(pct)}
            className={cn("flex-1 py-1 rounded font-outfit text-[10px] border transition-colors",
              sliderPct === pct ? "border-primary/50 text-primary bg-primary/10" : "border-border text-text-muted")}>
            {pct === 0 ? "0" : pct === 100 ? "Max" : `${pct}%`}
          </button>
        ))}
      </div>

      {/* Total + available row */}
      <div className="flex items-center justify-between px-1">
        <span className="font-outfit text-[10px] text-text-muted">
          Avail: <span className="font-price text-text-secondary">
            {parseFloat(available).toFixed(3)} {isBuy ? "USDT" : symbol}
          </span>
        </span>
        {total && (
          <span className="font-price text-[10px] text-text-secondary">
            ≈ {parseFloat(total).toFixed(2)} USDT
          </span>
        )}
        <button onClick={onDepositClick}
          className="flex items-center gap-0.5 text-primary font-outfit text-[10px] font-medium">
          <IconPlus size={10} />Dep
        </button>
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={submitDisabled}
        className={cn("w-full py-2.5 rounded-xl font-outfit font-bold text-xs transition-all active:scale-[0.98]",
          submitDisabled && "opacity-50 cursor-not-allowed",
          isBuy ? "btn-buy" : "btn-sell")}>
        {quoteQuery.isPending ? "Quoting…" : `${isBuy ? "Buy" : "Sell"} ${symbol}`}
      </button>

      {/* Sheets */}
      <OrderTypeSheet
        isOpen={orderTypeSheetOpen}
        onClose={() => setOrderTypeSheetOpen(false)}
        selected={orderType}
        onSelect={setOrderType}
      />
      <OrderConfirmSheet
        isOpen={confirmSheetOpen}
        onClose={() => setConfirmSheetOpen(false)}
        onConfirm={handleConfirm}
        quote={pendingQuote}
        side={side}
        tokenSymbol={symbol}
        isLoading={submitTrade.isPending}
      />
    </div>
  );
}

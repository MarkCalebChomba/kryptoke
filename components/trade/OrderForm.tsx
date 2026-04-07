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
  onExternalConsumed?: () => void;
}

export function OrderForm({ symbol, tokenAddress, onDepositClick, externalPrice, externalAmount, onExternalConsumed }: OrderFormProps) {
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
    <div className="flex flex-col gap-3 p-3">
      {/* Buy / Sell toggle */}
      <div className="flex rounded-xl overflow-hidden border border-border">
        <button
          onClick={() => setSide("buy")}
          className={cn(
            "flex-1 py-2.5 font-outfit font-semibold text-sm transition-all",
            isBuy ? "bg-up text-bg" : "text-text-muted"
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={cn(
            "flex-1 py-2.5 font-outfit font-semibold text-sm transition-all",
            !isBuy ? "bg-down text-white" : "text-text-muted"
          )}
        >
          Sell
        </button>
      </div>

      {/* Order type selector */}
      <button
        onClick={() => setOrderTypeSheetOpen(true)}
        className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-bg-surface2 border border-border"
      >
        <span className="font-outfit text-sm text-text-primary">
          {ORDER_TYPE_LABELS[orderType]}
        </span>
        <IconChevronDown size={16} className="text-text-muted" />
      </button>

      {/* Price input — hidden for market orders */}
      {orderType !== "market" && (
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">
            {orderType === "tp_sl" ? "Limit Price (USDT)" : "Price (USDT)"}
          </label>
          <div className="relative">
            <input
              type="text" inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(sanitizeNumberInput(e.target.value))}
              className="input-field font-price pr-16"
              placeholder={formatPrice(livePrice)}
            />
            <button
              onClick={handleBbo}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary font-outfit text-xs font-semibold bg-primary/10 px-2 py-1 rounded-lg"
            >
              BBO
            </button>
          </div>
        </div>
      )}

      {orderType === "market" && (
        <div className="px-3 py-2.5 rounded-xl bg-bg-surface2 border border-border">
          <p className="font-outfit text-xs text-text-muted">Market price</p>
          <p className="font-price text-sm text-text-primary">{formatPrice(livePrice)} USDT</p>
        </div>
      )}

      {/* Amount input */}
      <div>
        <label className="block font-outfit text-xs text-text-muted mb-1.5">
          Amount ({symbol})
        </label>
        <input
          type="text" inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(sanitizeNumberInput(e.target.value));
            setSliderPct(0);
          }}
          className="input-field font-price"
          placeholder="0.0000"
        />
      </div>

      {/* Trigger price — for trigger and trailing_stop order types */}
      {(orderType === "trigger" || orderType === "trailing_stop") && (
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">
            {orderType === "trailing_stop" ? "Callback Rate (%)" : "Trigger Price (USDT)"}
          </label>
          <input
            type="text" inputMode="decimal"
            value={triggerPrice}
            onChange={(e) => setTriggerPrice(sanitizeNumberInput(e.target.value))}
            className="input-field font-price"
            placeholder={orderType === "trailing_stop" ? "e.g. 1.5" : formatPrice(livePrice)}
          />
        </div>
      )}

      {/* TP / SL fields */}
      {orderType === "tp_sl" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-outfit text-xs text-up mb-1.5">Take Profit</label>
            <input
              type="text" inputMode="decimal"
              value={tpPrice}
              onChange={(e) => setTpPrice(sanitizeNumberInput(e.target.value))}
              className="input-field font-price border-up/30 focus:border-up/60"
              placeholder="TP price"
            />
          </div>
          <div>
            <label className="block font-outfit text-xs text-down mb-1.5">Stop Loss</label>
            <input
              type="text" inputMode="decimal"
              value={slPrice}
              onChange={(e) => setSlPrice(sanitizeNumberInput(e.target.value))}
              className="input-field font-price border-down/30 focus:border-down/60"
              placeholder="SL price"
            />
          </div>
        </div>
      )}

      {/* Percentage slider */}
      <div>
        <input
          type="range"
          min={0} max={100} step={25}
          value={sliderPct}
          onChange={(e) => setSliderPct(parseInt(e.target.value))}
          className="w-full h-1 bg-border rounded-full appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between mt-1">
          {[0, 25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => setSliderPct(pct)}
              className={cn(
                "font-outfit text-[10px] transition-colors",
                sliderPct === pct ? "text-primary" : "text-text-muted"
              )}
            >
              {pct === 0 ? "0%" : pct === 100 ? "Max" : `${pct}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Total */}
      {total && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-bg-surface2 border border-border">
          <span className="font-outfit text-xs text-text-muted">Total</span>
          <span className="font-price text-sm text-text-primary">
            {parseFloat(total).toFixed(4)} USDT
          </span>
        </div>
      )}

      {/* Available */}
      <div className="flex items-center justify-between">
        <span className="font-outfit text-xs text-text-muted">
          Available: <span className="font-price text-text-secondary">
            {parseFloat(available).toFixed(4)} {isBuy ? "USDT" : symbol}
          </span>
        </span>
        <button
          onClick={onDepositClick}
          className="flex items-center gap-1 text-primary font-outfit text-xs font-medium"
        >
          <IconPlus size={12} />
          Deposit
        </button>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitDisabled}
        className={cn(
          "w-full py-3.5 rounded-xl font-outfit font-semibold text-sm transition-all active:scale-[0.98]",
          submitDisabled && "opacity-50 cursor-not-allowed",
          isBuy ? "btn-buy" : "btn-sell"
        )}
      >
        {quoteQuery.isPending
          ? "Getting quote..."
          : `${isBuy ? "Buy" : "Sell"} ${symbol}`}
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

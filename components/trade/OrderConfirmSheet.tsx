"use client";

import { BottomSheet } from "@/components/shared/BottomSheet";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/formatters";
import type { TradeQuoteResponse, TradeSide } from "@/types";

interface ConfirmRow {
  label: string;
  value: string;
  valueClass?: string;
}

function Row({ label, value, valueClass }: ConfirmRow) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50">
      <span className="font-outfit text-sm text-text-muted">{label}</span>
      <span className={cn("font-price text-sm text-text-primary", valueClass)}>
        {value}
      </span>
    </div>
  );
}

interface OrderConfirmSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  quote: TradeQuoteResponse | null;
  side: TradeSide;
  tokenSymbol: string;
  isLoading: boolean;
}

export function OrderConfirmSheet({
  isOpen,
  onClose,
  onConfirm,
  quote,
  side,
  tokenSymbol,
  isLoading,
}: OrderConfirmSheetProps) {
  if (!quote) return null;

  const isBuy = side === "buy";
  const priceImpactNum = parseFloat(quote.priceImpact);
  const highImpact = priceImpactNum > 2;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Confirm Order" showCloseButton>
      <div className="px-4 pb-6">
        {/* Order summary */}
        <div className="card-2 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-outfit text-xs text-text-muted">You pay</p>
              <p className="font-price text-lg font-medium text-text-primary">
                {parseFloat(quote.amountIn).toFixed(4)} {isBuy ? "USDT" : tokenSymbol}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-bg-surface border border-border flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5V19M5 12L12 19L19 12" stroke="#8A9CC0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="text-right">
              <p className="font-outfit text-xs text-text-muted">You receive</p>
              <p className={cn(
                "font-price text-lg font-medium",
                isBuy ? "text-up" : "text-down"
              )}>
                {parseFloat(quote.amountOut).toFixed(4)} {isBuy ? tokenSymbol : "USDT"}
              </p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="mb-4">
          <Row label="Price" value={`${formatPrice(quote.price)} USDT`} />
          <Row
            label="Price Impact"
            value={`${quote.priceImpact}%`}
            valueClass={highImpact ? "text-down" : "text-text-primary"}
          />
          <Row label="Fee" value={`${parseFloat(quote.fee).toFixed(4)} USDT`} />
          <Row label="Route" value={quote.route.length > 2 ? `Via WBNB` : "Direct"} />
        </div>

        {/* High impact warning */}
        {highImpact && (
          <div className="card border-down/30 bg-down/5 mb-4">
            <p className="font-outfit text-xs text-down leading-relaxed">
              High price impact ({quote.priceImpact}%). This trade will significantly move the market price.
            </p>
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className={cn(
            "w-full py-4 rounded-2xl font-outfit font-semibold text-base transition-all active:scale-[0.98]",
            isLoading && "opacity-60 cursor-not-allowed",
            isBuy
              ? "bg-up text-bg"
              : "bg-down text-white"
          )}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Submitting...
            </span>
          ) : (
            `Confirm ${isBuy ? "Buy" : "Sell"} ${tokenSymbol}`
          )}
        </button>
      </div>
    </BottomSheet>
  );
}

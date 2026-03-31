"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { usePrices } from "@/lib/store";
import { sanitizeNumberInput } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface FuturesPosition {
  id: string;
  symbol: string;
  side: "long" | "short";
  status: string;
  leverage: number;
  margin: string;
  notional: string;
  quantity: string;
  entry_price: string;
  mark_price?: string;
  liquidation_price: string;
  take_profit?: string;
  stop_loss?: string;
  realised_pnl?: string;
  unrealisedPnl?: string;
  roe?: string;
  opened_at: string;
}

interface FuturesSummary {
  tradingBalance: string;
  openPositions: number;
  totalMarginUsed: string;
  availableBalance: string;
  todayPnl: string;
  positions: FuturesPosition[];
}

/* ─── Open Position Sheet ────────────────────────────────────────────────── */

function OpenPositionSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { prices } = usePrices();

  const POPULAR = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "DOT"];

  const [symbol, setSymbol] = useState("BTC");
  const [side, setSide] = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(10);
  const [margin, setMargin] = useState("");
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const livePrice = prices[`${symbol}USDT`] ?? "0";
  const notional = margin ? (parseFloat(margin) * leverage).toFixed(2) : "0.00";
  const qty = margin && parseFloat(livePrice) > 0
    ? (parseFloat(notional) / parseFloat(livePrice)).toFixed(6)
    : "0.000000";

  // Approx liquidation price
  const liqPrice = livePrice && margin ? (() => {
    const entry = parseFloat(livePrice);
    const mmr = 0.1;
    return side === "long"
      ? (entry * (1 - (1 / leverage) + mmr)).toFixed(2)
      : (entry * (1 + (1 / leverage) - mmr)).toFixed(2);
  })() : "—";

  const openMutation = useMutation({
    mutationFn: () => apiPost("/futures/open", {
      symbol, side, margin,
      leverage,
      takeProfit: tp || undefined,
      stopLoss:   sl || undefined,
      orderType: "market",
    }),
    onSuccess: (data) => {
      toast.success("Position opened", data.message);
      setMargin(""); setTp(""); setSl("");
      qc.invalidateQueries({ queryKey: ["futures"] });
      onClose();
    },
    onError: (err) => toast.error("Failed to open", err instanceof Error ? err.message : ""),
  });

  const LEVERAGES = [1, 2, 5, 10, 20, 50, 100];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Open Position" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {/* Symbol picker */}
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Asset</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {POPULAR.map((s) => (
              <button key={s} onClick={() => setSymbol(s)}
                className={cn("flex-shrink-0 px-3 py-1.5 rounded-lg font-outfit text-xs font-semibold border transition-all",
                  symbol === s ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Price banner */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-bg-surface2 border border-border">
          <span className="font-outfit text-xs text-text-muted">{symbol}/USDT</span>
          <span className="font-price text-sm font-semibold text-text-primary">
            ${parseFloat(livePrice).toLocaleString()}
          </span>
        </div>

        {/* Long / Short */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSide("long")}
            className={cn("py-3 rounded-xl font-syne font-bold text-sm border-2 transition-all",
              side === "long" ? "bg-up/15 border-up text-up" : "border-border text-text-muted")}>
            ↑ Long
          </button>
          <button onClick={() => setSide("short")}
            className={cn("py-3 rounded-xl font-syne font-bold text-sm border-2 transition-all",
              side === "short" ? "bg-down/15 border-down text-down" : "border-border text-text-muted")}>
            ↓ Short
          </button>
        </div>

        {/* Leverage */}
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="font-outfit text-xs text-text-secondary">Leverage</label>
            <span className="font-price text-xs text-primary font-bold">{leverage}×</span>
          </div>
          <div className="flex gap-1.5">
            {LEVERAGES.map((l) => (
              <button key={l} onClick={() => setLeverage(l)}
                className={cn("flex-1 py-1.5 rounded-lg font-price text-xs border transition-all",
                  leverage === l ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
                {l}×
              </button>
            ))}
          </div>
        </div>

        {/* Margin */}
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Margin (USDT)</label>
          <input type="text" inputMode="decimal" value={margin}
            onChange={(e) => setMargin(sanitizeNumberInput(e.target.value, 4))}
            className="input-field" placeholder="0.00" />
        </div>

        {/* Order preview */}
        {margin && parseFloat(margin) > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Notional", value: `$${notional}` },
              { label: "Quantity", value: `${qty} ${symbol}` },
              { label: "Liq. Price", value: `$${liqPrice}` },
            ].map(({ label, value }) => (
              <div key={label} className="text-center py-2 rounded-xl bg-bg-surface2 border border-border">
                <p className="font-outfit text-[9px] text-text-muted uppercase tracking-wide">{label}</p>
                <p className="font-price text-xs font-semibold text-text-primary mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* TP/SL advanced */}
        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-primary font-outfit text-xs">
          {showAdvanced ? "Hide" : "Add"} Take Profit / Stop Loss
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-outfit text-xs text-text-secondary mb-1">Take Profit</label>
              <input type="text" inputMode="decimal" value={tp}
                onChange={(e) => setTp(sanitizeNumberInput(e.target.value, 2))}
                className="input-field text-up" placeholder="0.00" />
            </div>
            <div>
              <label className="block font-outfit text-xs text-text-secondary mb-1">Stop Loss</label>
              <input type="text" inputMode="decimal" value={sl}
                onChange={(e) => setSl(sanitizeNumberInput(e.target.value, 2))}
                className="input-field text-down" placeholder="0.00" />
            </div>
          </div>
        )}

        <div className="card border-gold/20 bg-gold/5">
          <p className="font-outfit text-xs text-gold/90 leading-relaxed">
            Futures trading involves significant risk. You can lose your entire margin. Only trade with funds you can afford to lose.
          </p>
        </div>

        <button onClick={() => openMutation.mutate()}
          disabled={openMutation.isPending || !margin || parseFloat(margin) <= 0}
          className={cn("btn-primary disabled:opacity-50",
            side === "long" ? "!bg-up !text-white" : "!bg-down !text-white")}>
          {openMutation.isPending ? "Opening..." : `Open ${side === "long" ? "Long" : "Short"} ${leverage}× · ${margin || "0"} USDT`}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Position Card ──────────────────────────────────────────────────────── */

function PositionCard({ pos, onClose }: { pos: FuturesPosition; onClose: (id: string) => void }) {
  const pnl = parseFloat(pos.unrealisedPnl ?? "0");
  const roe = parseFloat(pos.roe ?? "0");
  const isProfit = pnl >= 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={cn("px-2 py-0.5 rounded-lg font-outfit text-xs font-bold",
            pos.side === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down")}>
            {pos.side === "long" ? "Long" : "Short"}
          </span>
          <span className="font-syne font-bold text-sm text-text-primary">{pos.symbol}</span>
          <span className="font-price text-xs text-primary">{pos.leverage}×</span>
        </div>
        <button onClick={() => onClose(pos.id)}
          className="px-3 py-1 rounded-lg border border-border font-outfit text-xs text-text-muted active:bg-bg-surface2">
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {[
          { label: "Entry",      value: `$${parseFloat(pos.entry_price).toFixed(4)}` },
          { label: "Mark",       value: pos.mark_price ? `$${parseFloat(pos.mark_price).toFixed(4)}` : "—" },
          { label: "Margin",     value: `${parseFloat(pos.margin).toFixed(2)} USDT` },
          { label: "Liq. Price", value: `$${parseFloat(pos.liquidation_price).toFixed(4)}`, valueClass: "text-down" },
        ].map(({ label, value, valueClass }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="font-outfit text-[10px] text-text-muted">{label}</span>
            <span className={cn("font-price text-xs", valueClass ?? "text-text-primary")}>{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
        <span className="font-outfit text-xs text-text-muted">Unrealised PnL</span>
        <div className="text-right">
          <span className={cn("font-price text-sm font-bold", isProfit ? "text-up" : "text-down")}>
            {isProfit ? "+" : ""}{pnl.toFixed(4)} USDT
          </span>
          <span className={cn("font-price text-[10px] ml-2", isProfit ? "text-up" : "text-down")}>
            ({isProfit ? "+" : ""}{roe.toFixed(2)}% ROE)
          </span>
        </div>
      </div>

      {(pos.take_profit || pos.stop_loss) && (
        <div className="flex gap-3 mt-2">
          {pos.take_profit && (
            <span className="font-outfit text-[10px] text-up">
              TP: ${parseFloat(pos.take_profit).toFixed(4)}
            </span>
          )}
          {pos.stop_loss && (
            <span className="font-outfit text-[10px] text-down">
              SL: ${parseFloat(pos.stop_loss).toFixed(4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main FuturesTab ────────────────────────────────────────────────────── */

export function FuturesTab() {
  const toast = useToastActions();
  const qc = useQueryClient();
  const [openSheet, setOpenSheet] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["futures", "summary"],
    queryFn: () => apiGet<FuturesSummary>("/futures/summary"),
    refetchInterval: 10_000,
  });

  const closeMutation = useMutation({
    mutationFn: (positionId: string) =>
      apiPost<{ message: string; realisedPnl: string; roe: string }>(`/futures/close/${positionId}`, {}),
    onSuccess: (data) => {
      toast.success("Position closed", `PnL: ${data.realisedPnl} USDT (${data.roe})`);
      qc.invalidateQueries({ queryKey: ["futures"] });
    },
    onError: (err) => toast.error("Failed to close", err instanceof Error ? err.message : ""),
  });

  const todayPnl = parseFloat(summary?.todayPnl ?? "0");

  return (
    <div className="space-y-4 px-4 pt-4 pb-8">
      {/* Account summary */}
      <div className="card">
        <p className="font-outfit text-xs text-text-muted mb-3">Futures Account</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Available",     value: `${parseFloat(summary?.availableBalance ?? "0").toFixed(2)} USDT` },
            { label: "Margin Used",   value: `${parseFloat(summary?.totalMarginUsed ?? "0").toFixed(2)} USDT` },
            { label: "Open Positions",value: `${summary?.openPositions ?? 0}` },
            { label: "Today's PnL",  value: `${todayPnl >= 0 ? "+" : ""}${todayPnl.toFixed(4)} USDT`,
              valueClass: todayPnl >= 0 ? "text-up" : "text-down" },
          ].map(({ label, value, valueClass }) => (
            <div key={label} className="bg-bg-surface2 rounded-xl px-3 py-2.5">
              <p className="font-outfit text-[10px] text-text-muted">{label}</p>
              <p className={cn("font-price text-sm font-semibold mt-0.5", valueClass ?? "text-text-primary")}>{value}</p>
            </div>
          ))}
        </div>
        <p className="font-outfit text-[10px] text-text-muted mt-2">
          Trading balance: {parseFloat(summary?.tradingBalance ?? "0").toFixed(4)} USDT · Transfer from Funding to trade
        </p>
      </div>

      {/* Open position button */}
      <button onClick={() => setOpenSheet(true)}
        className="btn-primary flex items-center justify-center gap-2">
        + Open Position
      </button>

      {/* Positions list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
        </div>
      ) : !summary?.positions?.length ? (
        <div className="text-center py-10">
          <p className="font-outfit text-text-muted text-sm">No open positions</p>
          <p className="font-outfit text-text-muted text-xs mt-1">Open a long or short to start trading</p>
        </div>
      ) : (
        <div className="space-y-3">
          {summary.positions.map((pos) => (
            <PositionCard key={pos.id} pos={pos} onClose={(id) => closeMutation.mutate(id)} />
          ))}
        </div>
      )}

      <OpenPositionSheet isOpen={openSheet} onClose={() => setOpenSheet(false)} />
    </div>
  );
}

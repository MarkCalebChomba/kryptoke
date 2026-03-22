"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { usePrices } from "@/lib/store";
import { sanitizeNumberInput } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

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

  const POPULAR = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","DOT","AVAX","LINK"];
  const [symbol,   setSymbol]   = useState("BTC");
  const [side,     setSide]     = useState<"long"|"short">("long");
  const [leverage, setLeverage] = useState(10);
  const [margin,   setMargin]   = useState("");
  const [tp,       setTp]       = useState("");
  const [sl,       setSl]       = useState("");
  const [showAdv,  setShowAdv]  = useState(false);

  const livePrice = prices[`${symbol}USDT`] ?? "0";
  const notional  = margin ? (parseFloat(margin) * leverage).toFixed(2) : "0.00";
  const qty       = margin && parseFloat(livePrice) > 0
    ? (parseFloat(notional) / parseFloat(livePrice)).toFixed(6) : "0.000000";
  const liqPrice  = livePrice && margin ? (() => {
    const e = parseFloat(livePrice), mmr = 0.1;
    return side === "long"
      ? (e * (1 - 1/leverage + mmr)).toFixed(2)
      : (e * (1 + 1/leverage - mmr)).toFixed(2);
  })() : "—";

  const openMutation = useMutation({
    mutationFn: () => apiPost("/futures/open", { symbol, side, margin, leverage,
      takeProfit: tp||undefined, stopLoss: sl||undefined, orderType: "market" }),
    onSuccess: (data: { message: string }) => {
      toast.success("Position opened", data.message);
      setMargin(""); setTp(""); setSl("");
      qc.invalidateQueries({ queryKey: ["futures"] });
      onClose();
    },
    onError: (err) => toast.error("Failed to open", err instanceof Error ? err.message : ""),
  });

  const LEVERAGES = [2,5,10,20,50,100,125];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Open Position" showCloseButton>
      <div className="px-4 pb-6 space-y-3">
        {/* Symbol picker */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {POPULAR.map((s) => (
            <button key={s} onClick={() => setSymbol(s)}
              className={cn("flex-shrink-0 px-2.5 py-1 rounded-lg font-outfit text-xs font-semibold border transition-all",
                symbol === s ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
              {s}
            </button>
          ))}
        </div>

        {/* Price + Long/Short inline */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl bg-bg-surface2 border border-border">
            <span className="font-outfit text-xs text-text-muted">{symbol}/USDT</span>
            <span className="font-price text-sm font-semibold text-text-primary">
              ${parseFloat(livePrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Long / Short compact */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSide("long")}
            className={cn("py-2 rounded-xl font-syne font-bold text-sm border-2 transition-all",
              side === "long" ? "bg-up/15 border-up text-up" : "border-border text-text-muted")}>
            ↑ Long
          </button>
          <button onClick={() => setSide("short")}
            className={cn("py-2 rounded-xl font-syne font-bold text-sm border-2 transition-all",
              side === "short" ? "bg-down/15 border-down text-down" : "border-border text-text-muted")}>
            ↓ Short
          </button>
        </div>

        {/* Leverage compact */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-outfit text-xs text-text-muted">Leverage</span>
            <span className="font-price text-xs text-primary font-bold">{leverage}×</span>
          </div>
          <div className="flex gap-1">
            {LEVERAGES.map((l) => (
              <button key={l} onClick={() => setLeverage(l)}
                className={cn("flex-1 py-1 rounded-lg font-price text-[10px] border transition-all",
                  leverage === l ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
                {l}×
              </button>
            ))}
          </div>
        </div>

        {/* Margin input */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1">Margin (USDT)</label>
          <input type="text" inputMode="decimal" value={margin}
            onChange={(e) => setMargin(sanitizeNumberInput(e.target.value, 4))}
            className="input-field" placeholder="0.00" />
        </div>

        {/* Compact preview row */}
        {margin && parseFloat(margin) > 0 && (
          <div className="flex gap-1.5">
            {[
              { label: "Notional", value: `$${notional}` },
              { label: "Qty",      value: `${qty} ${symbol}` },
              { label: "Liq.",     value: `$${liqPrice}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex-1 text-center py-1.5 rounded-lg bg-bg-surface2 border border-border">
                <p className="font-outfit text-[8px] text-text-muted uppercase tracking-wide">{label}</p>
                <p className="font-price text-[10px] font-semibold text-text-primary mt-0.5 truncate px-1">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* TP/SL toggle */}
        <button onClick={() => setShowAdv(!showAdv)} className="font-outfit text-xs text-primary">
          {showAdv ? "Hide" : "+"} Take Profit / Stop Loss
        </button>

        {showAdv && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-outfit text-xs text-text-muted mb-1">Take Profit</label>
              <input type="text" inputMode="decimal" value={tp}
                onChange={(e) => setTp(sanitizeNumberInput(e.target.value, 2))}
                className="input-field text-up" placeholder="0.00" />
            </div>
            <div>
              <label className="block font-outfit text-xs text-text-muted mb-1">Stop Loss</label>
              <input type="text" inputMode="decimal" value={sl}
                onChange={(e) => setSl(sanitizeNumberInput(e.target.value, 2))}
                className="input-field text-down" placeholder="0.00" />
            </div>
          </div>
        )}

        <p className="font-outfit text-[10px] text-gold/80 bg-gold/5 border border-gold/20 rounded-lg px-3 py-2 leading-relaxed">
          Futures trading carries significant risk. You may lose your entire margin.
        </p>

        <button onClick={() => openMutation.mutate()}
          disabled={openMutation.isPending || !margin || parseFloat(margin) <= 0}
          className={cn("w-full py-3 rounded-xl font-syne font-bold text-sm text-white disabled:opacity-50",
            side === "long" ? "bg-up" : "bg-down")}>
          {openMutation.isPending ? "Opening..." : `${side === "long" ? "↑ Long" : "↓ Short"} ${leverage}× · ${margin||"0"} USDT`}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Position Card — compact row style ─────────────────────────────────── */

function PositionRow({ pos, onClose }: { pos: FuturesPosition; onClose: (id: string) => void }) {
  const pnl = parseFloat(pos.unrealisedPnl ?? "0");
  const roe = parseFloat(pos.roe ?? "0");
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/40 last:border-0">
      {/* Main row — tap to expand */}
      <button onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2.5 w-full px-4 py-2.5 active:bg-bg-surface2 transition-colors">
        {/* Side badge */}
        <span className={cn("flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center font-price text-[10px] font-bold",
          pos.side === "long" ? "bg-up/20 text-up" : "bg-down/20 text-down")}>
          {pos.side === "long" ? "L" : "S"}
        </span>

        {/* Symbol + leverage */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-outfit text-sm font-semibold text-text-primary">{pos.symbol}</span>
            <span className="font-price text-[10px] text-primary">{pos.leverage}×</span>
          </div>
          <p className="font-outfit text-[10px] text-text-muted">
            Entry ${parseFloat(pos.entry_price).toFixed(2)} · Margin {parseFloat(pos.margin).toFixed(2)} USDT
          </p>
        </div>

        {/* PnL */}
        <div className="text-right flex-shrink-0">
          <p className={cn("font-price text-sm font-bold", pnl >= 0 ? "text-up" : "text-down")}>
            {pnl >= 0 ? "+" : ""}{pnl.toFixed(3)}
          </p>
          <p className={cn("font-price text-[10px]", roe >= 0 ? "text-up" : "text-down")}>
            {roe >= 0 ? "+" : ""}{roe.toFixed(2)}%
          </p>
        </div>

        <span className="text-text-muted text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[
              { label: "Mark",     value: pos.mark_price ? `$${parseFloat(pos.mark_price).toFixed(2)}` : "—" },
              { label: "Liq.",     value: `$${parseFloat(pos.liquidation_price).toFixed(2)}`, valueClass: "text-down" },
              { label: "Notional", value: `$${parseFloat(pos.notional).toFixed(2)}` },
            ].map(({ label, value, valueClass }) => (
              <div key={label} className="bg-bg-surface2 rounded-lg px-2 py-1.5 text-center">
                <p className="font-outfit text-[9px] text-text-muted">{label}</p>
                <p className={cn("font-price text-xs mt-0.5", valueClass ?? "text-text-primary")}>{value}</p>
              </div>
            ))}
          </div>
          {(pos.take_profit || pos.stop_loss) && (
            <div className="flex gap-3 mb-2">
              {pos.take_profit && <span className="font-outfit text-[10px] text-up">TP: ${parseFloat(pos.take_profit).toFixed(2)}</span>}
              {pos.stop_loss   && <span className="font-outfit text-[10px] text-down">SL: ${parseFloat(pos.stop_loss).toFixed(2)}</span>}
            </div>
          )}
          <button onClick={() => onClose(pos.id)}
            className="w-full py-1.5 rounded-lg border border-down/40 text-down font-outfit text-xs font-semibold active:bg-down/10">
            Close Position
          </button>
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
    <div className="pt-2 pb-6">
      {/* Compact account summary — single row */}
      <div className="mx-4 mb-3 grid grid-cols-4 gap-1.5">
        {[
          { label: "Available",  value: `${parseFloat(summary?.availableBalance ?? "0").toFixed(2)}` },
          { label: "Margin",     value: `${parseFloat(summary?.totalMarginUsed ?? "0").toFixed(2)}` },
          { label: "Positions",  value: `${summary?.openPositions ?? 0}` },
          { label: "Today PnL",  value: `${todayPnl >= 0 ? "+" : ""}${todayPnl.toFixed(3)}`,
            valueClass: todayPnl >= 0 ? "text-up" : "text-down" },
        ].map(({ label, value, valueClass }) => (
          <div key={label} className="bg-bg-surface2 rounded-xl px-2 py-2 text-center border border-border">
            <p className="font-outfit text-[9px] text-text-muted leading-none mb-1">{label}</p>
            <p className={cn("font-price text-xs font-semibold leading-none", valueClass ?? "text-text-primary")}>{value}</p>
          </div>
        ))}
      </div>

      {/* Open button */}
      <div className="px-4 mb-3">
        <button onClick={() => setOpenSheet(true)}
          className="w-full py-2.5 rounded-xl bg-primary font-syne font-bold text-sm text-bg">
          + Open Position
        </button>
      </div>

      {/* Positions */}
      <div className="mx-4 border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-bg-surface2">
          <p className="font-outfit text-xs font-semibold text-text-muted uppercase tracking-wide">Open Positions</p>
        </div>
        {isLoading ? (
          <div className="space-y-0">
            {[1,2].map(i => <div key={i} className="h-12 skeleton mx-4 my-2 rounded-lg" />)}
          </div>
        ) : !summary?.positions?.length ? (
          <div className="py-8 text-center">
            <p className="font-outfit text-sm text-text-muted">No open positions</p>
            <p className="font-outfit text-xs text-text-muted mt-1">Tap Open Position to start</p>
          </div>
        ) : (
          summary.positions.map(pos => (
            <PositionRow key={pos.id} pos={pos} onClose={id => closeMutation.mutate(id)} />
          ))
        )}
      </div>

      <OpenPositionSheet isOpen={openSheet} onClose={() => setOpenSheet(false)} />
    </div>
  );
}

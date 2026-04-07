"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { ChartSection } from "@/components/trade/ChartSection";
import { usePrices } from "@/lib/store";
import { sanitizeNumberInput, formatPrice } from "@/lib/utils/formatters";
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

const POPULAR = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA"];
const LEVERAGES = [1, 2, 5, 10, 20, 50, 100];

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
            {pos.side === "long" ? "↑ Long" : "↓ Short"}
          </span>
          <span className="font-syne font-bold text-sm text-text-primary">{pos.symbol}</span>
          <span className="font-price text-xs text-primary">{pos.leverage}×</span>
        </div>
        <button onClick={() => onClose(pos.id)}
          className="px-3 py-1 rounded-lg border border-border font-outfit text-xs text-text-muted active:bg-bg-surface2">
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {[
          { label: "Entry",      value: `$${parseFloat(pos.entry_price).toFixed(4)}` },
          { label: "Mark",       value: pos.mark_price ? `$${parseFloat(pos.mark_price).toFixed(4)}` : "—" },
          { label: "Margin",     value: `${parseFloat(pos.margin).toFixed(2)} USDT` },
          { label: "Liq. Price", value: `$${parseFloat(pos.liquidation_price).toFixed(4)}`, cls: "text-down" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="font-outfit text-[10px] text-text-muted">{label}</span>
            <span className={cn("font-price text-xs", cls ?? "text-text-primary")}>{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-border/40 flex items-center justify-between">
        <span className="font-outfit text-xs text-text-muted">Unrealised PnL</span>
        <div className="text-right">
          <span className={cn("font-price text-sm font-bold", isProfit ? "text-up" : "text-down")}>
            {isProfit ? "+" : ""}{pnl.toFixed(4)} USDT
          </span>
          <span className={cn("font-price text-[10px] ml-2", isProfit ? "text-up" : "text-down")}>
            ({isProfit ? "+" : ""}{roe.toFixed(2)}%)
          </span>
        </div>
      </div>

      {(pos.take_profit || pos.stop_loss) && (
        <div className="flex gap-3 mt-1.5">
          {pos.take_profit && <span className="font-outfit text-[10px] text-up">TP: ${parseFloat(pos.take_profit).toFixed(4)}</span>}
          {pos.stop_loss   && <span className="font-outfit text-[10px] text-down">SL: ${parseFloat(pos.stop_loss).toFixed(4)}</span>}
        </div>
      )}
    </div>
  );
}

/* ─── Main FuturesTab — all inline, no bottom sheet ─────────────────────── */

export function FuturesTab() {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { prices } = usePrices();

  // Chart / symbol state
  const [chartSymbol, setChartSymbol] = useState("BTC");

  // Trade form state (inline)
  const [symbol,   setSymbol]   = useState("BTC");
  const [side,     setSide]     = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(10);
  const [margin,   setMargin]   = useState("");
  const [tp,       setTp]       = useState("");
  const [sl,       setSl]       = useState("");
  const [showTpSl, setShowTpSl] = useState(false);
  const [tab,      setTab]      = useState<"positions" | "orders">("positions");

  function handleSymbol(s: string) { setSymbol(s); setChartSymbol(s); }

  const livePrice = prices[`${symbol}USDT`] ?? "0";
  const notional  = margin ? (parseFloat(margin) * leverage).toFixed(2) : "0.00";
  const qty       = margin && parseFloat(livePrice) > 0
    ? (parseFloat(notional) / parseFloat(livePrice)).toFixed(6) : "0.000000";

  const liqPrice = livePrice && margin ? (() => {
    const entry = parseFloat(livePrice);
    const mmr = 0.1;
    return side === "long"
      ? (entry * (1 - (1 / leverage) + mmr)).toFixed(2)
      : (entry * (1 + (1 / leverage) - mmr)).toFixed(2);
  })() : "—";

  const { data: summary, isLoading } = useQuery({
    queryKey: ["futures", "summary"],
    queryFn: () => apiGet<FuturesSummary>("/futures/summary"),
    refetchInterval: 10_000,
  });

  const openMutation = useMutation({
    mutationFn: () => apiPost("/futures/open", {
      symbol, side, margin, leverage,
      takeProfit: tp || undefined,
      stopLoss:   sl || undefined,
      orderType: "market",
    }),
    onSuccess: (data: { message: string }) => {
      toast.success("Position opened", data.message);
      setMargin(""); setTp(""); setSl("");
      qc.invalidateQueries({ queryKey: ["futures"] });
    },
    onError: (err) => toast.error("Failed to open", err instanceof Error ? err.message : ""),
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
    <div className="pb-8">
      {/* Chart */}
      <ChartSection symbol={chartSymbol} tokenAddress={`${chartSymbol}USDT`} />

      {/* ── Inline trade form ── */}
      <div className="px-3 pt-3 pb-2 space-y-2.5">

        {/* Symbol picker */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {POPULAR.map(s => (
            <button key={s} onClick={() => handleSymbol(s)}
              className={cn("flex-shrink-0 px-3 py-1.5 rounded-xl font-outfit text-xs font-semibold border transition-all",
                symbol === s ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
              {s}
            </button>
          ))}
        </div>

        {/* Price + funding row */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-bg-surface2 border border-border">
          <div>
            <p className="font-outfit text-[10px] text-text-muted">{symbol}/USDT · Perp</p>
            <p className="font-price text-sm font-bold text-text-primary">
              ${parseFloat(livePrice).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="font-outfit text-[10px] text-text-muted">Avail. balance</p>
            <p className="font-price text-xs text-text-secondary">
              {parseFloat(summary?.availableBalance ?? "0").toFixed(2)} USDT
            </p>
          </div>
        </div>

        {/* Long / Short toggle */}
        <div className="flex rounded-xl overflow-hidden border border-border">
          <button onClick={() => setSide("long")}
            className={cn("flex-1 py-2.5 font-outfit font-bold text-sm transition-all",
              side === "long" ? "bg-up text-white" : "text-text-muted")}>
            ↑ Long
          </button>
          <button onClick={() => setSide("short")}
            className={cn("flex-1 py-2.5 font-outfit font-bold text-sm transition-all",
              side === "short" ? "bg-down text-white" : "text-text-muted")}>
            ↓ Short
          </button>
        </div>

        {/* Leverage */}
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="font-outfit text-xs text-text-muted">Leverage</label>
            <span className="font-price text-xs text-primary font-bold">{leverage}×</span>
          </div>
          <div className="flex gap-1">
            {LEVERAGES.map(l => (
              <button key={l} onClick={() => setLeverage(l)}
                className={cn("flex-1 py-1.5 rounded-lg font-price text-[11px] border transition-all",
                  leverage === l ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
                {l}×
              </button>
            ))}
          </div>
        </div>

        {/* Margin input */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Margin (USDT)</label>
          <div className="relative">
            <input type="text" inputMode="decimal" value={margin}
              onChange={e => setMargin(sanitizeNumberInput(e.target.value, 4))}
              className="input-field font-price pr-14"
              placeholder="0.00" />
            <button
              onClick={() => {
                const avail = parseFloat(summary?.availableBalance ?? "0");
                if (avail > 0) setMargin(avail.toFixed(2));
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary font-outfit text-xs font-semibold bg-primary/10 px-2 py-1 rounded-lg">
              Max
            </button>
          </div>
        </div>

        {/* Quick % */}
        <div className="flex gap-1.5">
          {[25, 50, 75, 100].map(pct => (
            <button key={pct} onClick={() => {
              const avail = parseFloat(summary?.availableBalance ?? "0");
              if (avail > 0) setMargin(((avail * pct) / 100).toFixed(2));
            }}
              className="flex-1 py-1 rounded-lg border border-border font-outfit text-xs text-text-muted active:border-primary/40 active:text-primary">
              {pct === 100 ? "Max" : `${pct}%`}
            </button>
          ))}
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

        {/* TP / SL toggle */}
        <button onClick={() => setShowTpSl(!showTpSl)} className="font-outfit text-xs text-primary">
          {showTpSl ? "▾ Hide" : "▸ Add"} Take Profit / Stop Loss
        </button>

        {showTpSl && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-outfit text-xs text-up mb-1">Take Profit</label>
              <input type="text" inputMode="decimal" value={tp}
                onChange={e => setTp(sanitizeNumberInput(e.target.value, 2))}
                className="input-field text-up border-up/30 focus:border-up/60" placeholder="0.00" />
            </div>
            <div>
              <label className="block font-outfit text-xs text-down mb-1">Stop Loss</label>
              <input type="text" inputMode="decimal" value={sl}
                onChange={e => setSl(sanitizeNumberInput(e.target.value, 2))}
                className="input-field text-down border-down/30 focus:border-down/60" placeholder="0.00" />
            </div>
          </div>
        )}

        {/* Risk warning */}
        <div className="px-3 py-2 rounded-xl bg-gold/5 border border-gold/20">
          <p className="font-outfit text-[10px] text-gold/80 leading-relaxed">
            ⚠ Futures trading involves significant risk. You can lose your entire margin.
          </p>
        </div>

        {/* Open button */}
        <button
          onClick={() => openMutation.mutate()}
          disabled={openMutation.isPending || !margin || parseFloat(margin) <= 0}
          className={cn("w-full py-3.5 rounded-xl font-outfit font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50",
            side === "long" ? "bg-up text-white" : "bg-down text-white")}>
          {openMutation.isPending
            ? "Opening…"
            : `Open ${side === "long" ? "Long" : "Short"} ${leverage}× · ${margin || "0"} USDT`}
        </button>
      </div>

      {/* ── Account summary ── */}
      <div className="mx-3 mt-1">
        <div className="card">
          <p className="font-outfit text-xs text-text-muted mb-2">Futures Account</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Available", value: `${parseFloat(summary?.availableBalance ?? "0").toFixed(2)}` },
              { label: "Margin",    value: `${parseFloat(summary?.totalMarginUsed ?? "0").toFixed(2)}` },
              { label: "Positions", value: `${summary?.openPositions ?? 0}` },
              { label: "PnL Today", value: `${todayPnl >= 0 ? "+" : ""}${todayPnl.toFixed(2)}`,
                cls: todayPnl >= 0 ? "text-up" : "text-down" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-bg-surface2 rounded-xl px-2 py-2 text-center">
                <p className="font-outfit text-[9px] text-text-muted leading-tight">{label}</p>
                <p className={cn("font-price text-xs font-semibold mt-0.5", cls ?? "text-text-primary")}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Positions list ── */}
      <div className="px-3 mt-3">
        {/* Tab bar */}
        <div className="flex gap-0 mb-3 border-b border-border">
          {(["positions", "orders"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-2 font-outfit text-xs font-semibold capitalize transition-all border-b-2 -mb-px",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-muted")}>
              {t === "positions" ? `Positions (${summary?.openPositions ?? 0})` : "Order History"}
            </button>
          ))}
        </div>

        {tab === "positions" && (
          isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
            </div>
          ) : !summary?.positions?.length ? (
            <div className="text-center py-10">
              <p className="font-outfit text-text-muted text-sm">No open positions</p>
              <p className="font-outfit text-text-muted text-xs mt-1">Use the form above to open a long or short</p>
            </div>
          ) : (
            <div className="space-y-3">
              {summary.positions.map(pos => (
                <PositionCard key={pos.id} pos={pos} onClose={id => closeMutation.mutate(id)} />
              ))}
            </div>
          )
        )}

        {tab === "orders" && (
          <div className="text-center py-10">
            <p className="font-outfit text-text-muted text-sm">Order history coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}

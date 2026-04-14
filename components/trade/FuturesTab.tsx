"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { usePrices } from "@/lib/store";
import { sanitizeNumberInput, formatPrice } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface MarketData {
  markPrice: string; indexPrice: string; fundingRate: string;
  fundingCountdownSeconds: number; openInterest: string;
  volume24h: string; change24h: string;
}
interface FuturesPosition {
  id: string; symbol: string; side: "long" | "short"; status: string;
  leverage: number; margin: string; margin_mode?: "isolated" | "cross";
  notional: string; quantity: string; entry_price: string;
  mark_price?: string; liquidation_price: string;
  take_profit?: string; stop_loss?: string;
  realised_pnl?: string; unrealisedPnl?: string; roe?: string;
  opened_at: string;
}
interface FuturesSummary {
  tradingBalance: string; openPositions: number; totalMarginUsed: string;
  availableBalance: string; todayPnl: string; positions: FuturesPosition[];
}
export interface FuturesTabProps { symbol: string; onSymbolChange: (s: string) => void; }
type OrderType = "market" | "limit" | "tp_sl";
type MarginMode = "isolated" | "cross";

function formatCountdown(sec: number): string {
  if (sec <= 0) return "0m";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function FundingBadge({ rate }: { rate: string }) {
  const n = parseFloat(rate) * 100, isPos = n >= 0;
  return (
    <span className={cn("font-price text-[10px] px-1.5 py-0.5 rounded font-semibold",
      isPos ? "bg-up/15 text-up" : "bg-down/15 text-down")}>
      {isPos ? "+" : ""}{n.toFixed(4)}%
    </span>
  );
}
function PositionCard({ pos, onClose, onEditTpSl }: {
  pos: FuturesPosition; onClose: (id: string) => void;
  onEditTpSl: (pos: FuturesPosition) => void;
}) {
  const pnl = parseFloat(pos.unrealisedPnl ?? "0"), roe = parseFloat(pos.roe ?? "0");
  const isProfit = pnl >= 0;
  const mode = pos.margin_mode ?? "isolated";
  return (
    <div className="card mb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("px-2 py-0.5 rounded-lg font-outfit text-xs font-bold",
            pos.side === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down")}>
            {pos.side === "long" ? "↑ Long" : "↓ Short"}
          </span>
          <span className="font-syne font-bold text-sm text-text-primary">{pos.symbol}</span>
          <span className="font-price text-xs text-primary">{pos.leverage}×</span>
          <span className="font-outfit text-[10px] text-text-muted bg-bg-surface2 px-1.5 py-0.5 rounded">{mode}</span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onEditTpSl(pos)}
            className="px-2 py-1 rounded-lg border border-border font-outfit text-[10px] text-primary">TP/SL</button>
          <button onClick={() => onClose(pos.id)}
            className="px-2 py-1 rounded-lg border border-down/30 font-outfit text-[10px] text-down">Close</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {[
          { label: "Entry",      value: `$${parseFloat(pos.entry_price).toFixed(4)}` },
          { label: "Mark",       value: pos.mark_price ? `$${parseFloat(pos.mark_price).toFixed(4)}` : "—" },
          { label: "Margin",     value: `${parseFloat(pos.margin).toFixed(2)} USDT` },
          { label: "Liq. Price", value: mode === "cross" ? "~varies" : `$${parseFloat(pos.liquidation_price).toFixed(4)}`, cls: "text-down" },
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
        <div className="flex gap-4 mt-1.5">
          {pos.take_profit && <span className="font-outfit text-[10px] text-up">TP: ${parseFloat(pos.take_profit).toFixed(4)}</span>}
          {pos.stop_loss   && <span className="font-outfit text-[10px] text-down">SL: ${parseFloat(pos.stop_loss).toFixed(4)}</span>}
        </div>
      )}
    </div>
  );
}

const MAX_LEV: Record<string, number> = {
  BTC:125,ETH:100,BNB:75,SOL:75,XRP:75,ADA:75,DOGE:75,AVAX:50,LINK:50,DOT:50,DEFAULT:50,
};

export function FuturesTab({ symbol }: FuturesTabProps) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { prices } = usePrices();

  const [riskAcked, setRiskAcked] = useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem("futures_risk_warned") === "1"
  );
  const [side, setSide] = useState<"long" | "short">("long");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [marginMode, setMarginMode] = useState<MarginMode>("isolated");
  const [leverage, setLeverage] = useState(20);
  const [leverageEdit, setLeverageEdit] = useState(false);
  const [leverageInput, setLeverageInput] = useState("20");
  const [marginInput, setMarginInput] = useState("");
  const [marginPct, setMarginPct] = useState(0);
  const [limitPrice, setLimitPrice] = useState("");
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"positions"|"orders"|"history">("positions");
  const [tpSlTarget, setTpSlTarget] = useState<FuturesPosition | null>(null);
  const [editTp, setEditTp] = useState("");
  const [editSl, setEditSl] = useState("");

  const sym = symbol.toUpperCase().replace("USDT", "");
  const maxLev = MAX_LEV[sym] ?? MAX_LEV.DEFAULT!;
  const livePrice = prices[`${sym}USDT`] ?? "0";

  const { data: mkt } = useQuery<MarketData>({
    queryKey: ["futures", "market", sym],
    queryFn: () => apiGet<MarketData>(`/futures/market-data?symbol=${sym}`),
    refetchInterval: 5000, staleTime: 4000,
  });
  const { data: summary, isLoading: sumLoading } = useQuery<FuturesSummary>({
    queryKey: ["futures", "summary"],
    queryFn: () => apiGet<FuturesSummary>("/futures/summary"),
    refetchInterval: 5000,
  });

  const available = parseFloat(summary?.availableBalance ?? "0");

  function handleMarginInput(val: string) {
    const clean = sanitizeNumberInput(val, 4);
    setMarginInput(clean);
    if (available > 0) setMarginPct(Math.min(100, (parseFloat(clean || "0") / available) * 100));
  }
  function handleMarginSlider(pct: number) {
    setMarginPct(pct);
    if (available > 0) setMarginInput(((available * pct) / 100).toFixed(2));
  }

  const markPrice = mkt?.markPrice ?? livePrice;
  const entryPrice = orderType === "limit" && limitPrice ? limitPrice : markPrice;
  const ep = parseFloat(entryPrice) || 0;
  const margin = parseFloat(marginInput || "0");
  const notional = margin * leverage;
  const qty = ep > 0 ? (notional / ep).toFixed(6) : "0";
  const mmr = sym === "BTC" || sym === "ETH" ? 0.004 : 0.005;
  const liqPrice = marginMode === "cross" ? null
    : side === "long"
      ? (ep * (1 - 1 / leverage + mmr)).toFixed(2)
      : (ep * (1 + 1 / leverage - mmr)).toFixed(2);
  const fee = (notional * 0.0004).toFixed(4);

  const openMutation = useMutation({
    mutationFn: () => apiPost("/futures/open", {
      symbol: `${sym}USDT`, side, margin: marginInput, leverage, marginMode,
      takeProfit: tp || undefined, stopLoss: sl || undefined, orderType,
      ...(orderType === "limit" && limitPrice ? { limitPrice } : {}),
    }),
    onSuccess: (data: { message: string }) => {
      toast.success("Position opened", data.message);
      setMarginInput(""); setMarginPct(0); setTp(""); setSl(""); setLimitPrice("");
      qc.invalidateQueries({ queryKey: ["futures"] });
    },
    onError: (err) => toast.error("Failed to open", err instanceof Error ? err.message : ""),
  });
  const closeMutation = useMutation({
    mutationFn: (id: string) =>
      apiPost<{ message: string; realisedPnl: string; roe: string }>(`/futures/close/${id}`, {}),
    onSuccess: (data) => {
      toast.success("Position closed", `PnL: ${data.realisedPnl} USDT (${data.roe})`);
      qc.invalidateQueries({ queryKey: ["futures"] });
    },
    onError: (err) => toast.error("Close failed", err instanceof Error ? err.message : ""),
  });
  const tpSlMutation = useMutation({
    mutationFn: ({ id, tp: t, sl: s }: { id: string; tp: string; sl: string }) =>
      apiPost(`/futures/${id}/tp-sl`, { takeProfit: t || null, stopLoss: s || null }),
    onSuccess: () => { toast.success("TP/SL updated"); setTpSlTarget(null); qc.invalidateQueries({ queryKey: ["futures"] }); },
  });

  const todayPnl = parseFloat(summary?.todayPnl ?? "0");
  const openCount = summary?.openPositions ?? 0;
  const totalUnrealised = (summary?.positions ?? []).reduce((s, p) => s + parseFloat(p.unrealisedPnl ?? "0"), 0);
  const change24h = parseFloat(mkt?.change24h ?? "0");

  if (!riskAcked) {
    return (
      <div className="px-4 py-10 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center text-2xl">⚠️</div>
        <p className="font-syne font-bold text-base text-text-primary">Futures Risk Warning</p>
        <p className="font-outfit text-sm text-text-muted leading-relaxed max-w-xs">
          Futures trading carries significant risk. You may lose your entire margin — or more in
          cross margin mode. Only trade with funds you can afford to lose.
        </p>
        <button onClick={() => { localStorage.setItem("futures_risk_warned","1"); setRiskAcked(true); }}
          className="btn-primary w-full max-w-xs">I understand, continue</button>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* Stats bar */}
      <div className="mx-3 mt-2 px-3 py-2.5 rounded-xl bg-bg-surface border border-border space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-syne font-bold text-sm text-text-primary">{sym}/USDT Perp</span>
            <span className={cn("font-price text-[10px] px-1.5 py-0.5 rounded font-semibold",
              change24h >= 0 ? "text-up" : "text-down")}>
              {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
            </span>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(["isolated","cross"] as const).map(m => (
              <button key={m} onClick={() => {
                  if (m === "cross") toast.success("Cross Margin","Your entire trading balance is collateral. Higher risk.");
                  setMarginMode(m);
                }}
                className={cn("px-2 py-1 font-outfit text-[10px] font-medium capitalize transition-colors",
                  marginMode === m ? "bg-primary/10 text-primary" : "text-text-muted")}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <p className="font-outfit text-[9px] text-text-muted">Mark</p>
            <p className="font-price text-sm font-bold text-text-primary">
              {mkt?.markPrice ? `$${parseFloat(mkt.markPrice).toLocaleString()}` : formatPrice(livePrice)}
            </p>
          </div>
          <div>
            <p className="font-outfit text-[9px] text-text-muted">Index</p>
            <p className="font-price text-xs text-text-secondary">
              {mkt?.indexPrice ? `$${parseFloat(mkt.indexPrice).toLocaleString()}` : "—"}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-outfit text-[9px] text-text-muted">Funding / {formatCountdown(mkt?.fundingCountdownSeconds ?? 0)}</p>
            {mkt ? <FundingBadge rate={mkt.fundingRate} /> : <span className="font-price text-[10px] text-text-muted">—</span>}
          </div>
        </div>
        {mkt && (
          <div className="flex items-center gap-3 text-[10px] text-text-muted font-outfit pt-0.5 border-t border-border/40">
            <span>OI: {parseFloat(mkt.openInterest).toFixed(0)} {sym}</span>
            <span>Vol: ${(parseFloat(mkt.volume24h) / 1e6).toFixed(1)}M</span>
          </div>
        )}
      </div>

      {/* Order type tabs */}
      <div className="mx-3 mt-2.5 flex rounded-xl overflow-hidden border border-border">
        {(["market","limit","tp_sl"] as const).map(t => (
          <button key={t} onClick={() => setOrderType(t)}
            className={cn("flex-1 py-2 font-outfit text-xs font-semibold transition-all",
              orderType === t ? "bg-primary/10 text-primary" : "text-text-muted")}>
            {t === "tp_sl" ? "TP/SL" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Long/Short */}
      <div className="mx-3 mt-2.5 flex rounded-xl overflow-hidden border border-border">
        <button onClick={() => setSide("long")}
          className={cn("flex-1 py-2.5 font-outfit font-bold text-sm transition-all",
            side === "long" ? "bg-up text-white" : "text-text-muted")}>↑ Long</button>
        <button onClick={() => setSide("short")}
          className={cn("flex-1 py-2.5 font-outfit font-bold text-sm transition-all",
            side === "short" ? "bg-down text-white" : "text-text-muted")}>↓ Short</button>
      </div>

      <div className="mx-3 mt-2.5 space-y-3">
        {/* Leverage slider */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="font-outfit text-xs text-text-muted">Leverage</label>
            {leverageEdit ? (
              <input type="number" min={1} max={maxLev} value={leverageInput}
                onChange={e => setLeverageInput(e.target.value)}
                onBlur={() => {
                  const v = Math.min(maxLev, Math.max(1, parseInt(leverageInput)||1));
                  setLeverage(v); setLeverageInput(String(v)); setLeverageEdit(false);
                }}
                className="w-16 text-center input-field py-1 font-price text-sm" autoFocus />
            ) : (
              <button onClick={() => { setLeverageEdit(true); setLeverageInput(String(leverage)); }}
                className="font-price text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
                {leverage}×
              </button>
            )}
          </div>
          <input type="range" min={1} max={maxLev} step={1} value={leverage}
            onChange={e => { const v = Number(e.target.value); setLeverage(v); setLeverageInput(String(v)); }}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(to right, var(--color-primary) ${(leverage/maxLev)*100}%, var(--color-border) ${(leverage/maxLev)*100}%)` }} />
          <div className="flex justify-between mt-0.5">
            <span className="font-price text-[9px] text-text-muted">1×</span>
            <span className="font-price text-[9px] text-text-muted">{maxLev}×</span>
          </div>
        </div>

        {/* Margin input + continuous slider */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Margin (USDT)</label>
          <div className="relative">
            <input type="text" inputMode="decimal" value={marginInput}
              onChange={e => handleMarginInput(e.target.value)}
              className="input-field font-price pr-14" placeholder="0.00" />
            <button onClick={() => handleMarginSlider(100)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary font-outfit text-xs font-semibold bg-primary/10 px-2 py-1 rounded-lg">
              Max
            </button>
          </div>
          <div className="mt-2">
            <input type="range" min={0} max={100} step={1} value={marginPct}
              onChange={e => handleMarginSlider(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, var(--color-primary) ${marginPct}%, var(--color-border) ${marginPct}%)` }} />
            <div className="flex justify-between mt-0.5">
              <span className="font-price text-[9px] text-text-muted">0%</span>
              <span className="font-price text-[10px] text-primary font-bold">{marginPct.toFixed(0)}%</span>
              <span className="font-price text-[9px] text-text-muted">Max</span>
            </div>
          </div>
        </div>

        {/* Limit price */}
        {orderType === "limit" && (
          <div>
            <label className="block font-outfit text-xs text-text-muted mb-1.5">Limit Price (USDT)</label>
            <input type="text" inputMode="decimal" value={limitPrice}
              onChange={e => setLimitPrice(sanitizeNumberInput(e.target.value, 2))}
              className="input-field font-price"
              placeholder={markPrice ? parseFloat(markPrice).toFixed(2) : "0.00"} />
          </div>
        )}

        {/* TP/SL always visible */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-outfit text-xs text-up mb-1">Take Profit</label>
            <input type="text" inputMode="decimal" value={tp}
              onChange={e => setTp(sanitizeNumberInput(e.target.value, 2))}
              className="input-field text-up border-up/30 focus:border-up/60 font-price" placeholder="0.00" />
          </div>
          <div>
            <label className="block font-outfit text-xs text-down mb-1">Stop Loss</label>
            <input type="text" inputMode="decimal" value={sl}
              onChange={e => setSl(sanitizeNumberInput(e.target.value, 2))}
              className="input-field text-down border-down/30 focus:border-down/60 font-price" placeholder="0.00" />
          </div>
        </div>

        {/* Order summary */}
        {margin > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Notional",   value: `$${notional.toFixed(2)}` },
              { label: "Qty",        value: `${qty} ${sym}` },
              { label: "Liq. Price", value: marginMode === "cross" ? "~varies" : liqPrice ? `$${parseFloat(liqPrice).toLocaleString()}` : "—", cls: "text-down" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="text-center py-2 rounded-xl bg-bg-surface2 border border-border">
                <p className="font-outfit text-[9px] text-text-muted uppercase tracking-wide">{label}</p>
                <p className={cn("font-price text-xs font-semibold mt-0.5", cls ?? "text-text-primary")}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Avail + fee */}
        <div className="flex items-center justify-between px-1">
          <span className="font-outfit text-xs text-text-muted">
            Avail: <span className="text-text-secondary font-semibold">{available.toFixed(2)} USDT</span>
          </span>
          {margin > 0 && (
            <span className="font-outfit text-xs text-text-muted">
              Fee: <span className="text-text-secondary">{fee} USDT</span>
            </span>
          )}
        </div>

        {/* Open button */}
        <button onClick={() => openMutation.mutate()}
          disabled={openMutation.isPending || !marginInput || margin <= 0}
          className={cn("w-full py-3.5 rounded-xl font-outfit font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50",
            side === "long" ? "bg-up text-white" : "bg-down text-white")}>
          {openMutation.isPending
            ? "Opening…"
            : `Open ${side === "long" ? "Long" : "Short"} ${leverage}× · ${marginInput || "0"} USDT`}
        </button>
      </div>

      {/* Fixed bottom positions bar */}
      <div className="fixed bottom-16 left-0 right-0 px-3 z-10">
        <button onClick={() => setSheetOpen(true)}
          className="w-full px-4 py-2.5 rounded-xl border bg-bg-surface/95 backdrop-blur border-border shadow-lg flex items-center justify-between">
          <span className="font-outfit text-sm font-semibold text-text-primary">Positions ({openCount})</span>
          <span className={cn("font-price text-sm font-bold", totalUnrealised >= 0 ? "text-up" : "text-down")}>
            PnL: {totalUnrealised >= 0 ? "+" : ""}{totalUnrealised.toFixed(4)} USDT
          </span>
        </button>
      </div>

      {/* Positions sheet */}
      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Positions">
        <div className="flex border-b border-border mb-3">
          {(["positions","orders","history"] as const).map(t => (
            <button key={t} onClick={() => setSheetTab(t)}
              className={cn("flex-1 py-2 font-outfit text-xs font-semibold capitalize transition-all border-b-2 -mb-px",
                sheetTab === t ? "border-primary text-primary" : "border-transparent text-text-muted")}>
              {t === "positions" ? `Positions (${openCount})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {sheetTab === "positions" && (
          <div className="px-1">
            {sumLoading ? (
              <div className="space-y-3">{[1,2].map(i => <div key={i} className="skeleton h-32 rounded-2xl"/>)}</div>
            ) : !(summary?.positions?.length) ? (
              <div className="py-12 text-center">
                <p className="font-outfit text-text-muted text-sm">No open positions</p>
                <p className="font-outfit text-text-muted text-xs mt-1">Use the form above to open one</p>
              </div>
            ) : summary.positions.map(pos => (
              <PositionCard key={pos.id} pos={pos}
                onClose={id => closeMutation.mutate(id)}
                onEditTpSl={p => { setTpSlTarget(p); setEditTp(p.take_profit ?? ""); setEditSl(p.stop_loss ?? ""); }} />
            ))}
          </div>
        )}
        {sheetTab === "orders" && (
          <div className="py-10 text-center">
            <p className="font-outfit text-text-muted text-sm">Pending limit orders appear here</p>
          </div>
        )}
        {sheetTab === "history" && (
          <div className="py-10 text-center">
            <p className="font-outfit text-text-muted text-sm">Closed positions history coming soon</p>
          </div>
        )}

        {/* Account summary strip */}
        <div className="mx-1 mt-2 mb-4 grid grid-cols-4 gap-2">
          {[
            { label: "Available", value: `${available.toFixed(2)}` },
            { label: "Margin",    value: `${parseFloat(summary?.totalMarginUsed ?? "0").toFixed(2)}` },
            { label: "Positions", value: `${openCount}` },
            { label: "PnL Today", value: `${todayPnl >= 0 ? "+" : ""}${todayPnl.toFixed(2)}`, cls: todayPnl >= 0 ? "text-up" : "text-down" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-bg-surface2 rounded-xl px-2 py-2 text-center">
              <p className="font-outfit text-[9px] text-text-muted leading-tight">{label}</p>
              <p className={cn("font-price text-xs font-semibold mt-0.5", cls ?? "text-text-primary")}>{value}</p>
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* Edit TP/SL sheet */}
      {tpSlTarget && (
        <BottomSheet isOpen={!!tpSlTarget} onClose={() => setTpSlTarget(null)} title={`Edit TP/SL · ${tpSlTarget.symbol}`}>
          <div className="px-1 space-y-3 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-outfit text-xs text-up mb-1">Take Profit</label>
                <input type="text" inputMode="decimal" value={editTp}
                  onChange={e => setEditTp(sanitizeNumberInput(e.target.value, 2))}
                  className="input-field text-up border-up/30 font-price" placeholder="0.00" />
              </div>
              <div>
                <label className="block font-outfit text-xs text-down mb-1">Stop Loss</label>
                <input type="text" inputMode="decimal" value={editSl}
                  onChange={e => setEditSl(sanitizeNumberInput(e.target.value, 2))}
                  className="input-field text-down border-down/30 font-price" placeholder="0.00" />
              </div>
            </div>
            <button
              onClick={() => tpSlMutation.mutate({ id: tpSlTarget.id, tp: editTp, sl: editSl })}
              disabled={tpSlMutation.isPending}
              className="btn-primary w-full disabled:opacity-50">
              {tpSlMutation.isPending ? "Saving…" : "Save TP/SL"}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

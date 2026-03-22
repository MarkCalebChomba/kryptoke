"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useToastActions } from "@/components/shared/ToastContainer";
import { useWallet } from "@/lib/hooks/useWallet";
import { usePrices } from "@/lib/store";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { sanitizeNumberInput, formatPrice } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

type BotType = "grid" | "dca" | "rebalance";

const BOT_TYPES = [
  {
    id: "grid" as BotType,
    name: "Grid Trading",
    icon: "⊞",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    description: "Auto-buy low and sell high within a price range. Profits from price oscillations.",
    bestFor: "Sideways / volatile markets",
  },
  {
    id: "dca" as BotType,
    name: "DCA Bot",
    icon: "📅",
    color: "text-up",
    bg: "bg-up/10",
    border: "border-up/30",
    description: "Buy a fixed amount at regular intervals regardless of price.",
    bestFor: "Long-term accumulation",
  },
  {
    id: "rebalance" as BotType,
    name: "Rebalancing",
    icon: "⚖",
    color: "text-gold",
    bg: "bg-gold/10",
    border: "border-gold/30",
    description: "Maintain target portfolio allocations automatically.",
    bestFor: "Portfolio management",
  },
];

const POPULAR_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT"];
const DCA_FREQUENCIES = ["Hourly", "Daily", "Weekly", "Bi-Weekly", "Monthly"] as const;

/* ─── Grid Bot Config Sheet ─────────────────────────────────────────────── */
function GridBotSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast   = useToastActions();
  const qc      = useQueryClient();
  const { prices } = usePrices();
  const [pair,       setPair]       = useState("BTC/USDT");
  const [lowerPrice, setLowerPrice] = useState("");
  const [upperPrice, setUpperPrice] = useState("");
  const [grids,      setGrids]      = useState("10");
  const [investment, setInvestment] = useState("");
  const [takeProfitPct, setTakeProfitPct] = useState("");
  const [stopLossPct,   setStopLossPct]   = useState("");

  const symbol       = pair.split("/")[0] ?? "BTC";
  const currentPrice = parseFloat(prices[`${symbol}USDT`] ?? "0");

  function autoFill() {
    if (currentPrice > 0) {
      setLowerPrice((currentPrice * 0.9).toFixed(2));
      setUpperPrice((currentPrice * 1.1).toFixed(2));
    }
  }

  const gridCount  = parseInt(grids) || 0;
  const lp         = parseFloat(lowerPrice) || 0;
  const up         = parseFloat(upperPrice) || 0;
  const gridSpread = gridCount > 1 && up > lp ? ((up - lp) / gridCount).toFixed(4) : null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Grid Trading Bot" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {/* Pair */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Trading Pair</label>
          <div className="flex gap-2 flex-wrap">
            {POPULAR_PAIRS.map(p => (
              <button key={p} onClick={() => setPair(p)}
                className={cn("px-3 py-1.5 rounded-lg font-outfit text-xs border transition-all",
                  pair === p ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Current price */}
        {currentPrice > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-bg-surface2 border border-border">
            <span className="font-outfit text-xs text-text-muted">Current price</span>
            <div className="flex items-center gap-2">
              <span className="font-price text-sm font-semibold text-text-primary">{formatPrice(currentPrice.toString())}</span>
              <button onClick={autoFill} className="font-outfit text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                AI Fill
              </button>
            </div>
          </div>
        )}

        {/* Price range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-outfit text-xs text-text-muted mb-1">Lower Price</label>
            <input type="text" inputMode="decimal" value={lowerPrice}
              onChange={e => setLowerPrice(sanitizeNumberInput(e.target.value, 4))}
              className="input-field" placeholder="0.00" />
          </div>
          <div>
            <label className="block font-outfit text-xs text-text-muted mb-1">Upper Price</label>
            <input type="text" inputMode="decimal" value={upperPrice}
              onChange={e => setUpperPrice(sanitizeNumberInput(e.target.value, 4))}
              className="input-field" placeholder="0.00" />
          </div>
        </div>

        {/* Grid count */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="font-outfit text-xs text-text-muted">Number of Grids</label>
            {gridSpread && <span className="font-price text-[10px] text-text-muted">~${gridSpread} per grid</span>}
          </div>
          <input type="number" value={grids} onChange={e => setGrids(e.target.value)}
            className="input-field" min="2" max="200" />
          <div className="flex gap-1.5 mt-2">
            {[5, 10, 20, 50].map(n => (
              <button key={n} onClick={() => setGrids(String(n))}
                className="flex-1 py-1 rounded-lg bg-bg-surface2 border border-border font-outfit text-[10px] text-text-muted active:bg-bg-surface text-center">
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Investment */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1">Investment (USDT)</label>
          <input type="text" inputMode="decimal" value={investment}
            onChange={e => setInvestment(sanitizeNumberInput(e.target.value, 4))}
            className="input-field" placeholder="Min 10 USDT" />
        </div>

        {/* TP / SL optional */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-outfit text-xs text-text-muted mb-1">Take Profit %</label>
            <input type="text" inputMode="decimal" value={takeProfitPct}
              onChange={e => setTakeProfitPct(sanitizeNumberInput(e.target.value, 2))}
              className="input-field text-up" placeholder="Optional" />
          </div>
          <div>
            <label className="block font-outfit text-xs text-text-muted mb-1">Stop Loss %</label>
            <input type="text" inputMode="decimal" value={stopLossPct}
              onChange={e => setStopLossPct(sanitizeNumberInput(e.target.value, 2))}
              className="input-field text-down" placeholder="Optional" />
          </div>
        </div>

        <p className="font-outfit text-[10px] text-gold/80 bg-gold/5 border border-gold/20 rounded-lg px-3 py-2 leading-relaxed">
          Grid bots work best in sideways markets with predictable oscillations. Past performance does not guarantee future results.
        </p>

        <button
          onClick={() => {
            apiPost("/account/bots", {
              type: "grid", pair,
              config: { lowerPrice, upperPrice, grids: parseInt(grids), investment, takeProfitPct, stopLossPct },
            }).then(() => {
              toast.success("Grid bot created", `Running ${grids} grids on ${pair}`);
              qc?.invalidateQueries({ queryKey: ["bots"] });
              onClose();
            }).catch((err: unknown) => toast.error("Failed", err instanceof Error ? err.message : ""));
          }}
          disabled={!lowerPrice || !upperPrice || !investment}
          className="btn-primary disabled:opacity-50">
          Create Grid Bot
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── DCA Bot Config Sheet ──────────────────────────────────────────────── */
function DcaBotSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc    = useQueryClient();
  const [pair,      setPair]      = useState("BTC/USDT");
  const [amount,    setAmount]    = useState("");
  const [frequency, setFrequency] = useState<typeof DCA_FREQUENCIES[number]>("Daily");
  const [periods,   setPeriods]   = useState("30");

  const totalCost = amount && periods
    ? (parseFloat(amount) * parseInt(periods)).toFixed(2)
    : null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="DCA Bot" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {/* Pair */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Asset to Buy</label>
          <div className="flex gap-2 flex-wrap">
            {POPULAR_PAIRS.map(p => (
              <button key={p} onClick={() => setPair(p)}
                className={cn("px-3 py-1.5 rounded-lg font-outfit text-xs border transition-all",
                  pair === p ? "bg-up/15 border-up/40 text-up" : "border-border text-text-muted")}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1">Amount per Purchase (USDT)</label>
          <input type="text" inputMode="decimal" value={amount}
            onChange={e => setAmount(sanitizeNumberInput(e.target.value, 4))}
            className="input-field" placeholder="10.00" />
        </div>

        {/* Frequency */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Purchase Frequency</label>
          <div className="flex gap-2 flex-wrap">
            {DCA_FREQUENCIES.map(f => (
              <button key={f} onClick={() => setFrequency(f)}
                className={cn("px-3 py-1.5 rounded-lg font-outfit text-xs border transition-all",
                  frequency === f ? "bg-up/15 border-up/40 text-up" : "border-border text-text-muted")}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Periods */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1">Number of Purchases</label>
          <input type="number" value={periods} onChange={e => setPeriods(e.target.value)}
            className="input-field" min="2" max="365" />
        </div>

        {/* Summary */}
        {totalCost && (
          <div className="bg-bg-surface2 rounded-xl border border-border px-4 py-3">
            <div className="flex justify-between">
              <span className="font-outfit text-xs text-text-muted">Total investment</span>
              <span className="font-price text-sm font-semibold text-text-primary">${totalCost} USDT</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="font-outfit text-xs text-text-muted">Frequency</span>
              <span className="font-outfit text-xs text-text-primary">{frequency} · {periods}x</span>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            apiPost("/account/bots", {
              type: "dca", pair,
              config: { amount: parseFloat(amount), frequency, periods: parseInt(periods) },
            }).then(() => {
              toast.success("DCA bot created", `Buying ${pair} ${frequency.toLowerCase()}`);
              qc?.invalidateQueries({ queryKey: ["bots"] });
              onClose();
            }).catch((err: unknown) => toast.error("Failed", err instanceof Error ? err.message : ""));
          }}
          disabled={!amount || !periods}
          className="w-full py-3 rounded-xl bg-up font-syne font-bold text-sm text-white disabled:opacity-50">
          Start DCA Bot
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Active Bot Card ───────────────────────────────────────────────────── */
interface ActiveBot {
  id: string;
  type: BotType;
  pair: string;
  status: "running" | "paused" | "stopped";
  total_profit: string;
  trades_count: number;
  started_at: string;
  config: Record<string, unknown>;
}

function BotCard({ bot, onPause, onStop }: { bot: ActiveBot; onPause: () => void; onStop: () => void }) {
  const cfg = BOT_TYPES.find(b => b.id === bot.type) ?? BOT_TYPES[0]!;
  const pnlPos = parseFloat(bot.total_profit ?? "0") >= 0;

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0", cfg.bg)}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-outfit text-sm font-semibold text-text-primary">{cfg.name}</p>
            <span className={cn("text-[10px] font-bold font-outfit px-2 py-0.5 rounded-lg",
              bot.status === "running" ? "text-up bg-up/10" : "text-gold bg-gold/10")}>
              {bot.status === "running" ? "Running" : "Paused"}
            </span>
          </div>
          <p className="font-outfit text-xs text-text-muted">{bot.pair} · {new Date(bot.started_at).toLocaleDateString("en-KE")}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={cn("font-price text-sm font-bold", pnlPos ? "text-up" : "text-down")}>
            {pnlPos ? "+" : ""}{parseFloat(bot.total_profit ?? "0").toFixed(4)} USDT
          </p>
          <p className="font-outfit text-[10px] text-text-muted">{bot.trades_count ?? 0} trades</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onPause}
          className="flex-1 py-1.5 rounded-lg border border-border font-outfit text-xs text-text-muted active:bg-bg-surface2">
          {bot.status === "running" ? "Pause" : "Resume"}
        </button>
        <button onClick={onStop}
          className="flex-1 py-1.5 rounded-lg border border-down/40 font-outfit text-xs text-down active:bg-down/10">
          Stop
        </button>
      </div>
    </div>
  );
}


/* ─── Rebalance Bot Sheet ─────────────────────────────────────────────────── */
function RebalanceBotSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const [investment, setInvestment] = useState("");
  const ALLOCATIONS = [
    { asset: "BTC",  pct: 40 },
    { asset: "ETH",  pct: 30 },
    { asset: "BNB",  pct: 15 },
    { asset: "SOL",  pct: 15 },
  ];

  const createMutation = useMutation({
    mutationFn: () => apiPost("/account/bots", {
      type: "rebalance",
      pair: "PORTFOLIO",
      config: { investment: parseFloat(investment), allocations: ALLOCATIONS, rebalanceThreshold: 5 },
    }),
    onSuccess: () => {
      toast.success("Rebalancing bot created", "Portfolio will auto-balance when allocations drift >5%");
      qc.invalidateQueries({ queryKey: ["bots"] });
      setInvestment("");
      onClose();
    },
    onError: (err: unknown) => toast.error("Failed to create bot", err instanceof Error ? err.message : ""),
  });

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Rebalancing Bot" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        <p className="font-outfit text-xs text-text-muted leading-relaxed">
          Automatically maintains your target portfolio allocation. When any asset drifts more than 5% from its target, the bot rebalances by selling overweighted assets and buying underweighted ones.
        </p>

        {/* Target allocations */}
        <div>
          <p className="font-outfit text-xs font-semibold text-text-secondary mb-2">Target Allocation</p>
          <div className="space-y-2">
            {ALLOCATIONS.map(({ asset, pct }) => (
              <div key={asset} className="flex items-center gap-3">
                <span className="font-outfit text-sm font-semibold text-text-primary w-10">{asset}</span>
                <div className="flex-1 h-2 rounded-full bg-bg-surface2">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="font-price text-sm text-primary w-8 text-right">{pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Investment */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1">Initial Investment (USDT)</label>
          <input type="text" inputMode="decimal" value={investment}
            onChange={e => setInvestment(e.target.value.replace(/[^0-9.]/g, ""))}
            className="input-field" placeholder="Min 100 USDT" />
        </div>

        <p className="font-outfit text-[10px] text-gold/80 bg-gold/5 border border-gold/20 rounded-lg px-3 py-2 leading-relaxed">
          Rebalancing triggers sell orders which may have tax implications. Past performance does not guarantee future results.
        </p>

        <button
          onClick={() => createMutation.mutate()}
          disabled={!investment || parseFloat(investment) < 100 || createMutation.isPending}
          className="btn-primary disabled:opacity-50">
          {createMutation.isPending ? "Creating..." : "Create Rebalancing Bot"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function BotsPage() {
  const [activeSheet, setActiveSheet] = useState<BotType | null>(null);
  const qc = useQueryClient();
  const toast = useToastActions();

  const { data: botsData, isLoading } = useQuery({
    queryKey: ["bots"],
    queryFn: () => apiGet<{ data: ActiveBot[] }>("/account/bots"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const bots = botsData?.data ?? [];

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch(`/account/bots/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bots"] }),
    onError: () => toast.error("Failed to update bot"),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/account/bots/${id}`),
    onSuccess: () => { toast.success("Bot stopped"); qc.invalidateQueries({ queryKey: ["bots"] }); },
  });

  return (
    <div className="screen">
      <TopBar title="Trading Bots" showBack />

      {/* Stats bar */}
      <div className="mx-4 mt-4 grid grid-cols-3 gap-2">
        {[
          { label: "Active Bots",   value: bots.filter(b => b.status === "running").length.toString() },
          { label: "Total Profit",  value: `$${bots.reduce((s,b) => s + parseFloat(b.total_profit ?? "0"), 0).toFixed(2)}` },
          { label: "Total Trades",  value: bots.reduce((s,b) => s + (b.trades_count ?? 0), 0).toString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-bg-surface2 rounded-xl px-3 py-2.5 border border-border text-center">
            <p className="font-price text-sm font-semibold text-text-primary">{value}</p>
            <p className="font-outfit text-[9px] text-text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Bot type cards */}
      <div className="px-4 mt-4 mb-2">
        <p className="font-syne font-bold text-sm text-text-primary mb-3">Choose a Bot Type</p>
        <div className="space-y-2">
          {BOT_TYPES.map(bot => (
            <button
              key={bot.id}
              onClick={() => setActiveSheet(bot.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left active:scale-[0.98] transition-all",
                bot.border, bot.bg
              )}>
              <span className="text-2xl flex-shrink-0">{bot.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={cn("font-syne font-bold text-sm", bot.color)}>{bot.name}</p>
                <p className="font-outfit text-xs text-text-muted mt-0.5">{bot.description}</p>
                <p className="font-outfit text-[10px] text-text-muted mt-0.5">
                  Best for: <span className={bot.color}>{bot.bestFor}</span>
                </p>
              </div>
              <span className={cn("text-xl flex-shrink-0", bot.color)}>→</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active bots list */}
      {isLoading ? (
        <div className="px-4 mt-4 space-y-3">
          {[1,2].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : bots.filter(b => b.status !== "stopped").length > 0 && (
        <div className="px-4 mt-4">
          <p className="font-syne font-bold text-sm text-text-primary mb-3">Active Bots</p>
          <div className="space-y-3">
            {bots.filter(b => b.status !== "stopped").map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                onPause={() => patchMutation.mutate({
                  id: bot.id,
                  status: bot.status === "running" ? "paused" : "running",
                })}
                onStop={() => stopMutation.mutate(bot.id)}
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && bots.filter(b => b.status !== "stopped").length === 0 && (
        <div className="py-8 text-center px-6">
          <p className="text-4xl mb-3">🤖</p>
          <p className="font-syne font-bold text-base text-text-primary mb-1">No active bots</p>
          <p className="font-outfit text-sm text-text-muted">
            Create a bot above to start automated trading. Bots run 24/7 even when you&apos;re offline.
          </p>
        </div>
      )}

      {/* Sheets */}
      <GridBotSheet  isOpen={activeSheet === "grid"}      onClose={() => setActiveSheet(null)} />
      <DcaBotSheet   isOpen={activeSheet === "dca"}       onClose={() => setActiveSheet(null)} />
      <RebalanceBotSheet isOpen={activeSheet === "rebalance"} onClose={() => setActiveSheet(null)} />
    </div>
  );
}

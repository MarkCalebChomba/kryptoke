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

const SUPPORTED_ASSETS = [
  { symbol: "BTC",  name: "Bitcoin" },
  { symbol: "ETH",  name: "Ethereum" },
  { symbol: "BNB",  name: "BNB" },
  { symbol: "SOL",  name: "Solana" },
  { symbol: "XRP",  name: "XRP" },
  { symbol: "ADA",  name: "Cardano" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "AVAX", name: "Avalanche" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "DOT",  name: "Polkadot" },
  { symbol: "MATIC",name: "Polygon" },
  { symbol: "UNI",  name: "Uniswap" },
];

const FREQUENCIES = [
  { id: "hourly",    label: "Hourly",    description: "Every hour" },
  { id: "daily",     label: "Daily",     description: "Once per day" },
  { id: "weekly",    label: "Weekly",    description: "Once per week" },
  { id: "biweekly",  label: "Bi-weekly", description: "Every 2 weeks" },
  { id: "monthly",   label: "Monthly",   description: "Once per month" },
];

interface DcaPlan {
  id: string;
  asset: string;
  amountPerCycle: string;
  frequency: string;
  totalInvested: string;
  currentValue: string;
  status: "active" | "paused";
  nextRun: string;
  cyclesCompleted: number;
}

/* ─── Create Plan Sheet ─────────────────────────────────────────────────── */
function CreatePlanSheet({ isOpen, onClose }: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { prices } = usePrices();
  const { usdtBalance } = useWallet();

  const [selectedAsset, setSelectedAsset] = useState("BTC");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [search, setSearch] = useState("");

  const currentPrice = parseFloat(prices[`${selectedAsset}USDT`] ?? "0");
  const estimatedUnits = amount && currentPrice > 0
    ? (parseFloat(amount) / currentPrice).toFixed(8)
    : null;

  const filteredAssets = SUPPORTED_ASSETS.filter(a =>
    a.symbol.includes(search.toUpperCase()) || a.name.toLowerCase().includes(search.toLowerCase())
  );

  const createMutation = useMutation({
    mutationFn: () => apiPost("/account/dca/plans", {
      asset: selectedAsset,
      amountPerCycle: parseFloat(amount),
      frequency,
    }),
    onSuccess: () => {
      const freqLabel = FREQUENCIES.find(f => f.id === frequency)?.label ?? frequency;
      toast.success("Plan created!", `Buying ${selectedAsset} ${freqLabel.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["dca", "plans"] });
      setAmount("");
      onClose();
    },
    onError: (err: unknown) => toast.error("Failed to create plan", err instanceof Error ? err.message : ""),
  });

  function handleCreate() {
    if (!amount || parseFloat(amount) < 1) { toast.error("Minimum $1 USDT per cycle"); return; }
    if (parseFloat(amount) > parseFloat(usdtBalance)) { toast.error("Insufficient USDT balance"); return; }
    createMutation.mutate();
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Create Auto-Invest Plan" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {/* Asset picker */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Asset to Buy</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="input-field text-sm mb-2" placeholder="Search..." />
          <div className="flex gap-2 flex-wrap max-h-24 overflow-y-auto no-scrollbar">
            {filteredAssets.map(a => (
              <button key={a.symbol} onClick={() => { setSelectedAsset(a.symbol); setSearch(""); }}
                className={cn("flex-shrink-0 px-3 py-1.5 rounded-lg font-outfit text-xs border transition-all",
                  selectedAsset === a.symbol
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border text-text-muted")}>
                {a.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Current price */}
        {currentPrice > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-bg-surface2 border border-border">
            <span className="font-outfit text-xs text-text-muted">{selectedAsset} price now</span>
            <span className="font-price text-sm font-semibold text-text-primary">{formatPrice(currentPrice.toString())}</span>
          </div>
        )}

        {/* Amount */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="font-outfit text-xs text-text-muted">Amount per Purchase (USDT)</label>
            <span className="font-outfit text-xs text-text-muted">
              Balance: {parseFloat(usdtBalance).toFixed(2)} USDT
            </span>
          </div>
          <input type="text" inputMode="decimal" value={amount}
            onChange={e => setAmount(sanitizeNumberInput(e.target.value, 4))}
            className="input-field" placeholder="Min 1 USDT" />
          {estimatedUnits && (
            <p className="font-outfit text-[10px] text-text-muted mt-1">
              ≈ {estimatedUnits} {selectedAsset} per cycle
            </p>
          )}
          {/* Quick amounts */}
          <div className="flex gap-1.5 mt-2">
            {["10", "25", "50", "100"].map(n => (
              <button key={n} onClick={() => setAmount(n)}
                className="flex-1 py-1 rounded-lg bg-bg-surface2 border border-border font-outfit text-[10px] text-text-muted text-center">
                ${n}
              </button>
            ))}
          </div>
        </div>

        {/* Frequency */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Purchase Frequency</label>
          <div className="space-y-1.5">
            {FREQUENCIES.map(f => (
              <button key={f.id} onClick={() => setFrequency(f.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all text-left",
                  frequency === f.id
                    ? "border-primary/50 bg-primary/8"
                    : "border-border bg-transparent"
                )}>
                <div>
                  <p className={cn("font-outfit text-sm font-semibold", frequency === f.id ? "text-primary" : "text-text-primary")}>
                    {f.label}
                  </p>
                  <p className="font-outfit text-xs text-text-muted">{f.description}</p>
                </div>
                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                  frequency === f.id ? "border-primary bg-primary" : "border-border")}>
                  {frequency === f.id && <div className="w-1.5 h-1.5 rounded-full bg-bg" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={!amount || createMutation.isPending}
          className="btn-primary disabled:opacity-50">
          {createMutation.isPending ? "Creating..." : `Create Plan — ${amount ? `$${amount}` : ""} ${selectedAsset} ${FREQUENCIES.find(f => f.id === frequency)?.label ?? ""}`}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Plan Card ─────────────────────────────────────────────────────────── */
function PlanCard({ plan, onToggle, onDelete }: {
  plan: DcaPlan;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { prices } = usePrices();
  const currentPrice = parseFloat(prices[`${plan.asset}USDT`] ?? "0");
  const totalInvested = parseFloat(plan.totalInvested);
  const currentValue  = parseFloat(plan.currentValue);
  const pnl           = currentValue - totalInvested;
  const pnlPct        = totalInvested > 0 ? ((pnl / totalInvested) * 100).toFixed(2) : "0";
  const isPos         = pnl >= 0;

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
          <span className="font-price text-sm font-bold text-primary">{plan.asset.slice(0, 2)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-outfit text-sm font-semibold text-text-primary">{plan.asset}/USDT</p>
            <span className={cn("text-[10px] font-bold font-outfit px-2 py-0.5 rounded-lg",
              plan.status === "active" ? "text-up bg-up/10" : "text-gold bg-gold/10")}>
              {plan.status === "active" ? "Active" : "Paused"}
            </span>
          </div>
          <p className="font-outfit text-[10px] text-text-muted">
            ${plan.amountPerCycle} · {plan.frequency} · {plan.cyclesCompleted} cycles
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-price text-sm font-semibold text-text-primary">
            ${parseFloat(plan.currentValue || plan.amountPerCycle).toFixed(2)}
          </p>
          {totalInvested > 0 && (
            <p className={cn("font-price text-[10px]", isPos ? "text-up" : "text-down")}>
              {isPos ? "+" : ""}{pnl.toFixed(2)} ({isPos ? "+" : ""}{pnlPct}%)
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="font-outfit text-[10px] text-text-muted">{plan.nextRun}</p>
        {currentPrice > 0 && (
          <p className="font-outfit text-[10px] text-text-muted">
            Current: {formatPrice(currentPrice.toString())}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={onToggle}
          className="flex-1 py-1.5 rounded-lg border border-border font-outfit text-xs text-text-muted active:bg-bg-surface2">
          {plan.status === "active" ? "Pause" : "Resume"}
        </button>
        <button onClick={onDelete}
          className="flex-1 py-1.5 rounded-lg border border-down/40 font-outfit text-xs text-down active:bg-down/10">
          Delete
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function AutoInvestPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();
  const toast = useToastActions(); // qc already declared above

  const { data: plansData, isLoading } = useQuery({
    queryKey: ["dca", "plans"],
    queryFn: () => apiGet<{ data: DcaPlan[] }>("/account/dca/plans"),
    staleTime: 30_000,
  });

  const plans: DcaPlan[] = plansData?.data ?? [];
  const totalInvested = plans.reduce((s, p) => s + parseFloat(p.totalInvested || p.total_invested || "0"), 0);

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch(`/account/dca/plans/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dca", "plans"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/account/dca/plans/${id}`),
    onSuccess: () => { toast.success("Plan deleted"); qc.invalidateQueries({ queryKey: ["dca", "plans"] }); },
  });

  return (
    <div className="screen">
      <TopBar title="Auto-Invest" showBack />

      {/* Summary */}
      <div className="mx-4 mt-4 card">
        <p className="font-outfit text-xs text-text-muted mb-1">Total Invested</p>
        <p className="font-price text-2xl font-medium text-text-primary mb-3">
          ${totalInvested.toFixed(2)} <span className="text-sm text-text-muted font-normal">USDT</span>
        </p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-bg-surface2 rounded-lg py-2">
            <p className="font-price text-sm font-semibold text-text-primary">{plans.filter(p => p.status === "active").length}</p>
            <p className="font-outfit text-[10px] text-text-muted">Active Plans</p>
          </div>
          <div className="bg-bg-surface2 rounded-lg py-2">
            <p className="font-price text-sm font-semibold text-text-primary">
              {plans.reduce((s, p) => s + p.cyclesCompleted, 0)}
            </p>
            <p className="font-outfit text-[10px] text-text-muted">Total Purchases</p>
          </div>
        </div>
      </div>

      {/* Explainer */}
      <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
        <p className="font-syne font-bold text-xs text-primary mb-1">What is Auto-Invest?</p>
        <p className="font-outfit text-xs text-text-muted leading-relaxed">
          Automatically buy crypto at regular intervals — daily, weekly, or monthly. DCA (dollar-cost averaging) reduces the impact of volatility on your purchases.
        </p>
      </div>

      {/* Create button */}
      <div className="px-4 mt-4">
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          + Create New Plan
        </button>
      </div>

      {/* Plans */}
      {isLoading ? (
        <div className="px-4 mt-4 space-y-3">
          {[1,2].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : plans.length > 0 ? (
        <div className="px-4 mt-4 space-y-3">
          <p className="font-syne font-bold text-sm text-text-primary">Your Plans</p>
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onToggle={() => toggleMutation.mutate({
                id: plan.id,
                status: (plan.status ?? "active") === "active" ? "paused" : "active",
              })}
              onDelete={() => deleteMutation.mutate(plan.id)}
            />
          ))}
        </div>
      ) : (
        <div className="py-10 text-center px-6">
          <p className="text-4xl mb-3">📈</p>
          <p className="font-syne font-bold text-base text-text-primary mb-1">No plans yet</p>
          <p className="font-outfit text-sm text-text-muted">
            Create your first auto-invest plan to start building your crypto portfolio automatically.
          </p>
        </div>
      )}

      <CreatePlanSheet
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}

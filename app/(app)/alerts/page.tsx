"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useToastActions } from "@/components/shared/ToastContainer";
import { apiGet, apiPost, apiDelete } from "@/lib/api/client";
import { usePrices } from "@/lib/store";
import { formatPrice, sanitizeNumberInput } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import type { PriceAlert, CreateAlertPayload } from "@/types";

// Major coins for quick picker
const QUICK_COINS = [
  { symbol: "BTC",  name: "Bitcoin" },
  { symbol: "ETH",  name: "Ethereum" },
  { symbol: "BNB",  name: "BNB" },
  { symbol: "SOL",  name: "Solana" },
  { symbol: "XRP",  name: "XRP" },
  { symbol: "ADA",  name: "Cardano" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "AVAX", name: "Avalanche" },
  { symbol: "DOT",  name: "Polkadot" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "MATIC",name: "Polygon" },
  { symbol: "UNI",  name: "Uniswap" },
];

/* ─── Create Alert Sheet ───────────────────────────────────────────────── */
function CreateAlertSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { prices } = usePrices();

  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [targetPrice, setTargetPrice] = useState("");
  const [search, setSearch] = useState("");

  const currentPrice = prices[`${selectedSymbol}USDT`] ?? "0";
  const filteredCoins = QUICK_COINS.filter(c =>
    c.symbol.includes(search.toUpperCase()) || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const createMutation = useMutation({
    mutationFn: (payload: CreateAlertPayload) => apiPost("/notifications/alerts", payload),
    onSuccess: () => {
      toast.success("Alert created", `You will be notified when ${selectedSymbol} goes ${condition} $${targetPrice}`);
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setTargetPrice("");
      onClose();
    },
    onError: (err) => toast.error("Failed to create alert", err instanceof Error ? err.message : ""),
  });

  function handleCreate() {
    if (!targetPrice || parseFloat(targetPrice) <= 0) {
      toast.error("Invalid price", "Please enter a valid target price");
      return;
    }
    createMutation.mutate({
      tokenAddress: `${selectedSymbol}USDT`,
      tokenSymbol: selectedSymbol,
      condition,
      price: targetPrice,
    });
  }

  // Quick-fill buttons
  const suggestions = currentPrice !== "0" ? [
    { label: "-10%", value: (parseFloat(currentPrice) * 0.9).toFixed(2) },
    { label: "-5%",  value: (parseFloat(currentPrice) * 0.95).toFixed(2) },
    { label: "+5%",  value: (parseFloat(currentPrice) * 1.05).toFixed(2) },
    { label: "+10%", value: (parseFloat(currentPrice) * 1.1).toFixed(2) },
  ] : [];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Create Price Alert" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {/* Coin search */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Asset</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field text-sm mb-2"
            placeholder="Search coin..."
          />
          <div className="flex gap-1.5 flex-wrap max-h-28 overflow-y-auto no-scrollbar">
            {filteredCoins.map(c => (
              <button key={c.symbol} onClick={() => { setSelectedSymbol(c.symbol); setSearch(""); }}
                className={cn("flex-shrink-0 px-3 py-1.5 rounded-lg font-outfit text-xs font-semibold border transition-all",
                  selectedSymbol === c.symbol
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border text-text-muted active:bg-bg-surface2")}>
                {c.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Current price */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-bg-surface2 border border-border">
          <span className="font-outfit text-xs text-text-muted">{selectedSymbol}/USDT current price</span>
          <span className="font-price text-sm font-semibold text-text-primary">{formatPrice(currentPrice)}</span>
        </div>

        {/* Condition */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Alert Condition</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setCondition("above")}
              className={cn("py-2.5 rounded-xl font-outfit text-sm font-semibold border-2 transition-all",
                condition === "above" ? "bg-up/15 border-up text-up" : "border-border text-text-muted")}>
              ↑ Price Above
            </button>
            <button onClick={() => setCondition("below")}
              className={cn("py-2.5 rounded-xl font-outfit text-sm font-semibold border-2 transition-all",
                condition === "below" ? "bg-down/15 border-down text-down" : "border-border text-text-muted")}>
              ↓ Price Below
            </button>
          </div>
        </div>

        {/* Target price */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Target Price (USDT)</label>
          <input
            type="text"
            inputMode="decimal"
            value={targetPrice}
            onChange={e => setTargetPrice(sanitizeNumberInput(e.target.value, 8))}
            className="input-field"
            placeholder={currentPrice !== "0" ? `Current: $${parseFloat(currentPrice).toLocaleString()}` : "0.00"}
          />
          {/* Quick suggestions */}
          {suggestions.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {suggestions.map(s => (
                <button key={s.label} onClick={() => setTargetPrice(s.value)}
                  className="flex-1 py-1 rounded-lg bg-bg-surface2 border border-border font-outfit text-[10px] text-text-muted active:bg-bg-surface text-center">
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleCreate}
          disabled={createMutation.isPending || !targetPrice}
          className="btn-primary disabled:opacity-50">
          {createMutation.isPending ? "Creating..." : `Alert when ${selectedSymbol} goes ${condition} $${targetPrice || "..."}`}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Alert Row ────────────────────────────────────────────────────────── */
function AlertRow({ alert, onDelete }: { alert: PriceAlert; onDelete: (id: string) => void }) {
  const { prices } = usePrices();
  const currentPrice = parseFloat(prices[`${alert.tokenSymbol}USDT`] ?? "0");
  const targetPrice  = parseFloat(alert.price);
  const distance     = currentPrice > 0
    ? ((targetPrice - currentPrice) / currentPrice * 100).toFixed(2)
    : null;

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0",
      alert.triggered && "opacity-60"
    )}>
      {/* Condition icon */}
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-price text-lg font-bold",
        alert.condition === "above" ? "bg-up/15 text-up" : "bg-down/15 text-down"
      )}>
        {alert.condition === "above" ? "↑" : "↓"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-outfit text-sm font-semibold text-text-primary">
          {alert.tokenSymbol}/USDT {alert.condition} ${parseFloat(alert.price).toLocaleString()}
        </p>
        <p className="font-outfit text-[10px] text-text-muted mt-0.5">
          {alert.triggered
            ? "Triggered"
            : distance !== null
              ? `${parseFloat(distance) >= 0 ? "+" : ""}${distance}% away`
              : "Watching..."}
        </p>
      </div>

      {/* Status + delete */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {alert.triggered ? (
          <span className="font-outfit text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
            Triggered
          </span>
        ) : (
          <span className="font-outfit text-[10px] font-bold text-up bg-up/10 px-2 py-0.5 rounded-lg">
            Active
          </span>
        )}
        <button
          onClick={() => onDelete(alert.id)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted active:bg-bg-surface2 text-lg leading-none">
          ×
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────────────────── */
export default function AlertsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToastActions();
  const qc    = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiGet<PriceAlert[]>("/notifications/alerts"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/notifications/alerts/${id}`),
    onSuccess: () => {
      toast.success("Alert deleted");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: () => toast.error("Failed to delete alert"),
  });

  const active    = (alerts ?? []).filter(a => !a.triggered);
  const triggered = (alerts ?? []).filter(a => a.triggered);

  return (
    <div className="screen">
      <TopBar title="Price Alerts" showBack />

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <p className="font-outfit text-xs text-text-muted mb-3">
          Get notified instantly when prices hit your targets. Set alerts for any coin.
        </p>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          + Create Alert
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3 px-4 pt-4">
          {[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : (alerts ?? []).length === 0 ? (
        <div className="py-16 text-center px-6">
          <p className="text-4xl mb-3">🔔</p>
          <p className="font-syne font-bold text-base text-text-primary mb-1">No alerts yet</p>
          <p className="font-outfit text-sm text-text-muted">
            Set price alerts and get notified when any coin hits your target.
          </p>
        </div>
      ) : (
        <div className="pt-2">
          {/* Active alerts */}
          {active.length > 0 && (
            <div className="mx-4 mt-3 border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-bg-surface2 border-b border-border">
                <p className="font-outfit text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Active — {active.length}
                </p>
              </div>
              {active.map(alert => (
                <AlertRow key={alert.id} alert={alert} onDelete={id => deleteMutation.mutate(id)} />
              ))}
            </div>
          )}

          {/* Triggered alerts */}
          {triggered.length > 0 && (
            <div className="mx-4 mt-3 border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-bg-surface2 border-b border-border flex items-center justify-between">
                <p className="font-outfit text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Triggered — {triggered.length}
                </p>
                <button
                  onClick={() => triggered.forEach(a => deleteMutation.mutate(a.id))}
                  className="font-outfit text-xs text-primary">
                  Clear all
                </button>
              </div>
              {triggered.map(alert => (
                <AlertRow key={alert.id} alert={alert} onDelete={id => deleteMutation.mutate(id)} />
              ))}
            </div>
          )}
        </div>
      )}

      <CreateAlertSheet isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

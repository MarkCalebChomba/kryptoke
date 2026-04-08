"use client";

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { useConvert } from "@/lib/hooks/useTrades";
import { useWallet } from "@/lib/hooks/useWallet";
import { useToastActions } from "@/components/shared/ToastContainer";
import { sanitizeNumberInput } from "@/lib/utils/formatters";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

interface ConvertHistoryItem {
  id: string;
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
  rate: string;
  fee_pct: string;
  status: string;
  created_at: string;
}

const PAIRS = [
  { from: "KES",  to: "USDT", label: "KES → USDT", icon: "🇰🇪" },
  { from: "USDT", to: "KES",  label: "USDT → KES",  icon: "💵" },
];

const QUICK_PCTS = [25, 50, 75, 100] as const;
const SPREAD = 0.005;

export default function ConvertPage() {
  const toast = useToastActions();
  const [activeTab, setActiveTab] = useState<"convert" | "history">("convert");
  const [fromAsset, setFromAsset] = useState("KES");
  const [toAsset,   setToAsset]   = useState("USDT");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { usdtBalance, kesBalance, rate } = useWallet();
  const { mutateAsync: convertAssets, isPending: submitting } = useConvert();

  const fromBalance = fromAsset === "KES" ? kesBalance : usdtBalance;
  const kesPerUsd   = parseFloat(rate?.kesPerUsd ?? "130");

  function handleAmountChange(val: string) {
    const clean = fromAsset === "KES" ? sanitizeNumberInput(val, 0) : sanitizeNumberInput(val, 6);
    setAmount(clean);
    clearTimeout(debounceRef.current);
  }

  const { data: history } = useQuery({
    queryKey: ["trade", "history"],
    queryFn: () => apiGet<ConvertHistoryItem[]>("/trade/history?limit=50"),
    enabled: activeTab === "history",
    staleTime: 30_000,
  });

  function swapDirection() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setAmount("");
  }

  function fillPct(pct: number) {
    const bal = parseFloat(fromBalance);
    if (bal <= 0) return;
    setAmount((bal * pct / 100).toFixed(fromAsset === "KES" ? 0 : 4));
  }

  async function handleConvert() {
    if (!amount || parseFloat(amount) <= 0 || submitting) return;
    try {
      const result = await convertAssets({ fromAsset, toAsset, amount });
      const received = parseFloat(result.toAmount);
      toast.success(
        "Converted successfully",
        `Received ${received.toFixed(toAsset === "KES" ? 0 : 6)} ${result.toAsset}`
      );
      setAmount("");
      setConfirming(false);
    } catch (err) {
      toast.error("Conversion failed", err instanceof Error ? err.message : "");
    }
  }

  const receiveAmount = (() => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return "";
    if (fromAsset === "KES") return (n / kesPerUsd * (1 - SPREAD)).toFixed(6);
    return (n * kesPerUsd * (1 - SPREAD)).toFixed(0);
  })();

  const feeEstimate = (() => {
    const n = parseFloat(amount);
    if (!n) return "";
    return fromAsset === "KES"
      ? `${(n * SPREAD).toFixed(0)} KES`
      : `${(n * SPREAD).toFixed(4)} USDT`;
  })();

  return (
    <div className="screen">
      <TopBar title="Convert" showBack />

      <div className="mx-4 mt-4 mb-4 tab-bar">
        <button data-active={activeTab === "convert"} onClick={() => setActiveTab("convert")} className="tab-item">Convert</button>
        <button data-active={activeTab === "history"} onClick={() => setActiveTab("history")} className="tab-item">History</button>
      </div>

      {activeTab === "convert" && (
        <div className="px-4 space-y-4">
          {/* Direction selector */}
          <div className="flex gap-2">
            {PAIRS.map((p) => (
              <button key={p.label}
                onClick={() => { setFromAsset(p.from); setToAsset(p.to); setAmount(""); }}
                className={cn("flex-1 py-2 rounded-xl border font-outfit text-xs font-semibold transition-all",
                  fromAsset === p.from && toAsset === p.to
                    ? "bg-primary/15 border-primary text-primary"
                    : "border-border text-text-muted")}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>

          {/* From field */}
          <div className="card space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="font-outfit text-xs text-text-muted">You Pay</p>
              <button onClick={() => fillPct(100)} className="font-outfit text-xs text-primary">
                Max: {fromAsset === "KES"
                  ? `KSh ${parseFloat(kesBalance).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`
                  : `${parseFloat(usdtBalance).toFixed(4)} USDT`}
              </button>
            </div>
            <div className="flex items-center gap-3 bg-bg-surface2 rounded-xl px-3 py-2.5 border border-border">
              <span className="font-outfit text-sm font-bold text-text-primary w-12">{fromAsset}</span>
              <input type="text" inputMode="decimal" value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="flex-1 bg-transparent font-price text-lg text-text-primary outline-none text-right"
                placeholder="0" />
            </div>
            <div className="flex gap-1.5">
              {QUICK_PCTS.map((pct) => (
                <button key={pct} onClick={() => fillPct(pct)}
                  className="flex-1 py-1 rounded-lg border border-border font-outfit text-[10px] text-text-muted active:bg-bg-surface2">
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Swap arrow */}
          <div className="flex justify-center">
            <button onClick={swapDirection}
              className="w-9 h-9 rounded-full border border-border bg-bg-surface2 flex items-center justify-center font-outfit text-base active:scale-90 transition-transform">
              ⇅
            </button>
          </div>

          {/* To field */}
          <div className="card">
            <p className="font-outfit text-xs text-text-muted mb-1">You Receive (estimated)</p>
            <div className="flex items-center gap-3 bg-bg-surface2 rounded-xl px-3 py-2.5 border border-border">
              <span className="font-outfit text-sm font-bold text-text-primary w-12">{toAsset}</span>
              <div className="flex-1 text-right">
                <span className="font-price text-lg text-text-primary">{receiveAmount || "0"}</span>
              </div>
            </div>
            <p className="font-outfit text-[10px] text-text-muted mt-1.5">
              Rate: 1 USD = KSh {kesPerUsd.toFixed(2)} · 0.5% spread included
            </p>
          </div>

          {!confirming ? (
            <button
              onClick={() => { if (!amount || parseFloat(amount) <= 0) return; setConfirming(true); }}
              disabled={!amount || parseFloat(amount) <= 0}
              className="btn-primary disabled:opacity-50">
              Preview Conversion
            </button>
          ) : (
            <div className="card border-primary/30 bg-primary/5 space-y-3">
              <p className="font-syne font-semibold text-sm text-text-primary">Confirm Conversion</p>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="font-outfit text-xs text-text-muted">You pay</span>
                  <span className="font-price text-sm text-text-primary">{amount} {fromAsset}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-outfit text-xs text-text-muted">You receive ~</span>
                  <span className="font-price text-sm text-up font-semibold">{receiveAmount} {toAsset}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-outfit text-xs text-text-muted">Rate</span>
                  <span className="font-price text-xs text-text-secondary">1 USD = KSh {kesPerUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-outfit text-xs text-text-muted">Fee (0.5%)</span>
                  <span className="font-price text-xs text-text-secondary">{feeEstimate}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setConfirming(false)}
                  className="py-2.5 rounded-xl border border-border font-outfit text-sm text-text-muted">
                  Cancel
                </button>
                <button onClick={handleConvert} disabled={submitting}
                  className="py-2.5 rounded-xl bg-primary font-outfit text-sm font-bold text-bg disabled:opacity-50">
                  {submitting ? "Converting…" : "Confirm"}
                </button>
              </div>
            </div>
          )}

          <div className="card bg-bg-surface2 space-y-2">
            <p className="font-outfit text-xs font-semibold text-text-primary">About Convert</p>
            <p className="font-outfit text-xs text-text-muted leading-relaxed">
              Convert exchanges between KES and USDT using internal balances — no external exchange
              involved. A 0.5% spread is included in the rate shown.
            </p>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="px-4">
          {!history ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : history.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-outfit text-text-muted text-sm">No conversions yet</p>
              <button onClick={() => setActiveTab("convert")} className="mt-3 font-outfit text-sm text-primary">
                Make your first conversion →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border/40 border border-border rounded-xl overflow-hidden mt-2">
              {history.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-3 bg-bg-surface">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="font-outfit text-xs font-bold text-primary">⇄</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-outfit text-sm font-medium text-text-primary">
                      {item.from_asset} → {item.to_asset}
                    </p>
                    <p className="font-outfit text-[10px] text-text-muted">
                      {new Date(item.created_at).toLocaleDateString("en-KE", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-price text-xs text-text-primary">
                      -{parseFloat(item.from_amount).toFixed(item.from_asset === "KES" ? 0 : 4)} {item.from_asset}
                    </p>
                    <p className="font-price text-xs text-up">
                      +{parseFloat(item.to_amount).toFixed(item.to_asset === "KES" ? 0 : 6)} {item.to_asset}
                    </p>
                  </div>
                  <span className={cn(
                    "font-outfit text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0",
                    item.status === "completed" ? "bg-up/15 text-up" : "bg-border text-text-muted"
                  )}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

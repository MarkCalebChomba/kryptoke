"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useToastActions } from "@/components/shared/ToastContainer";
import { useWallet } from "@/lib/hooks/useWallet";
import { usePrices } from "@/lib/store";
import { apiGet, apiPost, apiPatch } from "@/lib/api/client";
import { sanitizeNumberInput, formatPrice } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface LoanProduct {
  collateralAsset: string;
  loanAsset: string;
  maxLtv: number;       // e.g. 0.65 = 65%
  liquidationLtv: number; // e.g. 0.85
  dailyInterestRate: number; // e.g. 0.00055
  minLoanAmount: number;
  maxLoanAmount: number;
}

const LOAN_PRODUCTS: LoanProduct[] = [
  { collateralAsset: "BTC",  loanAsset: "USDT", maxLtv: 0.65, liquidationLtv: 0.83, dailyInterestRate: 0.00055, minLoanAmount: 100,  maxLoanAmount: 50000 },
  { collateralAsset: "ETH",  loanAsset: "USDT", maxLtv: 0.65, liquidationLtv: 0.83, dailyInterestRate: 0.00060, minLoanAmount: 100,  maxLoanAmount: 50000 },
  { collateralAsset: "BNB",  loanAsset: "USDT", maxLtv: 0.60, liquidationLtv: 0.80, dailyInterestRate: 0.00070, minLoanAmount: 50,   maxLoanAmount: 20000 },
  { collateralAsset: "SOL",  loanAsset: "USDT", maxLtv: 0.55, liquidationLtv: 0.75, dailyInterestRate: 0.00080, minLoanAmount: 50,   maxLoanAmount: 10000 },
  { collateralAsset: "AVAX", loanAsset: "USDT", maxLtv: 0.50, liquidationLtv: 0.70, dailyInterestRate: 0.00090, minLoanAmount: 50,   maxLoanAmount: 5000  },
];

interface ActiveLoan {
  id: string;
  collateralAsset: string;
  collateralAmount: string;
  loanAsset: string;
  loanAmount: string;
  interestAccrued: string;
  currentLtv: number;
  liquidationLtv: number;
  openedAt: string;
}

/* ─── Borrow Sheet ──────────────────────────────────────────────────────── */
function BorrowSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { prices } = usePrices();
  const [selectedProduct, setSelectedProduct] = useState(LOAN_PRODUCTS[0]!);
  const [collateralAmount, setCollateralAmount] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [duration, setDuration] = useState(30);

  const collateralPrice = parseFloat(prices[`${selectedProduct.collateralAsset}USDT`] ?? "0");
  const collateralUsdValue = collateralAmount && collateralPrice > 0
    ? parseFloat(collateralAmount) * collateralPrice
    : 0;
  const maxLoan = collateralUsdValue * selectedProduct.maxLtv;
  const ltv = collateralUsdValue > 0 && loanAmount
    ? (parseFloat(loanAmount) / collateralUsdValue * 100).toFixed(1)
    : null;
  const liquidationPrice = collateralAmount && loanAmount && parseFloat(loanAmount) > 0
    ? (parseFloat(loanAmount) / (parseFloat(collateralAmount) * selectedProduct.liquidationLtv)).toFixed(2)
    : null;
  const totalInterest = loanAmount
    ? (parseFloat(loanAmount) * selectedProduct.dailyInterestRate * duration).toFixed(4)
    : null;
  const annualRate = (selectedProduct.dailyInterestRate * 365 * 100).toFixed(2);

  const ltvNum = ltv ? parseFloat(ltv) : 0;
  const ltvColor = ltvNum >= selectedProduct.liquidationLtv * 100 * 0.9
    ? "text-down" : ltvNum >= selectedProduct.maxLtv * 100 * 0.8
    ? "text-gold" : "text-up";

  const borrowMutation = useMutation({
    mutationFn: () => apiPost("/account/loans", {
      collateralAsset:  selectedProduct.collateralAsset,
      collateralAmount: parseFloat(collateralAmount),
      loanAmount:       parseFloat(loanAmount),
      durationDays:     duration,
    }),
    onSuccess: () => {
      toast.success("Loan created", "USDT has been credited to your trading wallet");
      qc.invalidateQueries({ queryKey: ["loans"] });
      setCollateralAmount("");
      setLoanAmount("");
      onClose();
    },
    onError: (err: unknown) => toast.error("Loan failed", err instanceof Error ? err.message : ""),
  });

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Borrow Crypto" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {/* Collateral asset */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Collateral Asset</label>
          <div className="flex gap-2 flex-wrap">
            {LOAN_PRODUCTS.map(p => (
              <button key={p.collateralAsset} onClick={() => { setSelectedProduct(p); setCollateralAmount(""); setLoanAmount(""); }}
                className={cn("px-3 py-1.5 rounded-lg font-outfit text-xs border transition-all",
                  selectedProduct.collateralAsset === p.collateralAsset
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border text-text-muted")}>
                {p.collateralAsset}
              </button>
            ))}
          </div>
        </div>

        {/* Product info row */}
        {collateralPrice > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-bg-surface2 border border-border">
            <span className="font-outfit text-xs text-text-muted">{selectedProduct.collateralAsset} price</span>
            <span className="font-price text-sm font-semibold text-text-primary">{formatPrice(collateralPrice.toString())}</span>
          </div>
        )}

        {/* Collateral amount */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1">
            Collateral Amount ({selectedProduct.collateralAsset})
          </label>
          <input type="text" inputMode="decimal" value={collateralAmount}
            onChange={e => { setCollateralAmount(sanitizeNumberInput(e.target.value, 8)); setLoanAmount(""); }}
            className="input-field" placeholder="0.00" />
          {collateralUsdValue > 0 && (
            <p className="font-outfit text-[10px] text-text-muted mt-1">
              ≈ ${collateralUsdValue.toFixed(2)} USD · Max borrow: ${maxLoan.toFixed(2)} USDT
            </p>
          )}
        </div>

        {/* Loan amount */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1">Loan Amount (USDT)</label>
          <input type="text" inputMode="decimal" value={loanAmount}
            onChange={e => setLoanAmount(sanitizeNumberInput(e.target.value, 4))}
            className="input-field" placeholder="0.00" />
          {maxLoan > 0 && (
            <div className="flex gap-1.5 mt-2">
              {[0.25, 0.5, 0.75, 1].map(pct => (
                <button key={pct} onClick={() => setLoanAmount((maxLoan * pct).toFixed(2))}
                  className="flex-1 py-1 rounded-lg bg-bg-surface2 border border-border font-outfit text-[10px] text-text-muted text-center">
                  {pct * 100}%
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Duration */}
        <div>
          <label className="block font-outfit text-xs text-text-muted mb-1.5">Loan Duration</label>
          <div className="flex gap-1.5">
            {[7, 14, 30, 60, 90].map(d => (
              <button key={d} onClick={() => setDuration(d)}
                className={cn("flex-1 py-1.5 rounded-lg font-outfit text-xs border transition-all",
                  duration === d ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Risk summary */}
        {loanAmount && collateralAmount && (
          <div className="bg-bg-surface2 rounded-xl border border-border px-4 py-3 space-y-2">
            <p className="font-syne font-semibold text-xs text-text-primary mb-1">Loan Summary</p>
            {[
              { label: "LTV Ratio", value: ltv ? `${ltv}%`, valueClass: ltvColor },
              { label: "Liquidation Price", value: liquidationPrice ? `$${liquidationPrice}`, valueClass: "text-down" },
              { label: "Annual Rate (APR)", value: `${annualRate}%`, valueClass: "text-text-primary" },
              { label: "Est. Interest", value: totalInterest ? `${totalInterest} USDT`, valueClass: "text-text-primary" },
              { label: "Max LTV", value: `${(selectedProduct.maxLtv * 100).toFixed(0)}%`, valueClass: "text-text-muted" },
            ].map(({ label, value, valueClass }) => (
              <div key={label} className="flex justify-between">
                <span className="font-outfit text-xs text-text-muted">{label}</span>
                <span className={cn("font-price text-xs font-semibold", valueClass)}>{value}</span>
              </div>
            ))}
          </div>
        )}

        <p className="font-outfit text-[10px] text-gold/80 bg-gold/5 border border-gold/20 rounded-lg px-3 py-2 leading-relaxed">
          If your LTV exceeds {(selectedProduct.liquidationLtv * 100).toFixed(0)}%, your collateral will be partially liquidated to maintain the required ratio.
        </p>

        <button
          onClick={() => borrowMutation.mutate()}
          disabled={!loanAmount || !collateralAmount || parseFloat(loanAmount) < selectedProduct.minLoanAmount || borrowMutation.isPending}
          className="btn-primary disabled:opacity-50">
          {borrowMutation.isPending ? "Processing..." : `Borrow ${loanAmount ? `$${loanAmount}` : ""} USDT`}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── Active Loan Card ──────────────────────────────────────────────────── */
function ActiveLoanCard({ loan }: { loan: ActiveLoan }) {
  const ltvPct    = loan.currentLtv * 100;
  const liqPct    = loan.liquidationLtv * 100;
  const health    = Math.max(0, Math.min(100, ((liqPct - ltvPct) / liqPct) * 100));
  const ltvColor  = ltvPct >= liqPct * 0.9 ? "bg-down" : ltvPct >= liqPct * 0.75 ? "bg-gold" : "bg-up";
  const ltvText   = ltvPct >= liqPct * 0.9 ? "text-down" : ltvPct >= liqPct * 0.75 ? "text-gold" : "text-up";

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-outfit text-sm font-semibold text-text-primary">
            {loan.collateralAsset} → {loan.loanAsset}
          </p>
          <p className="font-outfit text-xs text-text-muted">
            {new Date(loan.openedAt).toLocaleDateString("en-KE")}
          </p>
        </div>
        <div className="text-right">
          <p className="font-price text-base font-bold text-text-primary">${parseFloat(loan.loanAmount).toLocaleString()}</p>
          <p className="font-outfit text-[10px] text-down">
            +${parseFloat(loan.interestAccrued).toFixed(4)} interest
          </p>
        </div>
      </div>

      {/* LTV health bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span className="font-outfit text-[10px] text-text-muted">LTV Health</span>
          <span className={cn("font-price text-[10px] font-bold", ltvText)}>{ltvPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-bg-surface2">
          <div className={cn("h-full rounded-full transition-all", ltvColor)} style={{ width: `${ltvPct / liqPct * 100}%` }} />
        </div>
        <p className="font-outfit text-[9px] text-text-muted mt-0.5">
          Liquidation at {liqPct.toFixed(0)}% · Collateral: {parseFloat(loan.collateralAmount).toFixed(4)} {loan.collateralAsset}
        </p>
      </div>

      <div className="flex gap-2">
        <button className="flex-1 py-1.5 rounded-lg bg-up/10 border border-up/30 font-outfit text-xs text-up text-center active:bg-up/20">
          Add Collateral
        </button>
        <button className="flex-1 py-1.5 rounded-lg bg-primary/10 border border-primary/30 font-outfit text-xs text-primary text-center active:bg-primary/20">
          Repay
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function LoansPage() {
  const [borrowOpen, setBorrowOpen] = useState(false);
  const qc = useQueryClient();

  const { data: loansData, isLoading: loansLoading } = useQuery({
    queryKey: ["loans", "active"],
    queryFn: () => apiGet<{ data: ActiveLoan[] }>("/account/loans"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const loans = loansData?.data ?? [];

  const repayMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) =>
      apiPost(`/account/loans/${id}/repay`, { amount: parseFloat(amount) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loans"] }),
  });

  return (
    <div className="screen">
      <TopBar title="Crypto Loans" showBack />

      {/* Hero */}
      <div className="mx-4 mt-4 card bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
        <p className="font-syne font-bold text-base text-text-primary mb-1">Borrow Without Selling</p>
        <p className="font-outfit text-xs text-text-muted leading-relaxed mb-3">
          Use your crypto as collateral to get instant USDT loans. Keep your long-term holdings while accessing liquidity.
        </p>
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div>
            <p className="font-price text-base font-bold text-primary">65%</p>
            <p className="font-outfit text-[10px] text-text-muted">Max LTV</p>
          </div>
          <div>
            <p className="font-price text-base font-bold text-primary">~0.2%</p>
            <p className="font-outfit text-[10px] text-text-muted">Daily Rate</p>
          </div>
          <div>
            <p className="font-price text-base font-bold text-primary">Instant</p>
            <p className="font-outfit text-[10px] text-text-muted">Disbursement</p>
          </div>
        </div>
        <button onClick={() => setBorrowOpen(true)} className="btn-primary">
          Borrow Now
        </button>
      </div>

      {/* How it works */}
      <div className="mx-4 mt-4">
        <p className="font-syne font-bold text-sm text-text-primary mb-3">How It Works</p>
        <div className="space-y-2">
          {[
            { step: "1", title: "Deposit Collateral", desc: "Lock BTC, ETH, or other supported coins" },
            { step: "2", title: "Borrow USDT",         desc: "Get up to 65% of your collateral value instantly" },
            { step: "3", title: "Use Your Funds",       desc: "Trade, earn, or use for any purpose" },
            { step: "4", title: "Repay & Retrieve",     desc: "Repay anytime to unlock your collateral" },
          ].map(s => (
            <div key={s.step} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-surface2 border border-border">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="font-price text-xs font-bold text-primary">{s.step}</span>
              </div>
              <div>
                <p className="font-outfit text-sm font-medium text-text-primary">{s.title}</p>
                <p className="font-outfit text-[10px] text-text-muted">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active loans */}
      {loansLoading ? (
        <div className="mx-4 mt-4 space-y-3">
          {[1,2].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : loans.length > 0 && (
        <div className="mx-4 mt-4">
          <p className="font-syne font-bold text-sm text-text-primary mb-3">Active Loans</p>
          <div className="space-y-3">
            {loans.map(loan => <ActiveLoanCard key={loan.id} loan={loan} />)}
          </div>
        </div>
      )}

      {/* Available rates table */}
      <div className="mx-4 mt-4 mb-6">
        <p className="font-syne font-bold text-sm text-text-primary mb-2">Available Products</p>
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-4 gap-0 px-4 py-2 bg-bg-surface2 border-b border-border">
            {["Asset", "LTV", "Liq. LTV", "Daily Rate"].map(h => (
              <p key={h} className="font-outfit text-[9px] text-text-muted uppercase tracking-wide">{h}</p>
            ))}
          </div>
          {LOAN_PRODUCTS.map(p => (
            <div key={p.collateralAsset} className="grid grid-cols-4 gap-0 px-4 py-2.5 border-b border-border/40 last:border-0">
              <p className="font-outfit text-sm font-semibold text-text-primary">{p.collateralAsset}</p>
              <p className="font-price text-sm text-up">{(p.maxLtv * 100).toFixed(0)}%</p>
              <p className="font-price text-sm text-down">{(p.liquidationLtv * 100).toFixed(0)}%</p>
              <p className="font-price text-sm text-text-primary">{(p.dailyInterestRate * 100).toFixed(3)}%</p>
            </div>
          ))}
        </div>
      </div>

      <BorrowSheet isOpen={borrowOpen} onClose={() => setBorrowOpen(false)} />
    </div>
  );
}

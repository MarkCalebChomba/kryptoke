"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useWallet } from "@/lib/hooks/useWallet";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { formatApr, sanitizeNumberInput } from "@/lib/utils/formatters";
import { calculateEarnEstimates } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type { EarnProduct, EarnPosition } from "@/types";

interface EarnProductCardProps {
  product: EarnProduct;
  onClick: () => void;
}

function ProductCard({ product, onClick }: EarnProductCardProps) {
  return (
    <button
      onClick={onClick}
      className="card text-left active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <span className="font-price text-xs text-primary">{product.asset.slice(0, 1)}</span>
        </div>
      </div>
      <p className="font-outfit text-sm font-semibold text-text-primary">{product.name}</p>
      <p className="font-price text-lg font-medium text-up mt-0.5">{formatApr(product.apr)}</p>
      <p className="font-outfit text-xs text-text-muted mt-0.5">
        {product.lockPeriodDays ? `${product.lockPeriodDays} days` : "Flexible"}
      </p>
    </button>
  );
}

const EARN_PRODUCTS: EarnProduct[] = [
  { id: "1", asset: "USDT", name: "USDT Simple Earn", apr: "10", lockPeriodDays: null, minSubscription: "1", interestFrequency: "daily", isComingSoon: false },
  { id: "2", asset: "BTC",  name: "BTC Simple Earn",  apr: "2.5", lockPeriodDays: null, minSubscription: "0.001", interestFrequency: "daily", isComingSoon: false },
  { id: "3", asset: "USDT", name: "Flash Earn",        apr: "30",  lockPeriodDays: 7,    minSubscription: "100", interestFrequency: "weekly", isComingSoon: false },
  { id: "4", asset: "BNB",  name: "On-chain Earn",     apr: "8.2", lockPeriodDays: null, minSubscription: "0.1", interestFrequency: "daily", isComingSoon: false },
  { id: "5", asset: "USDT", name: "Dual Investment",   apr: "45",  lockPeriodDays: 7,    minSubscription: "10", interestFrequency: "weekly", isComingSoon: false },
  { id: "6", asset: "USDT", name: "Crypto Loan",       apr: "0",   lockPeriodDays: null, minSubscription: "0", interestFrequency: "monthly", isComingSoon: false },
];

interface SubscribeSheetProps {
  product: EarnProduct | null;
  isOpen: boolean;
  onClose: () => void;
}

function SubscribeSheet({ product, isOpen, onClose }: SubscribeSheetProps) {
  const [amount, setAmount] = useState("");
  const { usdtBalance } = useWallet();
  const toast = useToastActions();
  const queryClient = useQueryClient();

  const estimates = amount
    ? calculateEarnEstimates(amount, product?.apr ?? "0")
    : { daily: "0", monthly: "0", yearly: "0" };

  const subscribe = useMutation({
    mutationFn: () => {
      if (!product?.asset || !amount || !product?.id) {
        throw new Error("Missing required fields");
      }
      return apiPost("/earn/subscribe", {
        asset: product.asset,
        amount: String(parseFloat(amount)),
        product: String(product.id),
      });
    },
    onSuccess: () => {
      toast.success("Subscribed", `Now earning ${product?.apr}% APR`);
      queryClient.invalidateQueries({ queryKey: ["wallet", "info"] });
      onClose();
      setAmount("");
    },
    onError: (err) => {
      toast.error("Subscription failed", err instanceof Error ? err.message : undefined);
    },
  });

  if (!product) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={product.name} showCloseButton>
      <div className="px-4 pb-6 space-y-4">
        {/* APR */}
        <div className="card-2 text-center">
          <p className="font-outfit text-xs text-text-muted">Annual Percentage Rate</p>
          <p className="font-price text-3xl font-medium text-up mt-1">{formatApr(product.apr)}</p>
          <p className="font-outfit text-xs text-text-muted mt-1">
            {product.lockPeriodDays ? `${product.lockPeriodDays}-day lock` : "Flexible — withdraw anytime"}
          </p>
        </div>

        {/* Amount */}
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="font-outfit text-sm text-text-secondary">Subscription amount</label>
            <span className="font-outfit text-xs text-text-muted">
              Available: {parseFloat(usdtBalance).toFixed(4)} {product.asset}
            </span>
          </div>
          <div className="relative">
            <input
              type="text" inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(sanitizeNumberInput(e.target.value))}
              className="input-field font-price pr-16"
              placeholder="0.00"
            />
            <button
              type="button"
              onClick={() => setAmount(usdtBalance)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-primary font-outfit text-xs font-semibold"
            >
              Max
            </button>
          </div>
        </div>

        {/* Estimates */}
        {amount && parseFloat(amount) > 0 && (
          <div className="card-2 space-y-2">
            <p className="font-outfit text-xs text-text-muted font-semibold uppercase">Estimated earnings</p>
            {[
              { label: "Daily", value: estimates.daily },
              { label: "Monthly", value: estimates.monthly },
              { label: "Yearly", value: estimates.yearly },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="font-outfit text-sm text-text-secondary">{label}</span>
                <span className="font-price text-sm text-up">+{parseFloat(value).toFixed(6)} {product.asset}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => subscribe.mutate()}
          disabled={!amount || parseFloat(amount) < parseFloat(product.minSubscription) || subscribe.isPending}
          className="btn-primary"
        >
          {subscribe.isPending ? "Subscribing..." : `Subscribe ${amount || "0"} ${product.asset}`}
        </button>

        <p className="font-outfit text-xs text-text-muted text-center">
          Min subscription: {product.minSubscription} {product.asset}
        </p>
      </div>
    </BottomSheet>
  );
}

export default function EarnPage() {
  const router = useRouter();
  const [selectedProduct, setSelectedProduct] = useState<EarnProduct | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const { data: positions } = useQuery({
    queryKey: ["earn", "positions"],
    queryFn: () => apiGet<EarnPosition[]>("/earn/positions"),
    staleTime: 60_000,
  });

  function handleProductClick(product: EarnProduct) {
    if (product.name === "Crypto Loan") {
      router.push("/loans");
      return;
    }
    setSelectedProduct(product);
    setSubscribeOpen(true);
  }

  const totalEarnUsd = (positions ?? [])
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)
    .toFixed(2);

  return (
    <div className="screen">
      <TopBar
        title="Earn"
        right={
          <button onClick={() => router.push("/analysis")} className="tap-target text-text-muted">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 3V18C3 18.5523 3.44772 19 4 19H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <path d="M7 14L11 9L14 12L18 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        }
      />

      {/* Earn hero card */}
      <div className="mx-4 mt-4 card">
        <p className="font-outfit text-xs text-text-muted uppercase tracking-wider mb-1">
          Est. Total Earn Value
        </p>
        <p className="font-price text-2xl font-medium text-text-primary">
          ${parseFloat(totalEarnUsd).toFixed(2)} USD
        </p>
        <div className="flex gap-4 mt-2">
          <div>
            <p className="font-outfit text-[10px] text-text-muted">Accrued interest</p>
            <p className="font-price text-sm text-up">
              +{(positions ?? []).reduce((sum, p) => sum + parseFloat((p as { accrued_interest?: string }).accrued_interest ?? p.accruedInterest ?? "0"), 0).toFixed(6)}
            </p>
          </div>
          <div>
            <p className="font-outfit text-[10px] text-text-muted">Active positions</p>
            <p className="font-price text-sm text-text-primary">{(positions ?? []).length}</p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 px-4 py-4">
        {[
          { label: "Simple Earn", onClick: () => handleProductClick(EARN_PRODUCTS[0]!) },
          { label: "Flash Earn",  onClick: () => handleProductClick(EARN_PRODUCTS[2]!) },
          { label: "On-chain",    onClick: () => handleProductClick(EARN_PRODUCTS[3]!) },
          { label: "Crypto Loan", onClick: () => router.push("/loans") },
        ].map(({ label, onClick }) => (
          <button key={label} onClick={onClick}
            className="flex-1 py-2.5 rounded-xl bg-bg-surface2 border border-border font-outfit text-[11px] text-text-muted active:scale-95 transition-transform">
            {label}
          </button>
        ))}
      </div>

      {/* Products grid */}
      <div className="px-4">
        <p className="font-syne font-bold text-base text-text-primary mb-3">Products</p>
        <div className="grid grid-cols-2 gap-3">
          {EARN_PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} onClick={() => handleProductClick(product)} />
          ))}
        </div>
      </div>

      {/* Active positions */}
      {(positions ?? []).length > 0 && (
        <div className="px-4 mt-6">
          <p className="font-syne font-bold text-base text-text-primary mb-3">Active Positions</p>
          {positions!.map((p) => (
            <div key={p.id} className="card mb-2">
              <div className="flex justify-between">
                <div>
                  <p className="font-outfit text-sm font-medium text-text-primary">{p.product}</p>
                  <p className="font-price text-xs text-up mt-0.5">{formatApr(p.apr)} APR</p>
                </div>
                <div className="text-right">
                  <p className="font-price text-sm text-text-primary">{parseFloat(p.amount).toFixed(4)} {p.asset}</p>
                  <p className="font-price text-xs text-up">+{parseFloat((p as { accrued_interest?: string }).accrued_interest ?? p.accruedInterest ?? "0").toFixed(6)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-6" />

      <SubscribeSheet
        product={selectedProduct}
        isOpen={subscribeOpen}
        onClose={() => { setSubscribeOpen(false); setSelectedProduct(null); }}
      />

    </div>
  );
}

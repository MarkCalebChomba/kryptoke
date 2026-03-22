"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { useWallet } from "@/lib/hooks/useWallet";
import { useAuth } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { apiGet, apiPost } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { sanitizeNumberInput } from "@/lib/utils/formatters";

// ─── Types ────────────────────────────────────────────────────────────────
interface P2PAd {
  id: string;
  side: "buy" | "sell";
  asset: string;
  fiat: string;
  price: string;                   // price per unit in KES
  available: string;               // how much crypto is available
  minOrder: string;                // min KES per order
  maxOrder: string;                // max KES per order
  paymentMethods: string[];
  merchantName: string;
  completionRate: number;
  totalTrades: number;
  isOnline: boolean;
  avgReleaseMins: number;
  rating: number;
}

interface P2PAdsResponse { data: P2PAd[]; total: number; }

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  "M-Pesa": "bg-[#4CAF50]/20 text-[#4CAF50]",
  "Bank Transfer": "bg-primary/15 text-primary",
  "Airtel Money": "bg-[#E53935]/20 text-[#E53935]",
  "Equity": "bg-[#E91E63]/20 text-[#E91E63]",
  "KCB": "bg-[#1565C0]/20 text-[#1565C0]",
};

// ─── Order Form Sheet ─────────────────────────────────────────────────────
function OrderSheet({ ad, onClose }: { ad: P2PAd; onClose: () => void }) {
  const toast = useToastActions();
  const { kesBalance, usdtBalance } = useWallet();
  const [fiatAmount, setFiatAmount] = useState("");
  const [step, setStep] = useState<"form" | "payment" | "confirm">("form");
  const [orderId, setOrderId] = useState<string | null>(null);

  const createOrderMutation = useMutation({
    mutationFn: () => apiPost<{ data: { id: string } }>("/p2p/orders", {
      ad_id: ad.id,
      fiat_amount: parseFloat(fiatAmount),
      payment_method: ad.paymentMethods[0] ?? "M-Pesa",
    }),
    onSuccess: (res) => {
      setOrderId(res.data?.id ?? null);
      setStep("payment");
    },
    onError: (err) => toast.error("Order failed", err instanceof Error ? err.message : "Please try again"),
  });

  const markPaidMutation = useMutation({
    mutationFn: () => apiPost(`/p2p/orders/${orderId}/paid`, {}),
    onSuccess: () => {
      toast.success("Payment confirmed", "Awaiting seller to release crypto. Usually under 15 minutes.");
      onClose();
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : ""),
  });

  const cryptoAmount = fiatAmount
    ? (parseFloat(fiatAmount) / parseFloat(ad.price)).toFixed(4)
    : "0";

  const isBuy = ad.side === "buy"; // user is buying crypto, paying KES
  const balance = isBuy ? kesBalance : usdtBalance;

  return (
    <BottomSheet isOpen onClose={onClose} title={`${isBuy ? "Buy" : "Sell"} ${ad.asset}`} showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {step === "form" && (
          <>
            {/* Merchant info */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-surface2 border border-border">
              <div className={cn("w-9 h-9 rounded-full flex items-center justify-center font-outfit font-bold text-sm",
                ad.isOnline ? "bg-up/20 text-up" : "bg-border text-text-muted")}>
                {ad.merchantName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-outfit text-sm font-semibold text-text-primary">{ad.merchantName}</p>
                <p className="font-outfit text-[10px] text-text-muted">
                  {ad.completionRate}% completion · {ad.totalTrades} trades · avg {ad.avgReleaseMins}min release
                </p>
              </div>
              <div className={cn("w-2 h-2 rounded-full", ad.isOnline ? "bg-up" : "bg-text-muted")} />
            </div>

            {/* Price */}
            <div className="flex justify-between items-center">
              <span className="font-outfit text-xs text-text-muted">Price per USDT</span>
              <span className="font-price text-lg font-bold text-text-primary">KSh {parseFloat(ad.price).toFixed(2)}</span>
            </div>

            {/* Amount input */}
            <div>
              <label className="block font-outfit text-xs text-text-secondary mb-1.5">
                {isBuy ? "You Pay (KES)" : "You Sell (USDT)"}
              </label>
              <input type="text" inputMode="decimal" value={fiatAmount}
                onChange={(e) => setFiatAmount(sanitizeNumberInput(e.target.value, isBuy ? 0 : 4))}
                className="input-field" placeholder={`Min ${isBuy ? "KSh" : ""} ${ad.minOrder}`} />
              <div className="flex justify-between mt-1">
                <span className="font-outfit text-[10px] text-text-muted">
                  Limit: {isBuy ? "KSh" : ""} {ad.minOrder} – {ad.maxOrder}
                </span>
                <span className="font-outfit text-[10px] text-text-muted">
                  Available: {ad.available} {ad.asset}
                </span>
              </div>
            </div>

            {/* You receive */}
            <div className="card bg-up/5 border-up/20">
              <div className="flex justify-between items-center">
                <span className="font-outfit text-xs text-text-muted">{isBuy ? "You Receive" : "You Receive"}</span>
                <span className="font-price text-base font-bold text-up">
                  {isBuy ? `${cryptoAmount} USDT` : `KSh ${fiatAmount ? (parseFloat(fiatAmount) * parseFloat(ad.price)).toFixed(0) : "0"}`}
                </span>
              </div>
            </div>

            {/* Payment methods */}
            <div>
              <p className="font-outfit text-xs text-text-muted mb-1.5">Payment Methods</p>
              <div className="flex flex-wrap gap-1.5">
                {ad.paymentMethods.map((pm) => (
                  <span key={pm} className={cn("font-outfit text-[10px] font-semibold px-2 py-1 rounded-full",
                    PAYMENT_METHOD_COLORS[pm] ?? "bg-border text-text-muted")}>
                    {pm}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => createOrderMutation.mutate()}
              disabled={!fiatAmount || parseFloat(fiatAmount) < parseFloat(ad.minOrder) || createOrderMutation.isPending}
              className={cn("w-full py-3 rounded-xl font-syne font-bold text-sm text-white disabled:opacity-50",
                isBuy ? "bg-up" : "bg-down")}>
              {createOrderMutation.isPending ? "Creating order..." : isBuy ? "Buy USDT" : "Sell USDT"}
            </button>
          </>
        )}

        {step === "payment" && (
          <>
            <div className="card border-gold/30 bg-gold/5">
              <p className="font-outfit text-xs text-gold font-semibold mb-1">Order Placed — Make Payment</p>
              <p className="font-outfit text-xs text-text-secondary leading-relaxed">
                Your order has been created. Send <strong className="text-text-primary">KSh {fiatAmount}</strong> to the
                seller via <strong className="text-text-primary">M-Pesa</strong>. The seller's USDT is held in escrow.
              </p>
            </div>
            <div className="card space-y-3">
              <p className="font-outfit text-xs text-text-muted">M-Pesa Payment Details</p>
              {[
                { label: "Send to",  value: "0712 XXX XXX (hidden for security)" },
                { label: "Amount",   value: `KSh ${fiatAmount}` },
                { label: "Reference", value: `P2P-${ad.id.toUpperCase()}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="font-outfit text-xs text-text-muted">{label}</span>
                  <span className="font-outfit text-xs font-semibold text-text-primary">{value}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { toast.error("Order cancelled"); onClose(); }}
                className="py-2.5 rounded-xl border border-border font-outfit text-sm text-text-muted">
                Cancel Order
              </button>
              <button
                onClick={() => markPaidMutation.mutate()}
                disabled={markPaidMutation.isPending}
                className="py-2.5 rounded-xl bg-up font-outfit text-sm font-bold text-white disabled:opacity-60">
                {markPaidMutation.isPending ? "Confirming..." : "Transferred ✓"}
              </button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

// ─── Main P2P Page ────────────────────────────────────────────────────────
export default function P2PPage() {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [asset, setAsset] = useState("USDT");
  const [payFilter, setPayFilter] = useState("All");
  const [activeAd, setActiveAd] = useState<P2PAd | null>(null);

  const ASSETS = ["USDT", "BTC", "ETH"];
  const PAY_METHODS = ["All", "M-Pesa", "Bank Transfer", "Airtel Money"];

  const { data: adsData, isLoading: adsLoading } = useQuery({
    queryKey: ["p2p", "ads", side, asset],
    queryFn: () => apiGet<P2PAdsResponse>(`/p2p/ads?type=${side === "buy" ? "sell" : "buy"}&asset=${asset}&fiat=KES`),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Map server field names to component field names
  const ads: P2PAd[] = (adsData?.data ?? [])
    .filter(ad => payFilter === "All" || ad.paymentMethods.includes(payFilter))
    .map(ad => ({
      ...ad,
      side: side === "buy" ? "buy" : "sell",
      fiat: ad.fiat_currency ?? "KES",
      price: ad.price_per_unit?.toString() ?? "0",
      available: ad.available_amount?.toString() ?? "0",
      minOrder: ad.min_order_kes?.toString() ?? "100",
      maxOrder: ad.max_order_kes?.toString() ?? "50000",
      merchantName: (ad as unknown as { users?: { display_name?: string } }).users?.display_name ?? "Merchant",
      completionRate: ad.completion_rate ?? 100,
      totalTrades: ad.trades_count ?? 0,
      isOnline: true,
      avgReleaseMins: ad.avg_release_min ?? 5,
      rating: 4.8,
    } as P2PAd));

  return (
    <div className="screen">
      <TopBar title="P2P Trading" showBack />

      {/* Buy / Sell toggle */}
      <div className="flex gap-0 mx-4 mt-4 mb-3 bg-bg-surface2 rounded-xl p-1">
        <button onClick={() => setSide("buy")}
          className={cn("flex-1 py-2 rounded-lg font-syne font-bold text-sm transition-all",
            side === "buy" ? "bg-up text-white" : "text-text-muted")}>
          Buy
        </button>
        <button onClick={() => setSide("sell")}
          className={cn("flex-1 py-2 rounded-lg font-syne font-bold text-sm transition-all",
            side === "sell" ? "bg-down text-white" : "text-text-muted")}>
          Sell
        </button>
      </div>

      {/* Asset + Payment filters */}
      <div className="px-4 space-y-2 mb-3">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {ASSETS.map(a => (
            <button key={a} onClick={() => setAsset(a)}
              className={cn("flex-shrink-0 px-3 py-1.5 rounded-lg font-outfit text-xs font-semibold border transition-all",
                asset === a ? "bg-primary/15 border-primary text-primary" : "border-border text-text-muted")}>
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {PAY_METHODS.map(pm => (
            <button key={pm} onClick={() => setPayFilter(pm)}
              className={cn("flex-shrink-0 px-2.5 py-1 rounded-lg font-outfit text-[10px] font-semibold border transition-all",
                payFilter === pm ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
              {pm}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-4 py-1.5 border-b border-border">
        <p className="flex-1 font-outfit text-[9px] text-text-muted uppercase tracking-wide">Advertiser</p>
        <p className="w-20 text-center font-outfit text-[9px] text-text-muted uppercase tracking-wide">Price</p>
        <p className="w-16 text-right font-outfit text-[9px] text-text-muted uppercase tracking-wide">Limit</p>
      </div>

      {/* Ad list */}
      <div className="divide-y divide-border/40">
        {adsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-2 animate-pulse">
              <div className="flex gap-2"><div className="skeleton w-8 h-8 rounded-full" /><div className="skeleton h-4 w-32 rounded" /></div>
              <div className="skeleton h-3 w-48 rounded" />
            </div>
          ))
        ) : ads.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-outfit text-sm text-text-muted">No offers available</p>
            <p className="font-outfit text-xs text-text-muted mt-1">Be the first to post an offer</p>
          </div>
        ) : ads.map((ad) => (
          <div key={ad.id} className="px-4 py-3">
            <div className="flex items-start gap-2 mb-2">
              {/* Merchant avatar */}
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-outfit font-bold text-xs flex-shrink-0 mt-0.5",
                ad.isOnline ? "bg-up/20 text-up" : "bg-border/30 text-text-muted")}>
                {ad.merchantName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-outfit text-sm font-semibold text-text-primary">{ad.merchantName}</span>
                  <span className={cn("w-1.5 h-1.5 rounded-full", ad.isOnline ? "bg-up" : "bg-text-muted")} />
                </div>
                <p className="font-outfit text-[10px] text-text-muted">
                  {ad.completionRate}% · {ad.totalTrades} trades · ~{ad.avgReleaseMins}min
                </p>
              </div>
              {/* Price */}
              <div className="text-right">
                <p className="font-price text-base font-bold text-text-primary">KSh {parseFloat(ad.price).toFixed(2)}</p>
                <p className="font-outfit text-[9px] text-text-muted">/USDT</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="font-outfit text-[10px] text-text-muted">
                  Available: <span className="text-text-secondary">{parseFloat(ad.available).toLocaleString()} {ad.asset}</span>
                </p>
                <p className="font-outfit text-[10px] text-text-muted">
                  Limit: <span className="text-text-secondary">KSh {parseFloat(ad.minOrder).toLocaleString()} – {parseFloat(ad.maxOrder).toLocaleString()}</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ad.paymentMethods.slice(0, 3).map(pm => (
                    <span key={pm} className={cn("font-outfit text-[8px] font-semibold px-1.5 py-0.5 rounded",
                      PAYMENT_METHOD_COLORS[pm] ?? "bg-border text-text-muted")}>
                      {pm}
                    </span>
                  ))}
                  {ad.paymentMethods.length > 3 && (
                    <span className="font-outfit text-[8px] text-text-muted">+{ad.paymentMethods.length - 3}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setActiveAd(ad)}
                className={cn("px-4 py-2 rounded-xl font-syne font-bold text-xs text-white",
                  side === "buy" ? "bg-up" : "bg-down")}>
                {side === "buy" ? "Buy" : "Sell"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="mx-4 my-4 card bg-primary/5 border-primary/20">
        <p className="font-outfit text-xs font-semibold text-primary mb-1">About P2P Trading</p>
        <p className="font-outfit text-xs text-text-muted leading-relaxed">
          Trade directly with other users using M-Pesa. KryptoKe holds the crypto in escrow until payment is confirmed.
          All merchants are verified users. Never trade outside this platform.
        </p>
      </div>

      {activeAd && <OrderSheet ad={activeAd} onClose={() => setActiveAd(null)} />}
    </div>
  );
}

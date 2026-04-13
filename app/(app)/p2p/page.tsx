"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useWallet } from "@/lib/hooks/useWallet";
import { useAuth } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { apiGet, apiPost } from "@/lib/api/client";
import { sanitizeNumberInput } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface P2PAd {
  id: string;
  uid: string;
  side: "buy" | "sell";
  asset: string;
  fiat: string;
  price: string;
  available: string;
  minOrder: string;
  maxOrder: string;
  paymentMethods: string[];
  merchantName: string;
  completionRate: number;
  totalTrades: number;
  isOnline: boolean;
  avgReleaseMins: number;
  rating: number;
  terms?: string;
  is_active?: boolean;
}

interface P2POrder {
  id: string;
  ad_id: string;
  buyer_uid: string;
  seller_uid: string;
  asset: string;
  fiat_amount: number;
  crypto_amount: number;
  price_per_unit: number;
  payment_method: string;
  status: "payment_pending" | "payment_sent" | "completed" | "disputed" | "cancelled";
  dispute_reason?: string;
  created_at: string;
  p2p_ads?: { asset: string; fiat_currency: string; users?: { display_name?: string } };
}

interface ChatMessage {
  id: string;
  order_id: string;
  sender_uid: string;
  message: string;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSETS = ["USDT", "BTC", "ETH"];
const FIATS = ["KES", "NGN", "GHS", "USD"];
const PAY_METHODS = ["All", "M-Pesa", "Bank Transfer", "Airtel Money"];
const ORDER_TIMER_SECS = 30 * 60; // 30 min

const PM_COLORS: Record<string, string> = {
  "M-Pesa": "bg-[#4CAF50]/20 text-[#4CAF50]",
  "Bank Transfer": "bg-primary/15 text-primary",
  "Airtel Money": "bg-[#E53935]/20 text-[#E53935]",
  "Equity": "bg-[#E91E63]/20 text-[#E91E63]",
  "KCB": "bg-[#1565C0]/20 text-[#1565C0]",
};

const STATUS_LABELS: Record<P2POrder["status"], { label: string; color: string }> = {
  payment_pending: { label: "Awaiting payment", color: "text-gold bg-gold/10" },
  payment_sent:    { label: "Payment sent",     color: "text-primary bg-primary/10" },
  completed:       { label: "Completed",         color: "text-up bg-up/10" },
  disputed:        { label: "Disputed",          color: "text-down bg-down/10" },
  cancelled:       { label: "Cancelled",         color: "text-text-muted bg-border" },
};

// ─── CountdownTimer ───────────────────────────────────────────────────────────

function CountdownTimer({ createdAt }: { createdAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const calc = () => {
      const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      setRemaining(Math.max(0, ORDER_TIMER_SECS - elapsed));
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [createdAt]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isUrgent = remaining < 5 * 60;

  if (remaining === 0) return (
    <span className="font-price text-xs text-down font-bold">Expired</span>
  );

  return (
    <span className={cn("font-price text-xs font-bold tabular-nums", isUrgent ? "text-down" : "text-gold")}>
      {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
    </span>
  );
}

// ─── InOrderChat ──────────────────────────────────────────────────────────────

function InOrderChat({ orderId, myUid }: { orderId: string; myUid: string }) {
  const toast = useToastActions();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load initial messages
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("p2p_messages" as never)
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data }) => {
        if (data) setMessages(data as ChatMessage[]);
      });

    // Realtime subscription
    const channel = supabase
      .channel(`p2p_chat_${orderId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "p2p_messages",
        filter: `order_id=eq.${orderId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await apiPost(`/p2p/orders/${orderId}/messages`, { message: text.trim() });
      setText("");
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide px-3 py-2 border-b border-border bg-bg-surface2">
        Order Chat
      </p>
      <div className="h-36 overflow-y-auto px-3 py-2 space-y-2 bg-bg">
        {messages.length === 0 ? (
          <p className="text-center font-outfit text-[10px] text-text-muted pt-4">
            No messages yet. Start the conversation.
          </p>
        ) : messages.map((m) => {
          const isMe = m.sender_uid === myUid;
          return (
            <div key={m.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] px-3 py-1.5 rounded-xl font-outfit text-xs leading-relaxed",
                isMe
                  ? "bg-primary/20 text-text-primary rounded-br-none"
                  : "bg-bg-surface2 text-text-secondary rounded-bl-none"
              )}>
                {m.message}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 px-3 py-2 border-t border-border bg-bg-surface">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
          className="flex-1 bg-bg-surface2 border border-border rounded-lg px-3 py-1.5 font-outfit text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50"
          maxLength={300}
        />
        <button
          onClick={sendMessage}
          disabled={!text.trim() || sending}
          className="px-3 py-1.5 bg-primary/20 text-primary rounded-lg font-outfit text-xs font-semibold disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ─── ReputationSheet ──────────────────────────────────────────────────────────

function ReputationSheet({ ad, onClose }: { ad: P2PAd; onClose: () => void }) {
  return (
    <BottomSheet isOpen onClose={onClose} title="Merchant Profile" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center font-syne font-bold text-xl",
            ad.isOnline ? "bg-up/20 text-up" : "bg-border/40 text-text-muted"
          )}>
            {ad.merchantName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-syne font-bold text-base text-text-primary">{ad.merchantName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn("w-2 h-2 rounded-full", ad.isOnline ? "bg-up" : "bg-text-muted")} />
              <span className="font-outfit text-xs text-text-muted">{ad.isOnline ? "Online" : "Offline"}</span>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Completion",    value: `${ad.completionRate}%`,        color: "text-up" },
            { label: "Total Trades",  value: String(ad.totalTrades),          color: "text-text-primary" },
            { label: "Avg Release",   value: `${ad.avgReleaseMins}min`,       color: "text-primary" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card text-center py-3">
              <p className={cn("font-price text-lg font-bold", color)}>{value}</p>
              <p className="font-outfit text-[9px] text-text-muted mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Star rating */}
        <div className="card flex items-center gap-3">
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map((i) => (
              <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={i <= Math.round(ad.rating) ? "#F0B429" : "none"}
                stroke="#F0B429" strokeWidth="1.5">
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
              </svg>
            ))}
          </div>
          <span className="font-price text-sm font-bold text-gold">{ad.rating.toFixed(1)}</span>
          <span className="font-outfit text-xs text-text-muted">({ad.totalTrades} reviews)</span>
        </div>

        {/* Payment methods */}
        <div>
          <p className="font-outfit text-xs text-text-muted mb-2">Payment Methods Accepted</p>
          <div className="flex flex-wrap gap-1.5">
            {ad.paymentMethods.map((pm) => (
              <span key={pm} className={cn(
                "font-outfit text-xs font-semibold px-2.5 py-1 rounded-full",
                PM_COLORS[pm] ?? "bg-border text-text-muted"
              )}>
                {pm}
              </span>
            ))}
          </div>
        </div>

        {/* Terms */}
        {ad.terms && (
          <div className="card bg-bg-surface2">
            <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide mb-1">Trade Terms</p>
            <p className="font-outfit text-xs text-text-secondary leading-relaxed">{ad.terms}</p>
          </div>
        )}

        <div className="card bg-primary/5 border-primary/20">
          <p className="font-outfit text-[10px] text-text-muted mb-1">KryptoKe Verified</p>
          <p className="font-outfit text-xs text-text-secondary leading-relaxed">
            This merchant has completed KYC verification and has a track record on this platform.
            Always trade within the app — KryptoKe escrow protects your funds.
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── OrderSheet ───────────────────────────────────────────────────────────────

function OrderSheet({ ad, myUid, onClose }: { ad: P2PAd; myUid: string; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const [fiatAmount, setFiatAmount] = useState("");
  const [step, setStep] = useState<"form" | "escrow" | "chat">("form");
  const [order, setOrder] = useState<P2POrder | null>(null);
  const [disputeText, setDisputeText] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [showReputation, setShowReputation] = useState(false);

  const isBuy = ad.side === "buy";
  const cryptoAmount = fiatAmount
    ? (parseFloat(fiatAmount) / parseFloat(ad.price)).toFixed(6)
    : "0.000000";

  const createOrder = useMutation({
    mutationFn: () => apiPost<{ data: P2POrder }>("/p2p/orders", {
      ad_id: ad.id,
      fiat_amount: parseFloat(fiatAmount),
      payment_method: ad.paymentMethods[0] ?? "M-Pesa",
    }),
    onSuccess: (res) => {
      setOrder(res.data);
      setStep("escrow");
    },
    onError: (err) => toast.error("Order failed", err instanceof Error ? err.message : "Please try again"),
  });

  const markPaid = useMutation({
    mutationFn: () => apiPost(`/p2p/orders/${order?.id}/paid`, {}),
    onSuccess: () => {
      setStep("chat");
      toast.success("Payment marked", "Waiting for seller to confirm and release.");
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : ""),
  });

  const raiseDispute = useMutation({
    mutationFn: () => apiPost(`/p2p/orders/${order?.id}/dispute`, { reason: disputeText }),
    onSuccess: () => {
      toast.success("Dispute raised", "Our team will review within 24 hours.");
      qc.invalidateQueries({ queryKey: ["p2p", "orders"] });
      onClose();
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : ""),
  });

  const canProceed = fiatAmount &&
    parseFloat(fiatAmount) >= parseFloat(ad.minOrder) &&
    parseFloat(fiatAmount) <= parseFloat(ad.maxOrder);

  return (
    <>
      <BottomSheet isOpen onClose={onClose} title={`${isBuy ? "Buy" : "Sell"} ${ad.asset}`} showCloseButton>
        <div className="px-4 pb-8 space-y-4">

          {/* ── Step 1: Form ── */}
          {step === "form" && (
            <>
              {/* Escrow banner */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#00E5B4" strokeWidth="1.75" strokeLinejoin="round"/>
                </svg>
                <p className="font-outfit text-[11px] text-primary leading-relaxed">
                  Seller&apos;s {ad.asset} is held in escrow and released <strong>only</strong> when payment is confirmed.
                </p>
              </div>

              {/* Merchant row */}
              <button
                onClick={() => setShowReputation(true)}
                className="flex items-center gap-3 p-3 rounded-xl bg-bg-surface2 border border-border w-full text-left"
              >
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center font-outfit font-bold text-sm flex-shrink-0",
                  ad.isOnline ? "bg-up/20 text-up" : "bg-border/30 text-text-muted"
                )}>
                  {ad.merchantName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-outfit text-sm font-semibold text-text-primary">{ad.merchantName}</p>
                  <p className="font-outfit text-[10px] text-text-muted">
                    {ad.completionRate}% · {ad.totalTrades} trades · avg {ad.avgReleaseMins}min
                  </p>
                </div>
                <span className="font-outfit text-[10px] text-primary">Profile →</span>
              </button>

              {/* Price */}
              <div className="flex justify-between items-center px-1">
                <span className="font-outfit text-xs text-text-muted">Price per {ad.asset}</span>
                <span className="font-price text-lg font-bold text-text-primary">
                  {ad.fiat} {parseFloat(ad.price).toLocaleString()}
                </span>
              </div>

              {/* Amount input */}
              <div>
                <label className="block font-outfit text-xs text-text-secondary mb-1.5">
                  {isBuy ? `You Pay (${ad.fiat})` : `You Sell (${ad.asset})`}
                </label>
                <input
                  type="text" inputMode="decimal" value={fiatAmount}
                  onChange={(e) => setFiatAmount(sanitizeNumberInput(e.target.value, 2))}
                  className="input-field"
                  placeholder={`Min ${ad.fiat} ${parseFloat(ad.minOrder).toLocaleString()}`}
                />
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="font-outfit text-[10px] text-text-muted">
                    Limit: {ad.fiat} {parseFloat(ad.minOrder).toLocaleString()} – {parseFloat(ad.maxOrder).toLocaleString()}
                  </span>
                  <span className="font-outfit text-[10px] text-text-muted">
                    Available: {parseFloat(ad.available).toFixed(4)} {ad.asset}
                  </span>
                </div>
              </div>

              {/* You receive */}
              {fiatAmount && (
                <div className="flex justify-between items-center px-3 py-2.5 rounded-xl bg-up/5 border border-up/20">
                  <span className="font-outfit text-xs text-text-muted">You Receive</span>
                  <span className="font-price text-base font-bold text-up">
                    {isBuy ? `${cryptoAmount} ${ad.asset}` : `${ad.fiat} ${(parseFloat(fiatAmount) * parseFloat(ad.price)).toLocaleString()}`}
                  </span>
                </div>
              )}

              {/* Payment methods */}
              <div>
                <p className="font-outfit text-[10px] text-text-muted mb-1.5">Payment Methods</p>
                <div className="flex flex-wrap gap-1.5">
                  {ad.paymentMethods.map((pm) => (
                    <span key={pm} className={cn(
                      "font-outfit text-[10px] font-semibold px-2 py-1 rounded-full",
                      PM_COLORS[pm] ?? "bg-border text-text-muted"
                    )}>
                      {pm}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => createOrder.mutate()}
                disabled={!canProceed || createOrder.isPending}
                className={cn(
                  "w-full py-3 rounded-xl font-syne font-bold text-sm text-white disabled:opacity-40",
                  isBuy ? "bg-up" : "bg-down"
                )}
              >
                {createOrder.isPending ? "Creating order…" : isBuy ? `Buy ${ad.asset}` : `Sell ${ad.asset}`}
              </button>
            </>
          )}

          {/* ── Step 2: Escrow / Payment Instructions ── */}
          {step === "escrow" && order && (
            <>
              {/* Timer */}
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gold/5 border border-gold/20">
                <div>
                  <p className="font-outfit text-[10px] text-text-muted">Time to pay</p>
                  <CountdownTimer createdAt={order.created_at} />
                </div>
                <div className="text-right">
                  <p className="font-outfit text-[10px] text-text-muted">Order ID</p>
                  <p className="font-outfit text-[10px] font-semibold text-text-secondary font-mono">
                    #{order.id.slice(-8).toUpperCase()}
                  </p>
                </div>
              </div>

              {/* Escrow confirmation */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#00E5B4" strokeWidth="1.75" strokeLinejoin="round"/>
                </svg>
                <p className="font-outfit text-[11px] text-primary leading-relaxed">
                  <strong>{parseFloat(ad.available).toFixed(4)} {ad.asset}</strong> is locked in escrow.
                  It will be released automatically once payment is confirmed.
                </p>
              </div>

              {/* Payment details */}
              <div className="card space-y-3">
                <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">
                  {ad.paymentMethods[0] ?? "M-Pesa"} Payment Instructions
                </p>
                {[
                  { label: "Amount",     value: `${ad.fiat} ${parseFloat(fiatAmount).toLocaleString()}` },
                  { label: "Reference",  value: `KK-P2P-${order.id.slice(-8).toUpperCase()}` },
                  { label: "Note",       value: "Use the reference above when sending" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-3">
                    <span className="font-outfit text-xs text-text-muted flex-shrink-0">{label}</span>
                    <span className="font-outfit text-xs font-semibold text-text-primary text-right">{value}</span>
                  </div>
                ))}
              </div>

              {/* Chat */}
              <InOrderChat orderId={order.id} myUid={myUid} />

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { toast.info("Order cancelled"); onClose(); }}
                  className="py-3 rounded-xl border border-border font-outfit text-sm text-text-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={() => markPaid.mutate()}
                  disabled={markPaid.isPending}
                  className="py-3 rounded-xl bg-up font-syne font-bold text-sm text-white disabled:opacity-50"
                >
                  {markPaid.isPending ? "Confirming…" : "I've Sent Payment ✓"}
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Awaiting release + chat ── */}
          {step === "chat" && order && (
            <>
              <div className="px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20 text-center">
                <p className="font-outfit text-sm font-semibold text-primary">Payment Sent ✓</p>
                <p className="font-outfit text-[11px] text-text-muted mt-0.5">
                  Waiting for seller to confirm and release {ad.asset}. Usually under {ad.avgReleaseMins} minutes.
                </p>
              </div>

              <InOrderChat orderId={order.id} myUid={myUid} />

              {/* Dispute link */}
              {!showDispute ? (
                <button
                  onClick={() => setShowDispute(true)}
                  className="w-full text-center font-outfit text-xs text-down/70 underline underline-offset-2 py-1"
                >
                  Raise a dispute
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="font-outfit text-xs text-text-secondary font-semibold">Describe the issue:</p>
                  <textarea
                    value={disputeText}
                    onChange={(e) => setDisputeText(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Explain what happened in detail (min 10 characters)…"
                    className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2 font-outfit text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-down/50 resize-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShowDispute(false)}
                      className="py-2.5 rounded-xl border border-border font-outfit text-sm text-text-muted">
                      Cancel
                    </button>
                    <button
                      onClick={() => raiseDispute.mutate()}
                      disabled={disputeText.length < 10 || raiseDispute.isPending}
                      className="py-2.5 rounded-xl bg-down font-syne font-bold text-sm text-white disabled:opacity-50"
                    >
                      {raiseDispute.isPending ? "Submitting…" : "Submit Dispute"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </BottomSheet>

      {showReputation && (
        <ReputationSheet ad={ad} onClose={() => setShowReputation(false)} />
      )}
    </>
  );
}

// ─── CreateAdSheet ────────────────────────────────────────────────────────────

function CreateAdSheet({ onClose }: { onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const [type, setType] = useState<"sell" | "buy">("sell");
  const [asset, setAsset] = useState("USDT");
  const [fiat, setFiat] = useState("KES");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [minOrder, setMinOrder] = useState("500");
  const [maxOrder, setMaxOrder] = useState("50000");
  const [methods, setMethods] = useState<string[]>(["M-Pesa"]);
  const [terms, setTerms] = useState("");

  const PM_OPTIONS = ["M-Pesa", "Bank Transfer", "Airtel Money", "Equity", "KCB"];

  const create = useMutation({
    mutationFn: () => apiPost("/p2p/ads", {
      type,
      asset,
      fiat_currency: fiat,
      price_per_unit: parseFloat(price),
      min_order_kes: parseFloat(minOrder),
      max_order_kes: parseFloat(maxOrder),
      available_amount: parseFloat(amount),
      payment_methods: methods,
      terms: terms || undefined,
    }),
    onSuccess: () => {
      toast.success("Ad posted", "Your ad is now live on the P2P marketplace.");
      qc.invalidateQueries({ queryKey: ["p2p", "my-ads"] });
      onClose();
    },
    onError: (err) => toast.error("Failed to post ad", err instanceof Error ? err.message : ""),
  });

  const canSubmit = price && amount && methods.length > 0 &&
    parseFloat(minOrder) < parseFloat(maxOrder);

  return (
    <BottomSheet isOpen onClose={onClose} title="Post a P2P Ad" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {/* Type toggle */}
        <div className="flex gap-0 bg-bg-surface2 rounded-xl p-1">
          {(["sell", "buy"] as const).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={cn("flex-1 py-2 rounded-lg font-syne font-bold text-sm capitalize transition-all",
                type === t ? (t === "sell" ? "bg-down text-white" : "bg-up text-white") : "text-text-muted")}>
              {t}
            </button>
          ))}
        </div>

        {/* Asset + Fiat row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Asset</label>
            <select value={asset} onChange={(e) => setAsset(e.target.value)}
              className="input-field appearance-none">
              {ASSETS.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Currency</label>
            <select value={fiat} onChange={(e) => setFiat(e.target.value)}
              className="input-field appearance-none">
              {FIATS.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* Price */}
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">
            Price per {asset} ({fiat})
          </label>
          <input type="text" inputMode="decimal" value={price}
            onChange={(e) => setPrice(sanitizeNumberInput(e.target.value, 2))}
            className="input-field" placeholder="e.g. 131.50" />
        </div>

        {/* Amount */}
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">
            Amount to {type} ({asset})
          </label>
          <input type="text" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(sanitizeNumberInput(e.target.value, 6))}
            className="input-field" placeholder="e.g. 100" />
        </div>

        {/* Limits row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Min Order ({fiat})</label>
            <input type="text" inputMode="decimal" value={minOrder}
              onChange={(e) => setMinOrder(sanitizeNumberInput(e.target.value, 0))}
              className="input-field" />
          </div>
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Max Order ({fiat})</label>
            <input type="text" inputMode="decimal" value={maxOrder}
              onChange={(e) => setMaxOrder(sanitizeNumberInput(e.target.value, 0))}
              className="input-field" />
          </div>
        </div>

        {/* Payment methods */}
        <div>
          <p className="font-outfit text-xs text-text-secondary mb-2">Payment Methods</p>
          <div className="flex flex-wrap gap-2">
            {PM_OPTIONS.map((pm) => (
              <button key={pm}
                onClick={() => setMethods((prev) =>
                  prev.includes(pm) ? prev.filter(p => p !== pm) : [...prev, pm]
                )}
                className={cn(
                  "font-outfit text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
                  methods.includes(pm)
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "border-border text-text-muted"
                )}
              >
                {pm}
              </button>
            ))}
          </div>
        </div>

        {/* Terms */}
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">
            Trade Terms <span className="text-text-muted">(optional)</span>
          </label>
          <textarea value={terms} onChange={(e) => setTerms(e.target.value)}
            rows={2} maxLength={500} placeholder="e.g. Payment within 15 minutes. No third-party payments."
            className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2 font-outfit text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 resize-none" />
        </div>

        <button onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}
          className="w-full py-3 rounded-xl bg-primary font-syne font-bold text-sm text-bg disabled:opacity-40">
          {create.isPending ? "Posting…" : "Post Ad"}
        </button>
      </div>
    </BottomSheet>
  );
}

// ─── Main P2P Page ────────────────────────────────────────────────────────────

type Tab = "browse" | "orders" | "ads";

export default function P2PPage() {
  const { user } = useAuth();
  const myUid = user?.uid ?? "";
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("browse");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [asset, setAsset] = useState("USDT");
  const [fiatFilter, setFiatFilter] = useState("KES");
  const [payFilter, setPayFilter] = useState("All");
  const [activeAd, setActiveAd] = useState<P2PAd | null>(null);
  const [createAdOpen, setCreateAdOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<P2POrder | null>(null);

  // ── Browse ads ──
  const { data: adsData, isLoading: adsLoading } = useQuery({
    queryKey: ["p2p", "ads", side, asset, fiatFilter],
    queryFn: () => apiGet<{ data: P2PAd[]; total: number }>(
      `/p2p/ads?type=${side === "buy" ? "sell" : "buy"}&asset=${asset}&fiat=${fiatFilter}`
    ),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: tab === "browse",
  });

  const ads: P2PAd[] = (adsData?.data ?? [])
    .filter(ad => payFilter === "All" || (ad.paymentMethods ?? []).includes(payFilter))
    .map(ad => ({
      ...ad,
      side,
      fiat: (ad as unknown as { fiat_currency?: string }).fiat_currency ?? "KES",
      price: (ad as unknown as { price_per_unit?: number }).price_per_unit?.toString() ?? "0",
      available: (ad as unknown as { available_amount?: number }).available_amount?.toString() ?? "0",
      minOrder: (ad as unknown as { min_order_kes?: number }).min_order_kes?.toString() ?? "100",
      maxOrder: (ad as unknown as { max_order_kes?: number }).max_order_kes?.toString() ?? "50000",
      merchantName: (ad as unknown as { users?: { display_name?: string } }).users?.display_name ?? "Merchant",
      completionRate: (ad as unknown as { completion_rate?: number }).completion_rate ?? 100,
      totalTrades: (ad as unknown as { trades_count?: number }).trades_count ?? 0,
      isOnline: true,
      avgReleaseMins: (ad as unknown as { avg_release_min?: number }).avg_release_min ?? 5,
      rating: 4.8,
    }));

  // ── My Orders ──
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["p2p", "orders"],
    queryFn: () => apiGet<{ data: P2POrder[] }>("/p2p/orders"),
    staleTime: 15_000,
    enabled: tab === "orders",
  });
  const orders = ordersData?.data ?? [];

  // ── My Ads ──
  const { data: myAdsData, isLoading: myAdsLoading } = useQuery({
    queryKey: ["p2p", "my-ads"],
    queryFn: () => apiGet<{ data: P2PAd[] }>("/p2p/ads/mine"),
    staleTime: 15_000,
    enabled: tab === "ads",
  });
  const myAds = myAdsData?.data ?? [];

  const toggleAd = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active
        ? apiPost(`/p2p/ads/${id}/pause`, {})
        : apiPost(`/p2p/ads/${id}/activate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["p2p", "my-ads"] }),
    onError: (err) => console.error("[P2P] toggle ad:", err),
  });

  return (
    <div className="screen">
      <TopBar title="P2P Trading" showBack />

      {/* ── Tabs ── */}
      <div className="flex mx-4 mt-3 mb-0 gap-0 bg-bg-surface2 rounded-xl p-1">
        {(["browse", "orders", "ads"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2 rounded-lg font-outfit text-xs font-semibold capitalize transition-all",
              tab === t ? "bg-primary/20 text-primary" : "text-text-muted"
            )}>
            {t === "orders" ? "My Orders" : t === "ads" ? "My Ads" : "Browse"}
          </button>
        ))}
      </div>

      {/* ══════════════ BROWSE TAB ══════════════ */}
      {tab === "browse" && (
        <>
          {/* Buy / Sell toggle */}
          <div className="flex gap-0 mx-4 mt-3 mb-2 bg-bg-surface2 rounded-xl p-1">
            {(["buy", "sell"] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)}
                className={cn("flex-1 py-2 rounded-lg font-syne font-bold text-sm transition-all",
                  side === s ? (s === "buy" ? "bg-up text-white" : "bg-down text-white") : "text-text-muted")}>
                {s === "buy" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>

          {/* Filter row */}
          <div className="px-4 space-y-2 mb-2">
            {/* Asset */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {ASSETS.map(a => (
                <button key={a} onClick={() => setAsset(a)}
                  className={cn("flex-shrink-0 px-3 py-1.5 rounded-lg font-outfit text-xs font-semibold border transition-all",
                    asset === a ? "bg-primary/15 border-primary text-primary" : "border-border text-text-muted")}>
                  {a}
                </button>
              ))}
            </div>
            {/* Fiat currency */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {FIATS.map(f => (
                <button key={f} onClick={() => setFiatFilter(f)}
                  className={cn("flex-shrink-0 px-2.5 py-1 rounded-lg font-outfit text-[10px] font-semibold border transition-all",
                    fiatFilter === f ? "bg-gold/15 border-gold/40 text-gold" : "border-border text-text-muted")}>
                  {f}
                </button>
              ))}
            </div>
            {/* Payment method */}
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
            <p className="w-24 text-right font-outfit text-[9px] text-text-muted uppercase tracking-wide">Price / Limits</p>
          </div>

          {/* Ad list */}
          <div className="divide-y divide-border/40 overflow-y-auto">
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
                <p className="font-outfit text-xs text-text-muted mt-1 opacity-60">
                  Try adjusting the filters or check back later
                </p>
              </div>
            ) : ads.map((ad) => (
              <div key={ad.id} className="px-4 py-3">
                <div className="flex items-start gap-2.5 mb-2">
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
                      ★ {ad.rating} · {ad.completionRate}% · {ad.totalTrades} trades · ~{ad.avgReleaseMins}min
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(ad.paymentMethods ?? []).slice(0, 3).map(pm => (
                        <span key={pm} className={cn("font-outfit text-[8px] font-semibold px-1.5 py-0.5 rounded",
                          PM_COLORS[pm] ?? "bg-border text-text-muted")}>
                          {pm}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-price text-sm font-bold text-text-primary">
                      {ad.fiat} {parseFloat(ad.price).toLocaleString()}
                    </p>
                    <p className="font-outfit text-[9px] text-text-muted">/{ad.asset}</p>
                    <p className="font-outfit text-[9px] text-text-muted mt-0.5">
                      {parseFloat(ad.minOrder).toLocaleString()} – {parseFloat(ad.maxOrder).toLocaleString()}
                    </p>
                    <button onClick={() => setActiveAd(ad)}
                      className={cn("mt-1.5 px-3 py-1.5 rounded-lg font-syne font-bold text-[11px] text-white",
                        side === "buy" ? "bg-up" : "bg-down")}>
                      {side === "buy" ? "Buy" : "Sell"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Info banner */}
          <div className="mx-4 my-4 card bg-primary/5 border-primary/20">
            <p className="font-outfit text-xs font-semibold text-primary mb-1">🔒 Escrow Protected</p>
            <p className="font-outfit text-xs text-text-muted leading-relaxed">
              KryptoKe holds crypto in escrow until payment is confirmed. All merchants are KYC-verified.
              Never trade outside this platform.
            </p>
          </div>
        </>
      )}

      {/* ══════════════ MY ORDERS TAB ══════════════ */}
      {tab === "orders" && (
        <div className="px-4 mt-4">
          {ordersLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card mb-2 animate-pulse space-y-2">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-48 rounded" />
              </div>
            ))
          ) : orders.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-outfit text-sm text-text-muted">No orders yet</p>
              <button onClick={() => setTab("browse")}
                className="mt-3 font-outfit text-xs text-primary font-semibold">
                Browse offers →
              </button>
            </div>
          ) : orders.map((order) => {
            const statusInfo = STATUS_LABELS[order.status] ?? STATUS_LABELS.cancelled;
            const isBuyer = order.buyer_uid === myUid;
            return (
              <button key={order.id} onClick={() => setActiveOrder(order)}
                className="w-full card mb-2 text-left">
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <p className="font-outfit text-sm font-semibold text-text-primary">
                      {isBuyer ? "Buy" : "Sell"} {order.asset}
                    </p>
                    <p className="font-outfit text-[10px] text-text-muted">
                      #{order.id.slice(-8).toUpperCase()} · {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={cn("font-outfit text-[10px] font-semibold px-2 py-0.5 rounded-full", statusInfo.color)}>
                    {statusInfo.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-outfit text-xs text-text-muted">
                    {order.crypto_amount} {order.asset} · KES {order.fiat_amount?.toLocaleString()}
                  </span>
                  {order.status === "payment_pending" && (
                    <CountdownTimer createdAt={order.created_at} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ══════════════ MY ADS TAB ══════════════ */}
      {tab === "ads" && (
        <div className="px-4 mt-4">
          <button onClick={() => setCreateAdOpen(true)}
            className="w-full py-3 mb-4 rounded-xl bg-primary/15 border border-primary/30 font-syne font-bold text-sm text-primary flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            Post New Ad
          </button>

          {myAdsLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="card mb-2 animate-pulse space-y-2">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-full rounded" />
              </div>
            ))
          ) : myAds.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-outfit text-sm text-text-muted">You have no active ads</p>
              <p className="font-outfit text-xs text-text-muted mt-1 opacity-60">
                Post an ad to start trading on P2P
              </p>
            </div>
          ) : myAds.map((ad: P2PAd & { is_active?: boolean; type?: string; price_per_unit?: number; available_amount?: number; min_order_kes?: number; max_order_kes?: number }) => {
            const isActive = ad.is_active !== false;
            return (
              <div key={ad.id} className="card mb-2">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn("font-syne font-bold text-sm",
                        ad.type === "sell" ? "text-down" : "text-up")}>
                        {ad.type === "sell" ? "Sell" : "Buy"} {ad.asset ?? "USDT"}
                      </span>
                      <span className={cn("font-outfit text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        isActive ? "bg-up/10 text-up" : "bg-border text-text-muted")}>
                        {isActive ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="font-price text-sm text-text-primary mt-0.5">
                      KES {ad.price_per_unit?.toLocaleString() ?? "—"} / {ad.asset ?? "USDT"}
                    </p>
                  </div>
                  {/* Active/Pause toggle */}
                  <button
                    onClick={() => toggleAd.mutate({ id: ad.id, active: isActive })}
                    disabled={toggleAd.isPending}
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0",
                      isActive ? "bg-up" : "bg-border"
                    )}
                    aria-label={isActive ? "Pause ad" : "Activate ad"}
                  >
                    <span className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200",
                      isActive ? "left-5" : "left-0.5"
                    )} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Available", value: `${ad.available_amount ?? 0} ${ad.asset ?? "USDT"}` },
                    { label: "Min",        value: `KES ${(ad.min_order_kes ?? 0).toLocaleString()}` },
                    { label: "Max",        value: `KES ${(ad.max_order_kes ?? 0).toLocaleString()}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-bg-surface2 rounded-lg py-1.5">
                      <p className="font-outfit text-[9px] text-text-muted">{label}</p>
                      <p className="font-outfit text-[10px] font-semibold text-text-secondary">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="h-24" />

      {/* ── Sheets ── */}
      {activeAd && (
        <OrderSheet ad={activeAd} myUid={myUid} onClose={() => setActiveAd(null)} />
      )}
      {activeOrder && (
        <BottomSheet isOpen onClose={() => setActiveOrder(null)} title="Order Details" showCloseButton>
          <div className="px-4 pb-8 space-y-3">
            <div className="card space-y-2">
              {[
                { label: "Order ID", value: `#${activeOrder.id.slice(-8).toUpperCase()}` },
                { label: "Asset",    value: `${activeOrder.crypto_amount} ${activeOrder.asset}` },
                { label: "Amount",   value: `KES ${activeOrder.fiat_amount?.toLocaleString()}` },
                { label: "Payment",  value: activeOrder.payment_method },
                { label: "Status",   value: STATUS_LABELS[activeOrder.status]?.label ?? activeOrder.status },
                { label: "Date",     value: new Date(activeOrder.created_at).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="font-outfit text-xs text-text-muted">{label}</span>
                  <span className="font-outfit text-xs font-semibold text-text-primary">{value}</span>
                </div>
              ))}
            </div>
            {activeOrder.status === "payment_pending" && (
              <InOrderChat orderId={activeOrder.id} myUid={myUid} />
            )}
          </div>
        </BottomSheet>
      )}
      {createAdOpen && (
        <CreateAdSheet onClose={() => setCreateAdOpen(false)} />
      )}
    </div>
  );
}

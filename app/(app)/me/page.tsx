"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/store";
import { useWallet } from "@/lib/hooks/useWallet";
import { usePrices } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { PinPad } from "@/components/auth/PinPad";
import { apiGet, apiPost } from "@/lib/api/client";
import { formatKes, sanitizeNumberInput } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import {
  IconDeposit, IconWithdraw, IconTransfer, IconSend,
  IconChevronRight, IconCopy, IconEye, IconEyeOff,
} from "@/components/icons";
import { priceDirection } from "@/lib/utils/formatters";
import type { DailyPnl } from "@/types";
import type { Balance } from "@/types";
import Big from "big.js";

// ─── PnL Calendar ────────────────────────────────────────────────────────────
function PnlCalendar({ data }: { data: DailyPnl[] }) {
  const today = new Date().toISOString().split("T")[0];
  const byDate = new Map(data.map((d) => [d.date, d]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().split("T")[0] as string;
  });
  return (
    <div className="px-4">
      <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-1.5">Daily PnL — Last 30 days</p>
      <div className="grid grid-cols-7 gap-0.5">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <p key={i} className="font-outfit text-[8px] text-text-muted text-center pb-0.5">{d}</p>
        ))}
        {days.map((date) => {
          const entry = byDate.get(date);
          const pnl = parseFloat(entry?.pnlUsd ?? "0");
          const isToday = date === today;
          const dir = priceDirection(pnl.toString());
          return (
            <div key={date} title={`${date}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT`}
              className={cn(
                "h-6 rounded flex items-center justify-center text-[9px] font-price",
                isToday && "ring-1 ring-primary",
                dir === "up" ? "bg-up/25 text-up" :
                dir === "down" ? "bg-down/25 text-down" :
                "bg-bg-surface2 text-text-muted"
              )}>
              {new Date(date + "T00:00:00").getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Internal transfer sheet ────────────────────────────────────────────────
function InternalTransferSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { usdtBalance, kesBalance } = useWallet();
  const [asset, setAsset] = useState("USDT");
  const [from, setFrom] = useState<"funding"|"trading"|"earn">("funding");
  const [to, setTo] = useState<"trading"|"earn"|"funding">("trading");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const bal = asset === "KES" ? kesBalance : usdtBalance;

  async function handleTransfer() {
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    try {
      await apiPost("/wallet/transfer", { from, to, asset, amount });
      toast.success("Transfer complete");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onClose();
    } catch (err) {
      toast.error("Transfer failed", err instanceof Error ? err.message : "");
    } finally { setLoading(false); }
  }

  const accounts = ["funding", "trading", "earn"] as const;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Internal Transfer" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        {/* Asset */}
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Asset</label>
          <div className="flex gap-2">
            {["USDT", "KES"].map((a) => (
              <button key={a} onClick={() => setAsset(a)}
                className={cn("flex-1 py-2.5 rounded-xl font-outfit text-sm font-semibold border transition-all",
                  asset === a ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-text-muted")}>
                {a}
              </button>
            ))}
          </div>
        </div>
        {/* From / To */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">From</label>
            <select value={from} onChange={(e) => setFrom(e.target.value as typeof from)}
              className="input-field text-sm capitalize">
              {accounts.map((a) => <option key={a} value={a} className="capitalize">{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">To</label>
            <select value={to} onChange={(e) => setTo(e.target.value as typeof to)}
              className="input-field text-sm capitalize">
              {accounts.filter((a) => a !== from).map((a) => <option key={a} value={a} className="capitalize">{a}</option>)}
            </select>
          </div>
        </div>
        {/* Amount */}
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="font-outfit text-xs text-text-secondary">Amount</label>
            <span className="font-outfit text-xs text-text-muted">Available: {parseFloat(bal).toFixed(4)} {asset}</span>
          </div>
          <div className="relative">
            <input type="text" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(sanitizeNumberInput(e.target.value, 6))}
              className="input-field pr-14" placeholder="0.00" />
            <button onClick={() => setAmount(bal)} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary font-outfit text-xs font-bold">MAX</button>
          </div>
        </div>
        <button onClick={handleTransfer} disabled={loading || !amount || parseFloat(amount) <= 0}
          className="btn-primary disabled:opacity-50">
          {loading ? "Transferring..." : "Transfer"}
        </button>
      </div>
    </BottomSheet>
  );
}

// ─── P2P Send sheet ─────────────────────────────────────────────────────────
function P2PSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { usdtBalance, kesBalance } = useWallet();
  const [step, setStep] = useState<"form" | "pin">("form");
  const [recipient, setRecipient] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // Correct balance for the selected asset
  const availableBalance = asset === "KES" ? kesBalance : usdtBalance;

  const send = useMutation({
    mutationFn: (assetPin: string) =>
      apiPost<{ recipient: { displayName: string }; message: string }>("/wallet/transfer-to-user", {
        recipientIdentifier: recipient.trim(),
        asset, amount, assetPin, note: note || undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Sent! ${data.message}`);
      setStep("form"); setRecipient(""); setAmount(""); setNote("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      onClose();
    },
    onError: (err) => setPinError(err instanceof Error ? err.message : "Send failed"),
  });

  if (step === "pin") {
    return (
      <BottomSheet isOpen={isOpen} onClose={() => { setStep("form"); setPinError(null); }}>
        <div className="px-4 py-2">
          <PinPad
            onComplete={(pin) => send.mutate(pin)}
            onCancel={() => { setStep("form"); setPinError(null); }}
            title="Confirm Send"
            subtitle={`Send ${amount} ${asset} to ${recipient}`}
            error={pinError}
            isLoading={send.isPending}
          />
        </div>
      </BottomSheet>
    );
  }

  const canSend =
    recipient.length >= 3 &&
    parseFloat(amount) > 0 &&
    parseFloat(amount) <= parseFloat(availableBalance);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Send to User" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Recipient UID or email</label>
          <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
            className="input-field" placeholder="user@email.com or uid" autoComplete="off" />
          <p className="font-outfit text-[10px] text-text-muted mt-1">The recipient must have a KryptoKe account.</p>
        </div>
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Asset</label>
          <div className="flex gap-2">
            {["USDT", "KES"].map((a) => (
              <button key={a} onClick={() => { setAsset(a); setAmount(""); }}
                className={cn("flex-1 py-2.5 rounded-xl font-outfit text-sm font-semibold border transition-all",
                  asset === a ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-text-muted")}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="font-outfit text-xs text-text-secondary">Amount</label>
            <span className="font-outfit text-xs text-text-muted">
              Balance: {parseFloat(availableBalance).toFixed(asset === "KES" ? 2 : 4)} {asset}
            </span>
          </div>
          <input type="text" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(sanitizeNumberInput(e.target.value, 6))}
            className="input-field" placeholder="0.00" />
        </div>
        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Note (optional)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
            className="input-field" placeholder="e.g. For lunch" maxLength={100} />
        </div>
        <div className="card border-gold/20 bg-gold/5">
          <p className="font-outfit text-xs text-gold/90 leading-relaxed">
            Transfers to other users are instant and irreversible. Double-check the recipient.
          </p>
        </div>
        <button onClick={() => setStep("pin")} disabled={!canSend} className="btn-primary disabled:opacity-50">
          Continue
        </button>
      </div>
    </BottomSheet>
  );
}

// ─── Main wallet page ────────────────────────────────────────────────────────
export default function WalletPage() {
  const router = useRouter();
  const { user } = useAuth();
  const walletInfo = useWallet();
  const { totalKes, totalUsd, kesBalance, usdtBalance, bnbBalance, rate, isLoading } = walletInfo;
  const accountBalances = (walletInfo as unknown as { accountBalances?: Record<string, Record<string, string>> }).accountBalances ?? {};
  const suspendedUntil = (walletInfo as unknown as { suspendedUntil?: string | null }).suspendedUntil;
  const suspensionReason = (walletInfo as unknown as { suspensionReason?: string | null }).suspensionReason;
  const isSuspended = !!(suspendedUntil && new Date(suspendedUntil) > new Date());

  // Read ?highlight=<txId> from notification deep-link
  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null;
  const highlightId = searchParams?.get("highlight") ?? null;

  const { data: dailyPnl } = useQuery({
    queryKey: ["analytics", "daily-pnl"],
    queryFn: () => apiGet<DailyPnl[]>("/analytics/daily-pnl"),
    staleTime: 5 * 60_000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["wallet", "history-me", 1],
    queryFn: () => apiGet<{ transactions: Array<{ id: string; asset: string; amount: string; type: string; note: string; reference_id: string | null; created_at: string }>; hasMore: boolean }>("/wallet/history?limit=20"),
    staleTime: 30_000,
  });
  const { prices, priceChanges } = usePrices();
  const [hidden, setHidden] = useState(false);
  const [expandedTx, setExpandedTx] = useState<string | null>(highlightId);
  const [internalOpen, setInternalOpen] = useState(false);
  const [p2pOpen, setP2pOpen] = useState(false);
  const toast = useToastActions();

  const { data: allBalances } = useQuery({
    queryKey: ["wallet", "balances"],
    queryFn: () => apiGet<Balance[]>("/wallet/balances"),
    staleTime: 30_000,
  });

  const kesPerUsd = parseFloat(rate?.kesPerUsd ?? "130");

  // Build asset list from balances + known assets
  const assetMap = new Map<string, string>();
  assetMap.set("KES", kesBalance);
  assetMap.set("USDT", usdtBalance);
  assetMap.set("BNB", bnbBalance);
  (allBalances ?? []).forEach((b) => {
    if (b.account === "funding" && parseFloat(b.amount.toString()) > 0) {
      assetMap.set(b.asset, b.amount.toString());
    }
  });

  const assets = Array.from(assetMap.entries())
    .map(([symbol, amount]) => {
      const price = symbol === "KES" ? "1" : symbol === "USDT" ? "1" : prices[`${symbol}USDT`] ?? "0";
      const usdValue = symbol === "KES"
        ? parseFloat(amount) / kesPerUsd
        : parseFloat(amount) * parseFloat(price);
      return { symbol, amount, price, usdValue, change: priceChanges[`${symbol}USDT`] ?? "0" };
    })
    .filter((a) => parseFloat(a.amount) > 0)
    .sort((a, b) => b.usdValue - a.usdValue);

  function copyUid() {
    navigator.clipboard.writeText(user?.uid ?? "");
    toast.copied();
  }

  return (
    <div className="screen">
      {/* Top bar */}
      <div className="top-bar">
        <span className="font-syne font-bold text-base text-text-primary">Wallet</span>
        <button onClick={copyUid} className="flex items-center gap-1.5 tap-target text-text-muted">
          <span className="font-price text-[10px]">{user?.uid.slice(0, 12)}…</span>
          <IconCopy size={14} />
        </button>
      </div>

      {/* Suspension banner */}
      {isSuspended && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-2xl bg-down/8 border border-down/25 flex items-start gap-3">
          <span className="text-xl mt-0.5">🚫</span>
          <div>
            <p className="font-outfit text-sm font-semibold text-down">Account Suspended</p>
            <p className="font-outfit text-xs text-text-secondary mt-0.5 leading-relaxed">{suspensionReason ?? "Your account has been suspended."}</p>
            <p className="font-outfit text-[10px] text-text-muted mt-1">
              Access restored: {new Date(suspendedUntil!).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      )}

      {/* Total balance card */}
      <div className="mx-4 mt-4 card">
        <div className="flex items-start justify-between mb-1">
          <p className="font-outfit text-xs text-text-muted uppercase tracking-wider">Total Balance</p>
          <button onClick={() => setHidden((v) => !v)} className="tap-target -mr-2 -mt-1 text-text-muted">
            {hidden ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </button>
        </div>
        {isLoading ? (
          <div className="skeleton h-9 w-48 rounded-lg mt-1" />
        ) : (
          <>
            <p className="font-price text-3xl font-medium text-text-primary mt-1">
              {hidden ? "••••••" : `KSh ${parseFloat(totalKes).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`}
            </p>
            <p className="font-outfit text-sm text-text-muted mt-0.5">
              {hidden ? "••••" : `≈ $${parseFloat(totalUsd).toFixed(2)} USD`}
            </p>
          </>
        )}

        {/* Per-account balance breakdown */}
        {!isLoading && Object.keys(accountBalances).length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-3 gap-2">
            {(["funding", "trading", "earn"] as const).map((acct) => {
              const bals = accountBalances[acct] ?? {};
              const usdt = parseFloat(bals["USDT"] ?? "0");
              const kes = parseFloat(bals["KES"] ?? "0");
              const hasAny = usdt > 0 || kes > 0;
              return (
                <div key={acct} className="bg-bg-surface2 rounded-xl px-2.5 py-2">
                  <p className="font-outfit text-[9px] text-text-muted uppercase tracking-wide capitalize">{acct}</p>
                  {hidden ? (
                    <p className="font-price text-xs text-text-muted mt-0.5">••••</p>
                  ) : hasAny ? (
                    <>
                      {usdt > 0 && <p className="font-price text-xs text-text-primary mt-0.5">{usdt.toFixed(2)} <span className="text-text-muted">USDT</span></p>}
                      {kes > 0 && <p className="font-price text-xs text-text-primary">{kes.toFixed(0)} <span className="text-text-muted">KES</span></p>}
                    </>
                  ) : (
                    <p className="font-price text-xs text-text-muted mt-0.5">0.00</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { icon: IconDeposit,  label: "Deposit",  color: "text-up",      action: () => router.push("/") },
            { icon: IconWithdraw, label: "Withdraw", color: isSuspended ? "text-text-muted" : "text-down",    action: () => isSuspended ? undefined : router.push("/withdraw") },
            { icon: IconTransfer, label: "Transfer", color: isSuspended ? "text-text-muted" : "text-primary", action: () => isSuspended ? undefined : setInternalOpen(true) },
            { icon: IconSend,     label: "Send",     color: isSuspended ? "text-text-muted" : "text-gold",    action: () => isSuspended ? undefined : setP2pOpen(true) },
          ].map(({ icon: Icon, label, color, action }) => (
            <button key={label} onClick={action}
              className={cn("flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-bg-surface2 border border-border active:scale-95 transition-transform", isSuspended && label !== "Deposit" && "opacity-40 cursor-not-allowed")}>
              <Icon size={18} className={color} />
              <span className={`font-outfit text-[10px] font-semibold ${color}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Asset list */}
      <div className="px-4 mt-5 mb-2">
        <p className="font-syne font-semibold text-sm text-text-primary">Your Assets</p>
      </div>

      <div className="divide-y divide-border/40">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="w-9 h-9 rounded-full skeleton" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-16 rounded" />
                <div className="skeleton h-2.5 w-24 rounded" />
              </div>
              <div className="text-right space-y-1.5">
                <div className="skeleton h-3.5 w-20 rounded" />
                <div className="skeleton h-2.5 w-14 rounded ml-auto" />
              </div>
            </div>
          ))
        ) : assets.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-outfit text-text-muted text-sm">No assets yet</p>
            <button onClick={() => router.push("/")} className="text-primary font-outfit text-sm mt-2">Make a deposit</button>
          </div>
        ) : (
          assets.map(({ symbol, amount, usdValue, change }) => {
            const dir = parseFloat(change) > 0 ? "up" : parseFloat(change) < 0 ? "down" : "flat";
            const kesVal = usdValue * kesPerUsd;
            return (
              <button key={symbol}
                onClick={() => symbol !== "KES" && router.push(`/markets/${symbol}`)}
                className="flex items-center gap-3 px-4 py-3 w-full active:bg-bg-surface2 transition-colors">
                {/* Icon placeholder */}
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="font-price text-[10px] font-bold text-primary">{symbol.slice(0, 3)}</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-outfit font-semibold text-sm text-text-primary">{symbol}</p>
                  <p className="font-outfit text-[10px] text-text-muted">
                    {parseFloat(amount) < 0.0001 ? parseFloat(amount).toExponential(2) : parseFloat(amount).toFixed(6)} {symbol}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-price text-sm text-text-primary">
                    {hidden ? "••••" : `KSh ${kesVal.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`}
                  </p>
                  {symbol !== "KES" && (
                    <span className={cn(
                      "inline-block font-price text-[10px] font-semibold px-1.5 py-0.5 rounded-lg mt-0.5",
                      dir === "up" ? "bg-up/20 text-up" : dir === "down" ? "bg-down/20 text-down" : "bg-bg-surface2 text-text-muted"
                    )}>
                      {parseFloat(change) > 0 ? "+" : ""}{parseFloat(change).toFixed(2)}%
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Analysis section */}
      <div className="border-t border-border mt-4 pt-4">
        <div className="flex items-center justify-between px-4 mb-2">
          <p className="font-syne font-semibold text-sm text-text-primary">Analysis</p>
          <button onClick={() => router.push("/analysis")}
            className="font-outfit text-xs text-primary">View full</button>
        </div>
        <PnlCalendar data={dailyPnl ?? []} />
      </div>

      {/* Transaction history */}
      <div className="border-t border-border mt-4 pt-4">
        <div className="flex items-center justify-between px-4 mb-2">
          <p className="font-syne font-semibold text-sm text-text-primary">Recent Transactions</p>
        </div>
        {!historyData ? (
          <div className="px-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-xl" />
            ))}
          </div>
        ) : historyData.transactions.length === 0 ? (
          <p className="text-center text-text-muted font-outfit text-sm py-6">No transactions yet</p>
        ) : (
          <div className="divide-y divide-border/40">
            {historyData.transactions.map((tx) => {
              const amt = parseFloat(tx.amount);
              const isPositive = amt >= 0;
              const isExpanded = expandedTx === tx.id;
              const isHighlighted = highlightId === tx.id;
              const txDate = new Date(tx.created_at);
              return (
                <div
                  key={tx.id}
                  className={cn(
                    "transition-colors",
                    isHighlighted && "bg-primary/5 ring-1 ring-primary/20 rounded-xl mx-2"
                  )}
                >
                  {/* Main row — tappable to expand */}
                  <button
                    onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
                    className="flex items-center gap-3 px-4 py-3 w-full active:bg-bg-surface2 transition-colors"
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm",
                      isPositive ? "bg-up/15 text-up" : "bg-down/15 text-down"
                    )}>
                      {isPositive ? "↑" : "↓"}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-outfit text-sm text-text-primary capitalize truncate">
                        {tx.type.replace(/_/g, " ")}
                      </p>
                      <p className="font-outfit text-[10px] text-text-muted truncate">{tx.note || "—"}</p>
                    </div>
                    <div className="text-right flex-shrink-0 flex items-center gap-2">
                      <div>
                        <p className={cn("font-price text-sm font-semibold", isPositive ? "text-up" : "text-down")}>
                          {isPositive ? "+" : ""}{amt.toFixed(4)} {tx.asset}
                        </p>
                        <p className="font-outfit text-[10px] text-text-muted">
                          {txDate.toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        className={cn("text-text-muted transition-transform", isExpanded && "rotate-90")}>
                        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mx-4 mb-3 px-3 py-3 rounded-xl bg-bg-surface2 border border-border space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Type</p>
                          <p className="font-outfit text-xs text-text-primary capitalize mt-0.5">{tx.type.replace(/_/g, " ")}</p>
                        </div>
                        <div>
                          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Asset</p>
                          <p className="font-price text-xs text-text-primary mt-0.5">{tx.asset}</p>
                        </div>
                        <div>
                          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Amount</p>
                          <p className={cn("font-price text-xs font-semibold mt-0.5", isPositive ? "text-up" : "text-down")}>
                            {isPositive ? "+" : ""}{amt.toFixed(6)} {tx.asset}
                          </p>
                        </div>
                        <div>
                          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Date & Time</p>
                          <p className="font-outfit text-xs text-text-primary mt-0.5">
                            {txDate.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
                            {" "}{txDate.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                      {tx.note && (
                        <div>
                          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Note</p>
                          <p className="font-outfit text-xs text-text-secondary mt-0.5 leading-relaxed">{tx.note}</p>
                        </div>
                      )}
                      {tx.reference_id && (
                        <div>
                          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Reference ID</p>
                          <p className="font-price text-[10px] text-text-muted mt-0.5 break-all">{tx.reference_id}</p>
                        </div>
                      )}
                      <div>
                        <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">Transaction ID</p>
                        <p className="font-price text-[10px] text-text-muted mt-0.5 break-all">{tx.id}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* View full history */}
      <button onClick={() => router.push("/assets")}
        className="mx-4 mt-4 w-[calc(100%-2rem)] py-3 rounded-2xl border border-border bg-bg-surface2 font-outfit text-sm text-text-secondary flex items-center justify-center gap-2">
        All accounts & history
        <IconChevronRight size={14} />
      </button>

      <div className="h-8" />

      <InternalTransferSheet isOpen={internalOpen} onClose={() => setInternalOpen(false)} />
      <P2PSheet isOpen={p2pOpen} onClose={() => setP2pOpen(false)} />
    </div>
  );
}

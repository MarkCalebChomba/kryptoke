"use client";

import { useState, useEffect } from "react";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Confetti } from "@/components/shared/Confetti";
import { useMpesaDeposit } from "@/lib/hooks/useDeposit";
import { useDepositAddress } from "@/lib/hooks/useDepositAddress";
import { useAuth } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { sanitizeNumberInput, isValidKenyanPhone } from "@/lib/utils/formatters";
import { apiGet } from "@/lib/api/client";
import { IconMpesa, IconChevronRight, IconCheck, IconX, IconCopy } from "@/components/icons";
import { cn } from "@/lib/utils/cn";
import { useQuery } from "@tanstack/react-query";

type DepositView =
  | "method"        // choose M-Pesa vs Crypto
  | "mpesa"         // M-Pesa amount entry
  | "processing"    // STK push in flight
  | "success"       // M-Pesa success
  | "failed"        // M-Pesa failed
  | "raise_ticket"  // support ticket form
  | "crypto_token"  // choose token (USDT, BTC, SOL, etc.)
  | "crypto_chain"  // choose blockchain for that token
  | "crypto_address"; // show address + QR

const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

// Tokens available for crypto deposit — sorted by popularity
const DEPOSIT_TOKENS = [
  { symbol: "USDT",  name: "Tether USD",     iconUrl: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png" },
  { symbol: "BTC",   name: "Bitcoin",        iconUrl: "https://assets.coingecko.com/coins/images/1/thumb/bitcoin.png" },
  { symbol: "ETH",   name: "Ethereum",       iconUrl: "https://assets.coingecko.com/coins/images/279/thumb/ethereum.png" },
  { symbol: "BNB",   name: "BNB",            iconUrl: "https://assets.coingecko.com/coins/images/825/thumb/bnb-icon2_2x.png" },
  { symbol: "SOL",   name: "Solana",         iconUrl: "https://assets.coingecko.com/coins/images/4128/thumb/solana.png" },
  { symbol: "XRP",   name: "XRP",            iconUrl: "https://assets.coingecko.com/coins/images/44/thumb/xrp-symbol-white-128.png" },
  { symbol: "TRX",   name: "TRON",           iconUrl: "https://assets.coingecko.com/coins/images/1094/thumb/tron-logo.png" },
  { symbol: "DOGE",  name: "Dogecoin",       iconUrl: "https://assets.coingecko.com/coins/images/5/thumb/dogecoin.png" },
  { symbol: "LTC",   name: "Litecoin",       iconUrl: "https://assets.coingecko.com/coins/images/2/thumb/litecoin.png" },
  { symbol: "TON",   name: "TON",            iconUrl: "https://assets.coingecko.com/coins/images/17980/thumb/ton_symbol.png" },
  { symbol: "XLM",   name: "Stellar",        iconUrl: "https://assets.coingecko.com/coins/images/100/thumb/Stellar_symbol_black_RGB.png" },
  { symbol: "BCH",   name: "Bitcoin Cash",   iconUrl: "https://assets.coingecko.com/coins/images/780/thumb/bitcoin-cash-circle.png" },
  { symbol: "NEAR",  name: "NEAR Protocol",  iconUrl: "https://assets.coingecko.com/coins/images/10365/thumb/near.jpg" },
  { symbol: "FIL",   name: "Filecoin",       iconUrl: "https://assets.coingecko.com/coins/images/12817/thumb/filecoin.png" },
];

// Map token → which chains support depositing it
const TOKEN_CHAINS: Record<string, Array<{ chainId: string; name: string; arrivalTime: string; minDeposit: string; isMemo?: boolean }>> = {
  USDT: [
    { chainId: "TRON",  name: "TRON (TRC-20)",         arrivalTime: "~1 minute",   minDeposit: "1" },
    { chainId: "56",    name: "BNB Smart Chain (BEP-20)",arrivalTime: "~1 minute",  minDeposit: "1" },
    { chainId: "1",     name: "Ethereum (ERC-20)",      arrivalTime: "~5 minutes",  minDeposit: "10" },
    { chainId: "137",   name: "Polygon",                arrivalTime: "~2 minutes",  minDeposit: "1" },
    { chainId: "42161", name: "Arbitrum One",           arrivalTime: "~2 minutes",  minDeposit: "1" },
    { chainId: "8453",  name: "Base",                   arrivalTime: "~2 minutes",  minDeposit: "1" },
    { chainId: "10",    name: "Optimism",               arrivalTime: "~2 minutes",  minDeposit: "1" },
    { chainId: "43114", name: "Avalanche C-Chain",      arrivalTime: "~2 minutes",  minDeposit: "1" },
    { chainId: "SOL",   name: "Solana (SPL)",           arrivalTime: "~30 seconds", minDeposit: "1" },
  ],
  BTC:  [{ chainId: "BTC",  name: "Bitcoin",        arrivalTime: "~30 minutes",  minDeposit: "0.0001" }],
  ETH:  [{ chainId: "1",    name: "Ethereum",       arrivalTime: "~5 minutes",   minDeposit: "0.001" },
         { chainId: "42161",name: "Arbitrum One",   arrivalTime: "~2 minutes",   minDeposit: "0.001" },
         { chainId: "8453", name: "Base",           arrivalTime: "~2 minutes",   minDeposit: "0.001" },
         { chainId: "10",   name: "Optimism",       arrivalTime: "~2 minutes",   minDeposit: "0.001" }],
  BNB:  [{ chainId: "56",   name: "BNB Smart Chain", arrivalTime: "~1 minute",   minDeposit: "0.01" }],
  SOL:  [{ chainId: "SOL",  name: "Solana",         arrivalTime: "~30 seconds",  minDeposit: "0.01" }],
  XRP:  [{ chainId: "XRP",  name: "XRP Ledger",     arrivalTime: "~5 seconds",   minDeposit: "1", isMemo: true }],
  TRX:  [{ chainId: "TRON", name: "TRON",           arrivalTime: "~1 minute",    minDeposit: "10" }],
  DOGE: [{ chainId: "DOGE", name: "Dogecoin",       arrivalTime: "~5 minutes",   minDeposit: "5" }],
  LTC:  [{ chainId: "LTC",  name: "Litecoin",       arrivalTime: "~5 minutes",   minDeposit: "0.01" }],
  TON:  [{ chainId: "TON",  name: "TON",            arrivalTime: "~5 seconds",   minDeposit: "0.1", isMemo: true }],
  XLM:  [{ chainId: "XLM",  name: "Stellar",        arrivalTime: "~5 seconds",   minDeposit: "1", isMemo: true }],
  BCH:  [{ chainId: "BCH",  name: "Bitcoin Cash",   arrivalTime: "~10 minutes",  minDeposit: "0.001" }],
  NEAR: [{ chainId: "NEAR", name: "NEAR Protocol",  arrivalTime: "~2 seconds",   minDeposit: "0.1" }],
  FIL:  [{ chainId: "FIL",  name: "Filecoin",       arrivalTime: "~30 seconds",  minDeposit: "0.1" }],
};

interface DepositSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="tap-target -ml-1 text-text-muted">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

export function DepositSheet({ isOpen, onClose }: DepositSheetProps) {
  const [view, setView] = useState<DepositView>("method");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("USDT");
  const [selectedChainId, setSelectedChainId] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketDone, setTicketDone] = useState(false);
  const { user } = useAuth();
  const toast = useToastActions();
  const deposit = useMpesaDeposit();

  // Load deposit address for the selected chain
  const { data: addrData, isLoading: addrLoading, error: addrError } = useDepositAddress(
    view === "crypto_address" ? selectedChainId : null
  );

  const phone = user?.phone ?? "";

  function handleClose() {
    onClose();
    setTimeout(() => {
      setView("method");
      setAmount("");
      deposit.reset();
    }, 300);
  }

  async function handleStkPush() {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 10) {
      toast.error("Minimum deposit is KSh 10");
      return;
    }
    if (!phone || !isValidKenyanPhone(phone)) {
      toast.error("Please add a verified phone number in Settings → Security");
      return;
    }
    setView("processing");
    deposit.initiate({ phone, amount: amountNum });
  }

  // Watch deposit status transitions
  useEffect(() => {
    if (deposit.depositStatus === "completed" && view === "processing") setView("success");
    if (deposit.depositStatus === "failed"    && view === "processing") setView("failed");
  }, [deposit.depositStatus, view]);

  function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr);
    toast.copied();
  }

  const selectedChains = TOKEN_CHAINS[selectedToken] ?? [];
  const selectedChainMeta = selectedChains.find((c) => c.chainId === selectedChainId);

  return (
    <>
      <Confetti active={view === "success"} />
      <BottomSheet isOpen={isOpen} onClose={handleClose} maxHeight="93dvh">

        {/* ── Method selection ── */}
        {view === "method" && (
          <div className="px-4 py-5">
            <h2 className="font-syne font-bold text-lg text-text-primary mb-4">Add Funds</h2>
            <div className="space-y-3">

              {/* M-Pesa */}
              <button onClick={() => setView("mpesa")}
                className="w-full card border-mpesa/30 bg-mpesa/5 flex items-center gap-3 active:scale-[0.98] transition-transform">
                <div className="w-10 h-10 rounded-xl bg-mpesa/15 flex items-center justify-center flex-shrink-0">
                  <IconMpesa size={20} className="text-mpesa" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-outfit font-semibold text-sm text-text-primary">M-Pesa</p>
                  <div className="flex gap-2 mt-0.5">
                    <span className="font-outfit text-xs text-mpesa">Instant</span>
                    <span className="text-text-muted">·</span>
                    <span className="font-outfit text-xs text-text-muted">No fees</span>
                    <span className="text-text-muted">·</span>
                    <span className="font-outfit text-xs text-text-muted">KSh 10 min</span>
                  </div>
                </div>
                <IconChevronRight size={16} className="text-text-muted" />
              </button>

              {/* Crypto */}
              <button onClick={() => setView("crypto_token")}
                className="w-full card flex items-center gap-3 active:scale-[0.98] transition-transform">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#00E5B4" strokeWidth="1.75"/>
                    <path d="M12 7V17M9 9.5C9 9.5 9.5 8 12 8C14.5 8 15 9.5 15 10.5C15 13 12 13 12 13C12 13 15.5 13 15.5 15.5C15.5 17 14 17.5 12 17.5C10 17.5 8.5 17 8.5 15.5"
                      stroke="#00E5B4" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-outfit font-semibold text-sm text-text-primary">Crypto Deposit</p>
                  <p className="font-outfit text-xs text-text-muted mt-0.5">14 coins · 20 networks</p>
                </div>
                <IconChevronRight size={16} className="text-text-muted" />
              </button>
            </div>
          </div>
        )}

        {/* ── M-Pesa amount entry ── */}
        {view === "mpesa" && (
          <div className="px-4 py-5">
            <div className="flex items-center gap-2 mb-5">
              <BackBtn onClick={() => setView("method")} />
              <h2 className="font-syne font-bold text-base text-text-primary">M-Pesa Deposit</h2>
            </div>
            <div className="mb-4">
              <label className="block font-outfit text-sm text-text-secondary mb-2">Amount (KSh)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-price text-text-muted text-sm">KSh</span>
                <input type="text" inputMode="decimal" value={amount}
                  onChange={(e) => setAmount(sanitizeNumberInput(e.target.value, 2))}
                  className="input-field pl-14 font-price text-lg" placeholder="0.00" />
              </div>
              <div className="flex gap-2 mt-2">
                {QUICK_AMOUNTS.map((a) => (
                  <button key={a} onClick={() => setAmount(a.toString())}
                    className={cn("flex-1 py-1.5 rounded-lg font-outfit text-xs font-medium border transition-colors",
                      amount === a.toString() ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-text-muted")}>
                    {a >= 1000 ? `${a / 1000}K` : a}
                  </button>
                ))}
              </div>
            </div>
            <div className="card-2 flex items-center justify-between mb-4">
              <div>
                <p className="font-outfit text-xs text-text-muted">Push will be sent to</p>
                <p className="font-price text-sm text-text-primary mt-0.5">{phone || "No phone number set"}</p>
              </div>
              <IconMpesa size={20} className="text-mpesa" />
            </div>
            <p className="font-outfit text-xs text-text-muted mb-5 leading-relaxed">
              You will receive an M-Pesa prompt on your phone. Enter your PIN to complete the deposit.
            </p>
            <button onClick={handleStkPush}
              disabled={!amount || parseFloat(amount) < 10 || deposit.isLoading}
              className="btn-mpesa disabled:opacity-50">
              Send M-Pesa Push
            </button>
          </div>
        )}

        {/* ── STK Processing ── */}
        {view === "processing" && (
          <div className="px-4 py-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-mpesa/10 border border-mpesa/30 flex items-center justify-center mb-5">
              <div className="w-8 h-8 border-2 border-mpesa border-t-transparent rounded-full animate-spin" />
            </div>
            <h3 className="font-syne font-bold text-lg text-text-primary mb-2">Waiting for payment</h3>
            <p className="font-outfit text-sm text-text-muted leading-relaxed max-w-xs">
              Check your phone and enter your M-Pesa PIN to complete the deposit.
            </p>
          </div>
        )}

        {/* ── M-Pesa Success ── */}
        {view === "success" && (
          <div className="px-4 py-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-up/10 border border-up/30 flex items-center justify-center mb-5">
              <IconCheck size={28} className="text-up" />
            </div>
            <h3 className="font-syne font-bold text-lg text-text-primary mb-2">Deposit confirmed</h3>
            <p className="font-outfit text-sm text-text-muted mb-1">
              M-Pesa code: <span className="font-price text-text-primary">{deposit.mpesaCode}</span>
            </p>
            <p className="font-outfit text-sm text-text-muted mb-6">
              <span className="font-price text-up text-base">
                {parseFloat(deposit.usdtCredited ?? "0").toFixed(4)} USDT
              </span>{" "}
              credited to your Funding account.
            </p>
            <button onClick={handleClose} className="btn-primary max-w-xs w-full">Done</button>
          </div>
        )}

        {/* ── M-Pesa Failed ── */}
        {view === "failed" && (
          <div className="px-4 py-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-down/10 border border-down/30 flex items-center justify-center mb-5">
              <IconX size={28} className="text-down" />
            </div>
            <h3 className="font-syne font-bold text-lg text-text-primary mb-2">Payment not completed</h3>
            <p className="font-outfit text-sm text-text-muted mb-6 leading-relaxed">
              The M-Pesa payment was not completed. No funds were deducted from your account.
            </p>
            <button onClick={() => { deposit.reset(); setView("mpesa"); }} className="btn-primary max-w-xs w-full mb-3">
              Try Again
            </button>
            {deposit.txId && (
              <button
                onClick={() => setView("raise_ticket" as DepositView)}
                className="max-w-xs w-full py-3 rounded-xl border border-border font-outfit text-sm text-text-secondary active:bg-bg-surface2 transition-colors"
              >
                Payment was deducted? Raise a ticket
              </button>
            )}
          </div>
        )}

        {view === "raise_ticket" && (
          <div className="px-4 py-6">
            <div className="flex items-center gap-2 mb-5">
              <button onClick={() => setView("failed")} className="tap-target -ml-1 text-text-muted">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <h2 className="font-syne font-bold text-base text-text-primary">Raise a Ticket</h2>
            </div>

            {ticketDone ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-full bg-up/10 border border-up/30 flex items-center justify-center mx-auto mb-4">
                  <IconCheck size={24} className="text-up" />
                </div>
                <p className="font-syne font-bold text-base text-text-primary mb-1">Ticket Submitted</p>
                <p className="font-outfit text-sm text-text-muted mb-6">Our team will review your case and respond within 24 hours.</p>
                <button onClick={() => { deposit.reset(); setView("method"); setTicketDone(false); setTicketDesc(""); }} className="btn-primary w-full max-w-xs">
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="px-3 py-2.5 rounded-xl bg-gold/5 border border-gold/20">
                  <p className="font-outfit text-xs text-gold">
                    Only raise a ticket if money was deducted from your M-Pesa but your balance didn't update.
                    We'll verify and credit you within 24 hours.
                  </p>
                </div>

                <div className="px-3 py-2 rounded-xl bg-bg-surface2 border border-border">
                  <p className="font-outfit text-xs text-text-muted mb-0.5">Transaction reference</p>
                  <p className="font-price text-xs text-text-secondary">{deposit.txId}</p>
                </div>

                <div>
                  <label className="block font-outfit text-xs text-text-muted mb-1.5">
                    Describe what happened <span className="text-down">*</span>
                  </label>
                  <textarea
                    value={ticketDesc}
                    onChange={(e) => setTicketDesc(e.target.value)}
                    rows={4}
                    maxLength={500}
                    placeholder="e.g. KSh 1000 was deducted from my M-Pesa (07XXXXXXXX) at 10:15 PM but my balance wasn't updated..."
                    className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border font-outfit text-sm text-text-primary outline-none focus:border-primary transition-colors resize-none"
                  />
                  <p className="font-outfit text-[10px] text-text-muted text-right mt-0.5">{ticketDesc.length}/500</p>
                </div>

                <button
                  disabled={ticketDesc.length < 20 || ticketSubmitting}
                  onClick={async () => {
                    setTicketSubmitting(true);
                    try {
                      const { apiPost: post } = await import("@/lib/api/client");
                      await post("/support/tickets", {
                        type: "deposit",
                        reference_id: deposit.txId,
                        subject: `Failed M-Pesa deposit - ${deposit.txId?.slice(0,8)}`,
                        description: ticketDesc,
                      });
                      setTicketDone(true);
                    } catch (err) {
                      toast.error("Failed to submit ticket", err instanceof Error ? err.message : "");
                    } finally {
                      setTicketSubmitting(false);
                    }
                  }}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ticketSubmitting ? "Submitting…" : "Submit Ticket"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Token picker ── */}
        {view === "crypto_token" && (
          <div className="px-4 py-5">
            <div className="flex items-center gap-2 mb-4">
              <BackBtn onClick={() => setView("method")} />
              <h2 className="font-syne font-bold text-base text-text-primary">Select Coin to Deposit</h2>
            </div>
            <div className="space-y-0.5 max-h-[65dvh] overflow-y-auto">
              {DEPOSIT_TOKENS.map((token) => (
                <button key={token.symbol}
                  onClick={() => { setSelectedToken(token.symbol); setView("crypto_chain"); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl active:bg-bg-surface2 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-bg-surface2 border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={token.iconUrl} alt={token.symbol} className="w-7 h-7 object-cover rounded-full"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-outfit font-semibold text-sm text-text-primary">{token.symbol}</p>
                    <p className="font-outfit text-xs text-text-muted">{token.name}</p>
                  </div>
                  <IconChevronRight size={14} className="text-text-muted" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Chain picker ── */}
        {view === "crypto_chain" && (
          <div className="px-4 py-5">
            <div className="flex items-center gap-2 mb-4">
              <BackBtn onClick={() => setView("crypto_token")} />
              <div>
                <h2 className="font-syne font-bold text-base text-text-primary">Select Network</h2>
                <p className="font-outfit text-xs text-text-muted">Depositing {selectedToken}</p>
              </div>
            </div>

            {/* Warning */}
            <div className="card border-gold/20 bg-gold/5 mb-4">
              <p className="font-outfit text-xs text-gold/90 leading-relaxed">
                Only send <strong>{selectedToken}</strong> on the network you select.
                Sending the wrong asset or network may result in permanent loss of funds.
              </p>
            </div>

            <div className="space-y-2 max-h-[55dvh] overflow-y-auto">
              {selectedChains.map((chain) => (
                <button key={chain.chainId}
                  onClick={() => { setSelectedChainId(chain.chainId); setView("crypto_address"); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-border bg-bg-surface2 active:border-primary/40 transition-colors">
                  <div className="flex-1 text-left">
                    <p className="font-outfit font-semibold text-sm text-text-primary">{chain.name}</p>
                    <div className="flex gap-3 mt-0.5">
                      <span className="font-outfit text-[10px] text-text-muted">Min {chain.minDeposit} {selectedToken}</span>
                      <span className="font-outfit text-[10px] text-text-muted">Arrives {chain.arrivalTime}</span>
                      {chain.isMemo && <span className="font-outfit text-[10px] text-down font-semibold">Memo required</span>}
                    </div>
                  </div>
                  <IconChevronRight size={14} className="text-text-muted" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Address display ── */}
        {view === "crypto_address" && (
          <div className="px-4 py-5">
            <div className="flex items-center gap-2 mb-4">
              <BackBtn onClick={() => setView("crypto_chain")} />
              <div>
                <h2 className="font-syne font-bold text-base text-text-primary">Deposit {selectedToken}</h2>
                <p className="font-outfit text-xs text-text-muted">{selectedChainMeta?.name}</p>
              </div>
            </div>

            {addrLoading ? (
              <div className="flex flex-col items-center py-10">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                <p className="font-outfit text-sm text-text-muted">Generating your address…</p>
              </div>
            ) : addrError || !addrData ? (
              <div className="text-center py-10">
                <p className="font-outfit text-sm text-down mb-3">Could not load deposit address.</p>
                <button onClick={() => setView("crypto_chain")} className="text-primary font-outfit text-sm">Go back</button>
              </div>
            ) : (
              <>
                {/* Memo warning for XRP/TON/XLM */}
                {addrData.isMemoChain && addrData.memo && (
                  <div className="card border-down/30 bg-down/5 mb-4">
                    <p className="font-outfit text-xs text-down font-semibold mb-1">
                      ⚠ MEMO REQUIRED — Do not skip
                    </p>
                    <p className="font-outfit text-xs text-text-secondary leading-relaxed">
                      This is a shared deposit address. You MUST include the memo below or your deposit will not be credited.
                    </p>
                  </div>
                )}

                {/* Address */}
                <div className="card-2 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-outfit text-xs text-text-muted">Deposit address</p>
                    <button onClick={() => copyAddress(addrData.address)}
                      className="flex items-center gap-1 text-primary font-outfit text-xs font-semibold">
                      <IconCopy size={11} />Copy
                    </button>
                  </div>
                  <p className="font-price text-xs text-text-primary break-all leading-relaxed select-all">
                    {addrData.address}
                  </p>
                </div>

                {/* Memo */}
                {addrData.isMemoChain && addrData.memo && (
                  <div className="card-2 mb-4 border-down/30">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-outfit text-xs text-down font-semibold">Memo / Destination Tag</p>
                      <button onClick={() => copyAddress(addrData.memo!)}
                        className="flex items-center gap-1 text-primary font-outfit text-xs font-semibold">
                        <IconCopy size={11} />Copy
                      </button>
                    </div>
                    <p className="font-price text-xl font-bold text-text-primary tracking-widest">
                      {addrData.memo}
                    </p>
                    <p className="font-outfit text-[10px] text-text-muted mt-1">
                      Enter this exactly in the memo/tag field of your sending wallet
                    </p>
                  </div>
                )}

                {/* Info pills */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {[
                    { label: `Min deposit: ${selectedChainMeta?.minDeposit} ${selectedToken}` },
                    { label: `Arrival: ${selectedChainMeta?.arrivalTime}` },
                    { label: "Address is permanent" },
                  ].map(({ label }) => (
                    <span key={label} className="font-outfit text-[10px] text-text-muted border border-border px-2 py-1 rounded-full">
                      {label}
                    </span>
                  ))}
                </div>

                <div className="card border-border bg-bg-surface2">
                  <p className="font-outfit text-xs text-text-muted leading-relaxed">
                    Only send <strong className="text-text-secondary">{selectedToken}</strong> on
                    <strong className="text-text-secondary"> {selectedChainMeta?.name}</strong> to this address.
                    Sending unsupported tokens may result in permanent loss.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

      </BottomSheet>
    </>
  );
}

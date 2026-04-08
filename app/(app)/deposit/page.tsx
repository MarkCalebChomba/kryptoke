"use client";

import { useState, useEffect } from "react";
import { TopBar } from "@/components/shared/TopBar";
import { useMpesaDeposit } from "@/lib/hooks/useDeposit";
import { useDepositAddress } from "@/lib/hooks/useDepositAddress";
import { useAuth } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { sanitizeNumberInput, isValidKenyanPhone } from "@/lib/utils/formatters";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { IconMpesa, IconCopy, IconCheck, IconChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils/cn";

// Lazily generate QR data URL from address string
function useQrDataUrl(value: string | undefined) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!value) { setDataUrl(null); return; }
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(value, { width: 160, margin: 1, color: { dark: "#080C14", light: "#FFFFFF" } })
        .then((url) => { if (!cancelled) setDataUrl(url); })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [value]);
  return dataUrl;
}

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  processingTime: string;
  logoUrl: string | null;
}

interface PaymentMethodsResponse {
  country: string;
  providers: PaymentMethod[];
  hasActiveProviders: boolean;
  fallbackMessage: string | null;
}

// ─── Token + chain data (mirrors DepositSheet) ────────────────────────────
const DEPOSIT_TOKENS = [
  { symbol: "USDT",  name: "Tether USD",     iconUrl: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png" },
  { symbol: "BTC",   name: "Bitcoin",        iconUrl: "https://assets.coingecko.com/coins/images/1/thumb/bitcoin.png" },
  { symbol: "ETH",   name: "Ethereum",       iconUrl: "https://assets.coingecko.com/coins/images/279/thumb/ethereum.png" },
  { symbol: "BNB",   name: "BNB",            iconUrl: "https://assets.coingecko.com/coins/images/825/thumb/bnb-icon2_2x.png" },
  { symbol: "SOL",   name: "Solana",         iconUrl: "https://assets.coingecko.com/coins/images/4128/thumb/solana.png" },
  { symbol: "XRP",   name: "XRP",            iconUrl: "https://assets.coingecko.com/coins/images/44/thumb/xrp-symbol-white-128.png" },
  { symbol: "TRX",   name: "TRON",           iconUrl: "https://assets.coingecko.com/coins/images/1094/thumb/tron-logo.png" },
  { symbol: "DOGE",  name: "Dogecoin",       iconUrl: "https://assets.coingecko.com/coins/images/5/thumb/dogecoin.png" },
];

const TOKEN_CHAINS: Record<string, Array<{ chainId: string; name: string; arrivalTime: string; minDeposit: string; isMemo?: boolean }>> = {
  USDT: [
    { chainId: "TRON",  name: "TRON (TRC-20)",          arrivalTime: "~1 minute",   minDeposit: "1" },
    { chainId: "56",    name: "BNB Smart Chain (BEP-20)", arrivalTime: "~1 minute",  minDeposit: "1" },
    { chainId: "1",     name: "Ethereum (ERC-20)",       arrivalTime: "~5 minutes",  minDeposit: "10" },
    { chainId: "SOL",   name: "Solana (SPL)",            arrivalTime: "~30 seconds", minDeposit: "1" },
  ],
  BTC:  [{ chainId: "BTC",    name: "Bitcoin",         arrivalTime: "~30 minutes", minDeposit: "0.0001" }],
  ETH:  [{ chainId: "1",      name: "Ethereum",        arrivalTime: "~5 minutes",  minDeposit: "0.001" }],
  BNB:  [{ chainId: "56",     name: "BNB Smart Chain", arrivalTime: "~1 minute",   minDeposit: "0.001" }],
  SOL:  [{ chainId: "SOL",    name: "Solana",          arrivalTime: "~30 seconds", minDeposit: "0.01" }],
  XRP:  [{ chainId: "XRP",    name: "XRP Ledger",      arrivalTime: "~5 seconds",  minDeposit: "0.1", isMemo: true }],
  TRX:  [{ chainId: "TRON",   name: "TRON",            arrivalTime: "~1 minute",   minDeposit: "1" }],
  DOGE: [{ chainId: "DOGE",   name: "Dogecoin",        arrivalTime: "~10 minutes", minDeposit: "1" }],
};

const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

type DepositTab = "mpesa" | "crypto";
type CryptoStep = "token" | "chain" | "address";

export default function DepositPage() {
  const toast = useToastActions();
  const { user } = useAuth();
  const countryCode = (user as Record<string, unknown>)?.country_code as string ?? "KE";

  // Fetch available payment methods for this user's country
  const { data: paymentMethodsData } = useQuery({
    queryKey: ["config", "payment-methods", countryCode],
    queryFn: () => apiGet<PaymentMethodsResponse>(`/config/payment-methods?country=${countryCode}`),
    staleTime: 5 * 60_000,
  });

  const [tab, setTab] = useState<DepositTab>("mpesa");
  const [copied, setCopied] = useState(false);

  // M-Pesa state
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const { mutateAsync: submitDeposit, isPending: depositing } = useMpesaDeposit();

  // Crypto state
  const [cryptoStep, setCryptoStep] = useState<CryptoStep>("token");
  const [selectedToken, setSelectedToken] = useState(DEPOSIT_TOKENS[0]!);
  const [selectedChain, setSelectedChain] = useState(TOKEN_CHAINS["USDT"]![0]!);
  const { address, memo, isLoading: addrLoading } = useDepositAddress(
    cryptoStep === "address" ? selectedChain.chainId : null
  );
  const qrDataUrl = useQrDataUrl(address ?? undefined);

  async function handleMpesaDeposit() {
    const amt = parseFloat(amount);
    if (!amt || amt < 10) { toast.error("Minimum deposit is KSh 10"); return; }
    if (!isValidKenyanPhone(phone)) { toast.error("Enter a valid Kenyan phone number"); return; }
    try {
      await submitDeposit({ amount, phone });
      toast.success("STK push sent — check your phone");
    } catch (err) {
      toast.error("Deposit failed", err instanceof Error ? err.message : "");
    }
  }

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const chains = TOKEN_CHAINS[selectedToken.symbol] ?? [];

  return (
    <div className="screen">
      <TopBar title="Deposit" showBack />

      {/* Tab bar */}
      <div className="mx-4 mt-4 mb-1 tab-bar">
        <button data-active={tab === "mpesa"} onClick={() => setTab("mpesa")} className="tab-item flex items-center gap-1.5">
          <IconMpesa size={14} className={cn(tab === "mpesa" ? "text-mpesa" : "text-text-muted")} />
          M-Pesa (KES)
        </button>
        <button data-active={tab === "crypto"} onClick={() => setTab("crypto")} className="tab-item">
          Crypto (on-chain)
        </button>
      </div>

      {/* ── M-Pesa tab ─────────────────────────────────────────────────── */}
      {tab === "mpesa" && (
        <div className="px-4 pt-4 space-y-4">

          {/* Coming-soon banner for countries with no active fiat provider */}
          {paymentMethodsData && !paymentMethodsData.hasActiveProviders && (
            <div className="card bg-primary/5 border-primary/20">
              <p className="font-outfit text-xs text-primary font-semibold mb-1">Fiat payments coming soon</p>
              <p className="font-outfit text-xs text-text-secondary leading-relaxed">
                {paymentMethodsData.fallbackMessage ?? "Mobile money and card payments are not yet available in your region. Use the Crypto tab to deposit."}
              </p>
            </div>
          )}
          {/* Quick amounts */}
          <div>
            <p className="font-outfit text-xs text-text-muted mb-2 uppercase tracking-wide">Quick Amounts</p>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map((q) => (
                <button key={q} onClick={() => setAmount(q.toString())}
                  className={cn("py-2 rounded-xl border font-price text-sm transition-all",
                    amount === q.toString() ? "bg-primary/15 border-primary text-primary" : "border-border text-text-muted")}>
                  {q >= 1000 ? `${q / 1000}K` : q}
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Amount (KES)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-outfit text-sm text-text-muted">KSh</span>
              <input type="text" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(sanitizeNumberInput(e.target.value, 0))}
                className="input-field pl-12" placeholder="0" />
            </div>
            <p className="font-outfit text-[10px] text-text-muted mt-1">Minimum: KSh 10 · No deposit fees</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">M-Pesa Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="input-field" placeholder="07XXXXXXXX or 2547XXXXXXXX" />
          </div>

          {/* How it works */}
          <div className="card bg-primary/5 border-primary/20">
            <p className="font-outfit text-xs font-semibold text-primary mb-2">How it works</p>
            {["You enter amount and phone number above",
              "You receive an M-Pesa STK push on your phone",
              "Enter your M-Pesa PIN to authorize",
              "KES is credited to your KryptoKe Funding wallet"].map((step, i) => (
              <div key={i} className="flex items-start gap-2 mb-1.5 last:mb-0">
                <span className="w-4 h-4 rounded-full bg-primary/20 text-primary font-price text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <p className="font-outfit text-xs text-text-secondary">{step}</p>
              </div>
            ))}
          </div>

          <button onClick={handleMpesaDeposit} disabled={depositing || !amount || parseFloat(amount) < 10}
            className="btn-primary disabled:opacity-50">
            {depositing ? "Sending STK push..." : `Deposit KSh ${amount || "0"}`}
          </button>
        </div>
      )}

      {/* ── Crypto tab ─────────────────────────────────────────────────── */}
      {tab === "crypto" && (
        <div className="px-4 pt-4">
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mb-4">
            {(["token", "chain", "address"] as CryptoStep[]).map((step, i) => (
              <div key={step} className="flex items-center gap-1.5">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center font-price text-xs font-bold",
                  cryptoStep === step ? "bg-primary text-bg" :
                  (["token","chain","address"].indexOf(cryptoStep) > i) ? "bg-up/20 text-up" : "bg-bg-surface2 text-text-muted")}>
                  {["token","chain","address"].indexOf(cryptoStep) > i ? "✓" : i + 1}
                </div>
                <span className={cn("font-outfit text-xs", cryptoStep === step ? "text-primary" : "text-text-muted")}>
                  {step === "token" ? "Select Coin" : step === "chain" ? "Network" : "Address"}
                </span>
                {i < 2 && <div className="flex-1 h-px bg-border/60 w-4" />}
              </div>
            ))}
          </div>

          {/* Step 1: Select Token */}
          {cryptoStep === "token" && (
            <div className="space-y-2">
              <p className="font-outfit text-xs text-text-muted mb-3">Select the coin you want to deposit</p>
              {DEPOSIT_TOKENS.map((token) => (
                <button key={token.symbol}
                  onClick={() => { setSelectedToken(token); setSelectedChain(TOKEN_CHAINS[token.symbol]![0]!); setCryptoStep("chain"); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-xl border border-border bg-bg-surface active:bg-bg-surface2 transition-colors">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={token.iconUrl} alt={token.symbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div className="flex-1 text-left">
                    <p className="font-outfit font-semibold text-sm text-text-primary">{token.symbol}</p>
                    <p className="font-outfit text-xs text-text-muted">{token.name}</p>
                  </div>
                  <span className="font-outfit text-xs text-text-muted">{TOKEN_CHAINS[token.symbol]?.length ?? 0} networks</span>
                  <IconChevronRight size={14} className="text-text-muted" />
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Select Network */}
          {cryptoStep === "chain" && (
            <div className="space-y-2">
              <button onClick={() => setCryptoStep("token")}
                className="font-outfit text-xs text-primary mb-2">← Back to coin selection</button>
              <p className="font-outfit text-xs text-text-muted mb-3">
                Depositing <span className="text-text-primary font-semibold">{selectedToken.symbol}</span> — select network
              </p>

              {/* Warning */}
              <div className="card bg-gold/5 border-gold/30 mb-4">
                <p className="font-outfit text-xs text-gold leading-relaxed">
                  Only send <strong>{selectedToken.symbol}</strong> on the network you select. Sending on the wrong network may result in permanent loss of funds.
                </p>
              </div>

              {chains.map((chain) => (
                <button key={chain.chainId}
                  onClick={() => { setSelectedChain(chain); setCryptoStep("address"); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-xl border border-border bg-bg-surface active:bg-bg-surface2 transition-colors">
                  <div className="flex-1 text-left">
                    <p className="font-outfit font-semibold text-sm text-text-primary">{chain.name}</p>
                    <div className="flex gap-3 mt-0.5">
                      <span className="font-outfit text-[10px] text-text-muted">Arrival: {chain.arrivalTime}</span>
                      <span className="font-outfit text-[10px] text-text-muted">Min: {chain.minDeposit} {selectedToken.symbol}</span>
                    </div>
                  </div>
                  {chain.isMemo && <span className="font-outfit text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">MEMO</span>}
                  <IconChevronRight size={14} className="text-text-muted" />
                </button>
              ))}
            </div>
          )}

          {/* Step 3: Show Address */}
          {cryptoStep === "address" && (
            <div className="space-y-4">
              <button onClick={() => setCryptoStep("chain")} className="font-outfit text-xs text-primary">
                ← Back to network selection
              </button>

              {/* Warning */}
              <div className="card bg-gold/5 border-gold/30">
                <p className="font-outfit text-xs text-gold leading-relaxed">
                  Only send <strong>{selectedToken.symbol}</strong> via <strong>{selectedChain.name}</strong> to this address.
                  Sending other tokens or using a different network will result in loss of funds.
                </p>
              </div>

              {addrLoading ? (
                <div className="skeleton h-40 rounded-2xl" />
              ) : (
                <div className="card space-y-4">
                  {/* QR Code */}
                  <div className="flex flex-col items-center py-4">
                    <div className="w-40 h-40 rounded-2xl bg-white p-2 flex items-center justify-center">
                      {qrDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrDataUrl} alt="Deposit address QR code" width={144} height={144} className="rounded-xl" />
                      ) : (
                        <div className="w-36 h-36 bg-bg-surface2 rounded-xl animate-pulse" />
                      )}
                    </div>
                    <p className="font-outfit text-[10px] text-text-muted mt-2">Scan with your wallet app</p>
                  </div>

                  {/* Address */}
                  <div>
                    <p className="font-outfit text-xs text-text-muted mb-1.5">Deposit Address</p>
                    <div className="flex items-center gap-2 bg-bg-surface2 border border-border rounded-xl px-3 py-2.5">
                      <p className="flex-1 font-price text-xs text-text-primary break-all leading-relaxed">
                        {address ?? "Loading..."}
                      </p>
                      <button onClick={copyAddress} className="flex-shrink-0 tap-target">
                        {copied
                          ? <IconCheck size={16} className="text-up" />
                          : <IconCopy size={16} className="text-text-muted" />}
                      </button>
                    </div>
                  </div>

                  {/* Memo / Destination Tag if needed */}
                  {memo && (
                    <div>
                      <p className="font-outfit text-xs text-text-muted mb-1.5">
                        {selectedChain.chainId === "XRP" ? "Destination Tag" : "Memo / Tag"}{" "}
                        <span className="text-down font-semibold">(Required)</span>
                      </p>
                      <div className="flex items-center gap-2 bg-down/5 border border-down/30 rounded-xl px-3 py-2.5">
                        <p className="flex-1 font-price text-sm text-text-primary">{memo}</p>
                        <button onClick={async () => { await navigator.clipboard.writeText(memo).catch(() => undefined); toast.success("Memo copied"); }}>
                          <IconCopy size={16} className="text-text-muted" />
                        </button>
                      </div>
                      <p className="font-outfit text-[10px] text-down mt-1">
                        {selectedChain.chainId === "XRP"
                          ? "You must include this Destination Tag. Deposits without it cannot be credited."
                          : "You must include this memo or your deposit will not be credited."}
                      </p>
                    </div>
                  )}

                  {/* Network info */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Network",  value: selectedChain.name.split(" ")[0]! },
                      { label: "Arrival",  value: selectedChain.arrivalTime },
                      { label: "Minimum",  value: `${selectedChain.minDeposit} ${selectedToken.symbol}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-bg-surface2 rounded-xl px-2 py-2 text-center border border-border">
                        <p className="font-outfit text-[9px] text-text-muted">{label}</p>
                        <p className="font-outfit text-[10px] text-text-primary mt-0.5 font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

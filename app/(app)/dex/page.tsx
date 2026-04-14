"use client";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useToastActions } from "@/components/shared/ToastContainer";
import { useWallet } from "@/lib/hooks/useWallet";
import { apiPost, apiGet } from "@/lib/api/client";
import { sanitizeNumberInput } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

// ─── Token registry ────────────────────────────────────────────────────────

interface Token {
  symbol: string;
  name: string;
  logo_url?: string;
  address: string; // BSC address or "INTERNAL"
}

// Default list — enhanced with real logos via tokens table query below
const DEFAULT_TOKENS: Token[] = [
  { symbol: "BNB",  name: "BNB",           address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" },
  { symbol: "USDT", name: "Tether USD",     address: "0x55d398326f99059fF775485246999027B3197955" },
  { symbol: "USDC", name: "USD Coin",       address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
  { symbol: "BTC",  name: "Bitcoin (BSC)",  address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" },
  { symbol: "ETH",  name: "Ethereum (BSC)", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8" },
  { symbol: "CAKE", name: "PancakeSwap",    address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82" },
  { symbol: "SOL",  name: "Solana (BSC)",   address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF" },
  { symbol: "XRP",  name: "XRP (BSC)",      address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE" },
];

const LOGO_FALLBACKS: Record<string, string> = {
  BNB:  "https://assets.coingecko.com/coins/images/825/thumb/bnb-icon2_2x.png",
  USDT: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png",
  USDC: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
  BTC:  "https://assets.coingecko.com/coins/images/1/thumb/bitcoin.png",
  ETH:  "https://assets.coingecko.com/coins/images/279/thumb/ethereum.png",
  CAKE: "https://assets.coingecko.com/coins/images/12632/thumb/pancakeswap-cake-logo.png",
  SOL:  "https://assets.coingecko.com/coins/images/4128/thumb/solana.png",
  XRP:  "https://assets.coingecko.com/coins/images/44/thumb/xrp-symbol-white-128.png",
};

// ─── Token Logo ────────────────────────────────────────────────────────────

function TokenLogo({ token, size = 32 }: { token: Token; size?: number }) {
  const src = token.logo_url ?? LOGO_FALLBACKS[token.symbol];
  if (!src) {
    return (
      <div style={{ width: size, height: size }}
        className="rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <span className="font-price text-[10px] font-bold text-primary">{token.symbol.slice(0, 3)}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={token.symbol} width={size} height={size}
      className="rounded-full object-cover flex-shrink-0 border border-border"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ─── Token Picker ──────────────────────────────────────────────────────────

function TokenPicker({ value, exclude, tokens, onChange }: {
  value: Token; exclude: Token; tokens: Token[]; onChange: (t: Token) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = tokens.filter(t =>
    t.symbol !== exclude.symbol &&
    (t.symbol.toLowerCase().includes(search.toLowerCase()) ||
     t.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-surface2 border border-border active:bg-bg-surface flex-shrink-0">
        <TokenLogo token={value} size={20} />
        <span className="font-syne font-bold text-sm text-text-primary">{value.symbol}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-text-muted">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setOpen(false)}>
          <div className="w-full bg-bg-surface rounded-t-2xl border-t border-border p-4 max-h-[70vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <p className="font-syne font-bold text-base text-text-primary mb-3">Select Token</p>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              className="input-field mb-3" placeholder="Search token…" autoFocus />
            <div className="space-y-1">
              {filtered.map(t => (
                <button key={t.symbol}
                  onClick={() => { onChange(t); setOpen(false); setSearch(""); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-bg-surface2 text-left">
                  <TokenLogo token={t} size={32} />
                  <div>
                    <p className="font-outfit text-sm font-semibold text-text-primary">{t.symbol}</p>
                    <p className="font-outfit text-[10px] text-text-muted">{t.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main DEX Page ─────────────────────────────────────────────────────────

const SLIPPAGE_PRESETS = ["0.1", "0.5", "1.0"] as const;

export default function DexPage() {
  const toast = useToastActions();
  const qc = useQueryClient();
  const { usdtBalance, bnbBalance } = useWallet();

  // Fetch real logos from the tokens table
  const { data: dbTokensData } = useQuery({
    queryKey: ["tokens-dex"],
    queryFn: () => apiGet<{ data: Array<{ symbol: string; name: string; logo_url: string }> }>("/tokens?limit=200"),
    staleTime: 10 * 60_000,
  });

  // Merge DB logos into token list
  const tokens: Token[] = DEFAULT_TOKENS.map(t => {
    const dbTok = dbTokensData?.data?.find(d => d.symbol === t.symbol);
    return { ...t, logo_url: dbTok?.logo_url ?? LOGO_FALLBACKS[t.symbol] };
  });

  const [fromToken, setFromToken] = useState<Token>(tokens[0]!); // BNB
  const [toToken,   setToToken]   = useState<Token>(tokens[1]!); // USDT
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [customSlippage, setCustomSlippage] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pendingPin, setPendingPin] = useState<string | null>(null);

  const activeSlippage = showCustom && customSlippage
    ? customSlippage
    : slippage;

  // ── PancakeSwap price quote (client-side) ───────────────────────────────
  const [quote, setQuote] = useState<{
    amountOut: string; rate: string; priceImpact: string; loading: boolean;
  }>({ amountOut: "", rate: "", priceImpact: "", loading: false });

  const fetchQuote = useCallback(async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote({ amountOut: "", rate: "", priceImpact: "", loading: false });
      return;
    }
    setQuote(q => ({ ...q, loading: true }));
    try {
      // Fetch USD prices from PancakeSwap V2 for both tokens
      const BSC_ADDR: Record<string, string> = {
        USDT: "0x55d398326f99059fF775485246999027B3197955",
        USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        BTC:  "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
        ETH:  "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
        BNB:  "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
        SOL:  "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
        XRP:  "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
      };
      async function getPcsPrice(sym: string): Promise<number> {
        if (sym === "USDT" || sym === "USDC") return 1;
        const addr = BSC_ADDR[sym];
        if (!addr) return 0;
        const res = await fetch(`https://api.pancakeswap.info/api/v2/tokens/${addr}`);
        const d = await res.json() as { data?: { price?: string } };
        return parseFloat(d.data?.price ?? "0") || 0;
      }
      const [fromPrice, toPrice] = await Promise.all([
        getPcsPrice(fromToken.symbol),
        getPcsPrice(toToken.symbol),
      ]);
      if (fromPrice <= 0 || toPrice <= 0) throw new Error("price unavailable");

      const spread = 0.005;
      const effectiveFrom = fromPrice * (1 - spread);
      const amountOut = ((parseFloat(fromAmount) * effectiveFrom) / toPrice).toFixed(6);
      const usdVal = parseFloat(fromAmount) * fromPrice;
      const priceImpact = usdVal > 10000 ? "0.15" : usdVal > 1000 ? "0.05" : "0.01";
      const rate = `1 ${fromToken.symbol} = ${(effectiveFrom / toPrice).toFixed(6)} ${toToken.symbol}`;

      setQuote({ amountOut, rate, priceImpact, loading: false });
    } catch {
      // Fallback: leave quote empty, user can still submit (server will re-quote)
      setQuote(q => ({ ...q, loading: false }));
    }
  }, [fromAmount, fromToken.symbol, toToken.symbol]);

  useEffect(() => {
    const t = setTimeout(fetchQuote, 600);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  // ── Balances ──────────────────────────────────────────────────────────────
  const fromBalance = fromToken.symbol === "USDT" ? usdtBalance
    : fromToken.symbol === "BNB" ? bnbBalance : "0";

  function setMax() {
    const bal = parseFloat(fromBalance);
    if (bal > 0) setFromAmount(bal.toFixed(6));
  }

  function swapTokens() {
    const tmp = fromToken;
    setFromToken(toToken);
    setToToken(tmp);
    setFromAmount(quote.amountOut ?? "");
  }

  // ── Execute swap ──────────────────────────────────────────────────────────
  const swapMutation = useMutation({
    mutationFn: (assetPin?: string) => apiPost<{ data: { amountOut: string; rate: string } }>("/wallet/dex-swap", {
      fromToken: fromToken.symbol,
      toToken:   toToken.symbol,
      amountIn:  fromAmount,
      slippage:  parseFloat(activeSlippage),
      ...(assetPin ? { assetPin } : {}),
    }),
    onSuccess: (res) => {
      const out = res.data?.amountOut ?? quote.amountOut;
      toast.success("Swap complete!", `${fromAmount} ${fromToken.symbol} → ${out} ${toToken.symbol}`);
      setFromAmount("");
      setQuote({ amountOut: "", rate: "", priceImpact: "", loading: false });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      setPendingPin(null);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Please try again";
      if (msg.toLowerCase().includes("pin")) {
        setPinRequired(true);
      } else {
        toast.error("Swap failed", msg);
      }
      setPendingPin(null);
    },
  });

  function executeSwap(pin?: string) {
    if (!fromAmount || parseFloat(fromAmount) <= 0) return;
    swapMutation.mutate(pin);
  }

  const minReceived = quote.amountOut
    ? (parseFloat(quote.amountOut) * (1 - parseFloat(activeSlippage) / 100)).toFixed(6)
    : "";

  return (
    <div className="screen">
      <TopBar title="DEX Swap" showBack />

      {/* BSC badge */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="font-outfit text-[10px] font-bold text-gold border border-gold/30 px-2 py-0.5 rounded-full">
          BSC / BEP-20
        </span>
        <span className="font-outfit text-[10px] text-text-muted">
          Prices via PancakeSwap V2 · 0.5% platform spread
        </span>
      </div>

      {/* Swap card */}
      <div className="mx-4 mt-1 space-y-1">

        {/* From */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="font-outfit text-xs text-text-muted">You Pay</p>
            <div className="flex items-center gap-1.5">
              <span className="font-outfit text-xs text-text-muted">
                Bal: {parseFloat(fromBalance).toFixed(4)} {fromToken.symbol}
              </span>
              <button onClick={setMax}
                className="font-outfit text-[10px] font-bold text-primary border border-primary/30 px-1.5 py-0.5 rounded">
                MAX
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text" inputMode="decimal" value={fromAmount}
              onChange={e => setFromAmount(sanitizeNumberInput(e.target.value, 8))}
              className="flex-1 bg-transparent font-price text-2xl font-medium text-text-primary outline-none"
              placeholder="0.00"
            />
            <TokenPicker value={fromToken} exclude={toToken} tokens={tokens} onChange={setFromToken} />
          </div>
        </div>

        {/* Swap direction button */}
        <div className="flex justify-center">
          <button onClick={swapTokens}
            className="w-9 h-9 rounded-xl bg-bg-surface border-2 border-border flex items-center justify-center active:rotate-180 transition-transform duration-300 -my-0.5 z-10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M7 16V4m0 0L4 7m3-3l3 3M17 8v12m0 0l3-3m-3 3l-3-3"
                stroke="#00E5B4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* To */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="font-outfit text-xs text-text-muted">You Receive</p>
            {quote.loading && <span className="font-outfit text-[10px] text-text-muted animate-pulse">Getting quote…</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-price text-2xl font-medium text-up">
              {quote.loading
                ? <span className="text-text-muted text-base">…</span>
                : quote.amountOut
                  ? quote.amountOut
                  : <span className="text-text-muted">0.00</span>
              }
            </div>
            <TokenPicker value={toToken} exclude={fromToken} tokens={tokens} onChange={setToToken} />
          </div>
        </div>
      </div>

      {/* Slippage */}
      <div className="mx-4 mt-3">
        <p className="font-outfit text-xs text-text-muted mb-1.5">Slippage Tolerance</p>
        <div className="flex gap-1.5">
          {SLIPPAGE_PRESETS.map(s => (
            <button key={s}
              onClick={() => { setSlippage(s); setShowCustom(false); }}
              className={cn("flex-1 py-1.5 rounded-lg font-price text-xs border transition-all",
                !showCustom && slippage === s
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "border-border text-text-muted")}>
              {s}%
            </button>
          ))}
          <button
            onClick={() => setShowCustom(v => !v)}
            className={cn("flex-1 py-1.5 rounded-lg font-price text-xs border transition-all",
              showCustom ? "bg-gold/15 border-gold/40 text-gold" : "border-border text-text-muted")}>
            Custom
          </button>
        </div>
        {showCustom && (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text" inputMode="decimal" value={customSlippage}
              onChange={e => setCustomSlippage(sanitizeNumberInput(e.target.value, 2))}
              className="input-field flex-1 py-1.5 text-xs"
              placeholder="e.g. 2.0"
            />
            <span className="font-outfit text-sm text-text-muted">%</span>
          </div>
        )}
        {parseFloat(activeSlippage) > 5 && (
          <p className="font-outfit text-[10px] text-down mt-1">
            ⚠ High slippage — you may receive significantly less than expected
          </p>
        )}
      </div>

      {/* Quote details */}
      {quote.amountOut && fromAmount && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-bg-surface2 border border-border space-y-2">
          {[
            { label: "Rate",         value: quote.rate },
            { label: "Price Impact", value: `${quote.priceImpact}%`, color: parseFloat(quote.priceImpact) > 0.1 ? "text-gold" : "text-up" },
            { label: "Min Received", value: `${minReceived} ${toToken.symbol}` },
            { label: "Slippage",     value: `${activeSlippage}%` },
            { label: "Spread",       value: "0.5%" },
            { label: "Route",        value: `${fromToken.symbol} → PancakeSwap V2 → ${toToken.symbol}` },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between gap-2">
              <span className="font-outfit text-xs text-text-muted flex-shrink-0">{label}</span>
              <span className={cn("font-outfit text-xs font-medium text-right", color ?? "text-text-primary")}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Swap button */}
      <div className="mx-4 mt-4">
        <button
          onClick={() => executeSwap()}
          disabled={!fromAmount || parseFloat(fromAmount) <= 0 || swapMutation.isPending || quote.loading}
          className="btn-primary disabled:opacity-50">
          {swapMutation.isPending
            ? <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-bg border-t-transparent animate-spin" />
                Swapping…
              </span>
            : fromAmount
              ? `Swap ${fromAmount} ${fromToken.symbol} → ${toToken.symbol}`
              : "Enter an amount"
          }
        </button>
        <p className="font-outfit text-[10px] text-text-muted text-center mt-2 leading-relaxed">
          Prices sourced from PancakeSwap V2. Swaps execute against your internal KryptoKe balance. BSC transaction fees do not apply.
        </p>
      </div>

      {/* Asset PIN sheet */}
      {pinRequired && (
        <BottomSheet isOpen onClose={() => setPinRequired(false)} title="Enter Asset PIN">
          <div className="px-4 pb-6">
            <p className="font-outfit text-sm text-text-muted mb-4 text-center">
              Enter your 6-digit asset PIN to authorise this swap.
            </p>
            <div className="flex justify-center gap-2">
              {/* Simple PIN digit inputs */}
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  type="password" inputMode="numeric" maxLength={1}
                  className="w-10 h-12 text-center bg-bg-surface2 border border-border rounded-xl font-price text-lg text-text-primary outline-none focus:border-primary"
                  onChange={e => {
                    const val = e.target.value.replace(/\D/, "");
                    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("[data-pin-input]"));
                    if (val && i < 5) inputs[i + 1]?.focus();
                    const pin = inputs.map(el => el.value).join("");
                    if (pin.length === 6) {
                      setPinRequired(false);
                      executeSwap(pin);
                      inputs.forEach(el => { el.value = ""; });
                    }
                  }}
                  data-pin-input
                />
              ))}
            </div>
          </div>
        </BottomSheet>
      )}

      <div className="h-8" />
    </div>
  );
}

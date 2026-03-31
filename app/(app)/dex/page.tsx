"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { useToastActions } from "@/components/shared/ToastContainer";
import { usePrices } from "@/lib/store";
import { useWallet } from "@/lib/hooks/useWallet";
import { apiPost } from "@/lib/api/client";
import { sanitizeNumberInput } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

const TOKENS = [
  { symbol: "BNB",   name: "BNB",           logo: "🟡", decimals: 18, address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" },
  { symbol: "USDT",  name: "Tether USD",    logo: "💚", decimals: 18, address: "0x55d398326f99059fF775485246999027B3197955" },
  { symbol: "USDC",  name: "USD Coin",      logo: "🔵", decimals: 18, address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
  { symbol: "ETH",   name: "Ethereum",      logo: "🔷", decimals: 18, address: "ETH" },
  { symbol: "BTC",   name: "Bitcoin (BSC)", logo: "🟠", decimals: 18, address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" },
  { symbol: "CAKE",  name: "PancakeSwap",   logo: "🥞", decimals: 18, address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82" },
  { symbol: "SOL",   name: "Solana (BSC)",  logo: "🟣", decimals: 18, address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF" },
  { symbol: "XRP",   name: "XRP (BSC)",     logo: "⚫", decimals: 18, address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE" },
];

const DEX_SOURCES = ["PancakeSwap", "Uniswap V3", "1inch", "Venus"] as const;

interface Token { symbol: string; name: string; logo: string; decimals: number; address: string; }

function TokenPicker({ value, exclude, onChange }: {
  value: Token; exclude: Token; onChange: (t: Token) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = TOKENS.filter(t => t.symbol !== exclude.symbol &&
    (t.symbol.includes(search.toUpperCase()) || t.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-surface2 border border-border active:bg-bg-surface flex-shrink-0">
        <span className="text-base">{value.logo}</span>
        <span className="font-syne font-bold text-sm text-text-primary">{value.symbol}</span>
        <span className="text-text-muted text-xs">▼</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setOpen(false)}>
          <div className="w-full bg-bg-surface rounded-t-2xl border-t border-border p-4 max-h-[70vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <p className="font-syne font-bold text-base text-text-primary mb-3">Select Token</p>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              className="input-field mb-3" placeholder="Search token..." autoFocus />
            <div className="space-y-1">
              {filtered.map(t => (
                <button key={t.symbol}
                  onClick={() => { onChange(t); setOpen(false); setSearch(""); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-bg-surface2 text-left">
                  <span className="text-2xl flex-shrink-0">{t.logo}</span>
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

export default function DexPage() {
  const router     = useRouter();
  const toast      = useToastActions();
  const { prices } = usePrices();
  const { usdtBalance, bnbBalance } = useWallet();

  const [fromToken, setFromToken] = useState<Token>(TOKENS.find(t => t.symbol === "BNB")!);
  const [toToken,   setToToken]   = useState<Token>(TOKENS.find(t => t.symbol === "USDT")!);
  const [fromAmount, setFromAmount] = useState("");
  const [slippage,   setSlippage]   = useState("0.5");
  const [source,     setSource]     = useState<typeof DEX_SOURCES[number]>("PancakeSwap");
  const fromPrice = parseFloat(prices[`${fromToken.symbol}USDT`] ?? "1");
  const toPrice   = parseFloat(prices[`${toToken.symbol}USDT`]   ?? "1");
  const fromUsd   = fromAmount ? parseFloat(fromAmount) * fromPrice : 0;

  function swapTokens() {
    const tmpToken = fromToken;
    setFromToken(toToken);
    setToToken(tmpToken);
    setFromAmount(toAmount);
    quoteMutation.reset();
  }

  // Fetch live quote from backend whenever inputs change
  const quoteMutation = useMutation({
    mutationFn: () => apiPost<{ amountOut: string; priceImpact: string; route: string[] }>(
      "/trade/quote",
      { tokenIn: fromToken.symbol, tokenOut: toToken.symbol, amountIn: fromAmount }
    ),
  });

  // Debounce quote fetching
  useEffect(() => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) return;
    const t = setTimeout(() => quoteMutation.mutate(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAmount, fromToken.symbol, toToken.symbol]);

  // Use live quote if available, otherwise use price-derived estimate
  const liveQuote    = quoteMutation.data;
  const toAmount     = liveQuote?.amountOut ?? (fromUsd > 0 && toPrice > 0 ? (fromUsd / toPrice).toFixed(6) : "");
  const priceImpact  = liveQuote?.priceImpact ?? (fromUsd > 10000 ? "0.12" : fromUsd > 1000 ? "0.05" : "0.01");
  const minReceived  = toAmount ? (parseFloat(toAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6) : "";
  const networkFee   = "~$0.08";

  const swapMutation = useMutation({
    mutationFn: () => apiPost("/trade/submit", {
      tokenIn:      fromToken.symbol,
      tokenOut:     toToken.symbol,
      amountIn:     fromAmount,
      minAmountOut: minReceived,
      slippage:     parseFloat(slippage),
      dexSource:    source,
    }),
    onSuccess: () => {
      toast.success("Swap successful!", `${fromAmount} ${fromToken.symbol} → ${toAmount} ${toToken.symbol}`);
      setFromAmount("");
    },
    onError: (err) => toast.error("Swap failed", err instanceof Error ? err.message : "Please try again"),
  });

  async function executeSwap() {
    if (!fromAmount || parseFloat(fromAmount) <= 0) return;
    swapMutation.mutate();
  }

  return (
    <div className="screen">
      <TopBar title="DEX Swap" showBack />

      {/* DEX source selector */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {DEX_SOURCES.map(src => (
            <button key={src} onClick={() => setSource(src)}
              className={cn("flex-shrink-0 px-3 py-1.5 rounded-lg font-outfit text-xs border transition-all",
                source === src ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
              {src}
            </button>
          ))}
        </div>
      </div>

      {/* Swap card */}
      <div className="mx-4 mt-2">
        {/* From */}
        <div className="card mb-1">
          <div className="flex items-center justify-between mb-1">
            <p className="font-outfit text-xs text-text-muted">You Pay</p>
            <p className="font-outfit text-xs text-text-muted">
              Balance: {fromToken.symbol === "USDT" ? parseFloat(usdtBalance).toFixed(4)
                : fromToken.symbol === "BNB" ? parseFloat(bnbBalance).toFixed(4)
                : "—"}
              &nbsp;<button onClick={() => {
                const bal = fromToken.symbol === "USDT" ? usdtBalance : fromToken.symbol === "BNB" ? bnbBalance : "0";
                if (parseFloat(bal) > 0) setFromAmount(parseFloat(bal).toFixed(6));
              }} className="text-primary ml-1">Max</button>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text" inputMode="decimal" value={fromAmount}
              onChange={e => setFromAmount(sanitizeNumberInput(e.target.value, 8))}
              className="flex-1 bg-transparent font-price text-2xl font-medium text-text-primary outline-none"
              placeholder="0" />
            <TokenPicker value={fromToken} exclude={toToken} onChange={setFromToken} />
          </div>
          {fromUsd > 0 && (
            <p className="font-outfit text-[10px] text-text-muted mt-1">≈ ${fromUsd.toFixed(2)} USD</p>
          )}
        </div>

        {/* Swap arrow */}
        <div className="flex justify-center -my-0.5 z-10 relative">
          <button onClick={swapTokens}
            className="w-9 h-9 rounded-xl bg-bg-surface border-2 border-border flex items-center justify-center active:rotate-180 transition-transform duration-300">
            <span className="text-primary text-lg">⇅</span>
          </button>
        </div>

        {/* To */}
        <div className="card mt-1">
          <div className="flex items-center justify-between mb-1">
            <p className="font-outfit text-xs text-text-muted">You Receive</p>
            {toAmount && <p className="font-outfit text-xs text-text-muted">≈ ${fromUsd.toFixed(2)} USD</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-price text-2xl font-medium text-up">
              {quoteMutation.isPending ? (
                <span className="text-text-muted text-base animate-pulse">Fetching quote...</span>
              ) : toAmount || <span className="text-text-muted">0</span>}
            </div>
            <TokenPicker value={toToken} exclude={fromToken} onChange={setToToken} />
          </div>
        </div>

        {/* Price info */}
        {fromAmount && toAmount && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-bg-surface2 border border-border space-y-2">
            {[
              { label: "Rate",          value: `1 ${fromToken.symbol} = ${(fromPrice / toPrice).toFixed(6)} ${toToken.symbol}` },
              { label: "Price Impact",  value: `${priceImpact}%`,   color: parseFloat(priceImpact) > 0.1 ? "text-gold" : "text-up" },
              { label: "Min Received",  value: `${minReceived} ${toToken.symbol}` },
              { label: "Slippage",      value: `${slippage}%` },
              { label: "Network Fee",   value: networkFee },
              { label: "Route",         value: `${fromToken.symbol} → ${source} → ${toToken.symbol}` },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between">
                <span className="font-outfit text-xs text-text-muted">{label}</span>
                <span className={cn("font-outfit text-xs font-medium", color ?? "text-text-primary")}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Slippage settings */}
        <div className="mt-3">
          <p className="font-outfit text-xs text-text-muted mb-1.5">Slippage Tolerance</p>
          <div className="flex gap-1.5">
            {["0.1", "0.5", "1.0", "3.0"].map(s => (
              <button key={s} onClick={() => setSlippage(s)}
                className={cn("flex-1 py-1.5 rounded-lg font-price text-xs border transition-all",
                  slippage === s ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted")}>
                {s}%
              </button>
            ))}
          </div>
        </div>

        {/* Swap button */}
        <button
          onClick={executeSwap}
          disabled={!fromAmount || parseFloat(fromAmount) <= 0 || swapMutation.isPending}
          className="btn-primary mt-4 disabled:opacity-50">
          {swapMutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-bg border-t-transparent animate-spin" />
              Swapping...
            </span>
          ) : fromAmount ? `Swap ${fromAmount} ${fromToken.symbol} → ${toToken.symbol}` : "Enter amount"}
        </button>

        {/* Info */}
        <p className="font-outfit text-[10px] text-text-muted text-center mt-3 px-2 leading-relaxed">
          Swaps execute on BSC via {source}. Prices are live estimates; final price depends on on-chain conditions at execution time.
        </p>
      </div>

      <div className="h-8" />
    </div>
  );
}

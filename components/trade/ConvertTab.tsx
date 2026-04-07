"use client";

import { useState, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { useQuery } from "@tanstack/react-query";
import { useSubmitTrade } from "@/lib/hooks/useTrades";
import { useWallet } from "@/lib/hooks/useWallet";
import { useToastActions } from "@/components/shared/ToastContainer";
import { sanitizeNumberInput } from "@/lib/utils/formatters";
import { apiGet } from "@/lib/api/client";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { IconSearch } from "@/components/icons";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Coin {
  symbol: string;
  name: string;
  logo_url: string;
  price: string;
  change_24h: string;
}

const KES_TOKEN: Coin = { symbol: "KES", name: "Kenyan Shilling", logo_url: "", price: "1", change_24h: "0" };
const USDT_TOKEN: Coin = { symbol: "USDT", name: "Tether", logo_url: "", price: "1", change_24h: "0" };
const PCTS = [25, 50, 75, 100] as const;

// ── Token Logo ─────────────────────────────────────────────────────────────────
function TokenLogo({ coin, size = 32 }: { coin: Coin; size?: number }) {
  const [err, setErr] = useState(false);
  if (coin.symbol === "KES") {
    return (
      <span className="flex items-center justify-center rounded-full bg-green-700/20 border border-green-600/30 font-bold text-green-500 shrink-0 text-[10px]"
        style={{ width: size, height: size }}>KSh</span>
    );
  }
  if (!err && coin.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={coin.logo_url} alt={coin.symbol} width={size} height={size}
      className="rounded-full shrink-0 object-cover" onError={() => setErr(true)} />;
  }
  return (
    <span className="flex items-center justify-center rounded-full bg-primary/10 border border-primary/20 font-bold text-primary shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.32 }}>{coin.symbol.slice(0, 3)}</span>
  );
}

// ── Token Selector Sheet ───────────────────────────────────────────────────────
function TokenSelector({ isOpen, onClose, onSelect, title, includeKes }: {
  isOpen: boolean; onClose: () => void; onSelect: (c: Coin) => void; title: string; includeKes?: boolean;
}) {
  const [q, setQ] = useState("");
  const { data: coins, isLoading } = useQuery({
    queryKey: ["market", "coins", "convert-selector"],
    queryFn: () => apiGet<Coin[]>("/market/coins?page=1&limit=100&tab=all"),
    staleTime: 60_000,
    enabled: isOpen,
  });

  const base: Coin[] = includeKes ? [KES_TOKEN, ...(coins ?? [])] : (coins ?? []);
  const filtered = q
    ? base.filter(c => c.symbol.toLowerCase().includes(q.toLowerCase()) || c.name.toLowerCase().includes(q.toLowerCase()))
    : base;

  return (
    <BottomSheet isOpen={isOpen} onClose={() => { setQ(""); onClose(); }} maxHeight="88dvh">
      <div className="flex flex-col" style={{ height: "82dvh" }}>
        <div className="px-4 pt-1 pb-3 border-b border-border">
          <p className="font-syne font-bold text-sm text-text-primary mb-3">{title}</p>
          <div className="flex items-center gap-2 bg-bg-surface2 border border-border rounded-xl px-3 py-2.5">
            <IconSearch size={15} className="text-text-muted shrink-0" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search coins..."
              className="flex-1 bg-transparent font-outfit text-sm text-text-primary outline-none placeholder:text-text-muted" autoFocus />
            {q && <button onClick={() => setQ("")} className="text-text-muted text-xs">✕</button>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="skeleton w-9 h-9 rounded-full" />
                <div className="flex-1 space-y-1.5"><div className="skeleton h-3.5 w-16 rounded" /><div className="skeleton h-2.5 w-24 rounded" /></div>
                <div className="skeleton h-3.5 w-16 rounded" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center"><p className="font-outfit text-text-muted text-sm">No results</p></div>
          ) : filtered.map(coin => {
            const n = parseFloat(coin.change_24h ?? "0");
            return (
              <button key={coin.symbol} onClick={() => { setQ(""); onSelect(coin); }}
                className="flex items-center gap-3 w-full px-4 py-3 active:bg-bg-surface2 border-b border-border/30">
                <TokenLogo coin={coin} size={36} />
                <div className="flex-1 text-left min-w-0">
                  <p className="font-outfit text-sm font-semibold text-text-primary">{coin.symbol}</p>
                  <p className="font-outfit text-xs text-text-muted truncate">{coin.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-price text-sm text-text-primary">
                    ${parseFloat(coin.price ?? "0").toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </p>
                  <p className={cn("font-price text-xs", n >= 0 ? "text-up" : "text-down")}>
                    {n >= 0 ? "+" : ""}{n.toFixed(2)}%
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Main ConvertTab ────────────────────────────────────────────────────────────
export function ConvertTab() {
  const toast = useToastActions();
  const [fromCoin, setFromCoin] = useState<Coin>(USDT_TOKEN);
  const [toCoin,   setToCoin]   = useState<Coin>(KES_TOKEN);
  const [amount,   setAmount]   = useState("0");
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen,   setToOpen]   = useState(false);
  const { usdtBalance, kesBalance, rate } = useWallet();

  const kesPerUsd = rate?.kesPerUsd ?? "130";
  const available = fromCoin.symbol === "KES" ? kesBalance : fromCoin.symbol === "USDT" ? usdtBalance : "0";

  const estimatedOutput = (() => {
    const num = parseFloat(amount);
    if (isNaN(num) || num === 0) return "0";
    const fromPrice = fromCoin.symbol === "KES" ? 1 / parseFloat(kesPerUsd) : parseFloat(fromCoin.price ?? "1");
    const toPrice   = toCoin.symbol   === "KES" ? 1 / parseFloat(kesPerUsd) : parseFloat(toCoin.price   ?? "1");
    if (toPrice <= 0) return "0";
    const out = (num * fromPrice) / toPrice;
    if (toCoin.symbol === "KES") return out.toFixed(0);
    return out < 0.0001 ? out.toFixed(8) : out.toFixed(4);
  })();

  function handleKey(d: string) {
    if (d === "." && amount.includes(".")) return;
    if (d === "." && amount === "0") { setAmount("0."); return; }
    const next = amount === "0" && d !== "." ? d : amount + d;
    setAmount(sanitizeNumberInput(next, 8));
  }

  function handleBackspace() { setAmount(amount.length <= 1 ? "0" : amount.slice(0, -1)); }
  function handlePct(pct: number) {
    const val = ((parseFloat(available) * pct) / 100).toFixed(fromCoin.symbol === "KES" ? 0 : 6);
    setAmount(sanitizeNumberInput(val));
  }
  function handleSwap() { const tmp = fromCoin; setFromCoin(toCoin); setToCoin(tmp); setAmount("0"); }
  function handleConvert() {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { toast.error("Enter an amount"); return; }
    toast.info("Converting…", `${amount} ${fromCoin.symbol} → ${estimatedOutput} ${toCoin.symbol}`);
    setAmount("0");
  }

  const DIGITS = ["1","2","3","4","5","6","7","8","9",".","0"];

  return (
    <div className="flex flex-col px-4 py-3 gap-3">
      {/* Amount display */}
      <div className="text-center pt-2 pb-1">
        <p className="font-price text-[48px] font-light text-text-primary leading-none tracking-tight">{amount}</p>
        <p className="font-outfit text-sm text-primary mt-1.5">{fromCoin.symbol}</p>
        {estimatedOutput !== "0" && (
          <p className="font-outfit text-xs text-text-muted mt-0.5">≈ {estimatedOutput} {toCoin.symbol}</p>
        )}
      </div>

      {/* Pair card */}
      <div className="rounded-2xl border border-border bg-bg-surface overflow-hidden">
        {/* From */}
        <button onClick={() => setFromOpen(true)}
          className="flex items-center justify-between w-full px-4 py-3.5 active:bg-bg-surface2 transition-colors">
          <div className="flex items-center gap-2.5">
            <TokenLogo coin={fromCoin} size={34} />
            <div className="text-left">
              <p className="font-outfit text-sm font-semibold text-text-primary flex items-center gap-1">
                {fromCoin.symbol}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-text-muted">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </p>
              <p className="font-outfit text-[10px] text-text-muted">
                Avail: {parseFloat(available).toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </p>
            </div>
          </div>
          <span className="font-price text-base text-text-primary">{amount}</span>
        </button>

        {/* Swap divider */}
        <div className="relative border-t border-border flex items-center justify-center">
          <button onClick={handleSwap}
            className="my-[-14px] w-7 h-7 rounded-full border border-border bg-bg-surface2 flex items-center justify-center z-10 active:scale-90 transition-transform shadow-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-text-muted">
              <path d="M7 16L12 11L17 16M7 8L12 13L17 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* To */}
        <button onClick={() => setToOpen(true)}
          className="flex items-center justify-between w-full px-4 py-3.5 active:bg-bg-surface2 transition-colors border-t border-border">
          <div className="flex items-center gap-2.5">
            <TokenLogo coin={toCoin} size={34} />
            <p className="font-outfit text-sm font-semibold text-text-primary flex items-center gap-1">
              {toCoin.symbol}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-text-muted">
                <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </p>
          </div>
          <span className={cn("font-price text-base", parseFloat(estimatedOutput) > 0 ? "text-up" : "text-text-muted")}>
            {estimatedOutput}
          </span>
        </button>
      </div>

      {/* Quick % */}
      <div className="flex gap-1.5">
        {PCTS.map(pct => (
          <button key={pct} onClick={() => handlePct(pct)}
            className="flex-1 py-1.5 rounded-lg border border-border font-outfit text-xs text-text-muted active:border-primary/40 active:text-primary transition-colors">
            {pct === 100 ? "Max" : `${pct}%`}
          </button>
        ))}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-1.5">
        {DIGITS.map(d => (
          <button key={d} onClick={() => handleKey(d)}
            className="h-11 rounded-xl bg-bg-surface2 border border-border/50 font-price text-lg text-text-primary active:bg-border active:scale-95 transition-all">
            {d}
          </button>
        ))}
        <button onClick={handleBackspace}
          className="h-11 rounded-xl bg-bg-surface2 border border-border/50 text-text-secondary flex items-center justify-center active:bg-border active:scale-95 transition-all">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M21 4H8L1 12L8 20H21V4Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            <path d="M18 9L12 15M12 9L18 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Submit */}
      <button onClick={handleConvert} disabled={parseFloat(amount) <= 0} className="btn-primary disabled:opacity-50 mt-1">
        Convert {fromCoin.symbol} → {toCoin.symbol}
      </button>

      {/* Selectors */}
      <TokenSelector isOpen={fromOpen} onClose={() => setFromOpen(false)}
        onSelect={c => { setFromCoin(c); setFromOpen(false); setAmount("0"); }} title="Convert from" includeKes />
      <TokenSelector isOpen={toOpen} onClose={() => setToOpen(false)}
        onSelect={c => { setToCoin(c); setToOpen(false); }} title="Convert to" includeKes />
    </div>
  );
}

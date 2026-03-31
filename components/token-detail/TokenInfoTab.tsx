"use client";

import { useCoinDetail } from "@/lib/hooks/useMarketData";
import { useToastActions } from "@/components/shared/ToastContainer";
import { formatPrice } from "@/lib/utils/formatters";
import { Skeleton } from "@/components/shared/Skeleton";
import { IconCopy, IconExternalLink } from "@/components/icons";
import Big from "big.js";

// ── Sub-components ────────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between py-3 border-b border-border/50">
      <span className="font-outfit text-sm text-text-muted">{label}</span>
      <span className="font-price text-sm text-text-primary text-right max-w-[60%] break-all">{value}</span>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string | null }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between py-3 border-b border-border/50 active:opacity-70">
      <span className="font-outfit text-sm text-text-primary">{label}</span>
      <IconExternalLink size={14} className="text-text-muted" />
    </a>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface TokenInfoTabProps {
  symbol: string;
  // Legacy props kept for backward compat — ignored, we use symbol now
  coingeckoId?:      string | null;
  contractAddress?:  string;
}

export function TokenInfoTab({ symbol }: TokenInfoTabProps) {
  const { data, isLoading } = useCoinDetail(symbol);
  const toast = useToastActions();

  if (isLoading) {
    return (
      <div className="px-4 py-4 space-y-3">
        <Skeleton height={14} className="w-full" />
        <Skeleton height={14} className="w-5/6" />
        <Skeleton height={14} className="w-4/6" />
        <div className="pt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex justify-between border-b border-border/50 pb-3">
              <Skeleton height={12} width={100} />
              <Skeleton height={12} width={120} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-text-muted font-outfit text-sm text-center py-12">
        Token information not available
      </p>
    );
  }

  const fmt = (n: string | null | undefined) => {
    if (!n || n === "0") return null;
    try {
      const b = new Big(n);
      if (b.gte(1e9)) return `${b.div(1e9).toFixed(2)}B`;
      if (b.gte(1e6)) return `${b.div(1e6).toFixed(2)}M`;
      if (b.gte(1e3)) return `${b.div(1e3).toFixed(2)}K`;
      return b.toFixed(2);
    } catch {
      return n;
    }
  };

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" }) : null;

  return (
    <div className="px-4 py-4">
      {/* Description */}
      {data.description && (
        <p className="font-outfit text-sm text-text-secondary leading-relaxed mb-5">
          {data.description}
        </p>
      )}

      {/* Market stats */}
      <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-1">Market Data</p>
      <StatRow label="CMC Rank"           value={data.cmc_rank ? `#${data.cmc_rank}` : null} />
      <StatRow label="Circulating Supply" value={fmt(data.circulating_supply?.toString())} />
      <StatRow label="Max Supply"         value={fmt(data.max_supply?.toString()) ?? "Unlimited"} />
      <StatRow label="All-Time High"
        value={data.ath
          ? `${formatPrice(String(data.ath))}${data.ath_date ? `  ·  ${fmtDate(data.ath_date)}` : ""}`
          : null}
      />
      <StatRow label="All-Time Low"
        value={data.atl
          ? `${formatPrice(String(data.atl))}${data.atl_date ? `  ·  ${fmtDate(data.atl_date)}` : ""}`
          : null}
      />

      <div className="h-3" />

      {/* Block explorers */}
      {data.explorer_urls && data.explorer_urls.length > 0 && (
        <>
          <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-1 mt-2">Block Explorers</p>
          {data.explorer_urls.map((url) => {
            let label = url;
            try {
              const host = new URL(url).hostname.replace("www.", "");
              label = host;
            } catch { /* keep raw */ }
            return <LinkRow key={url} label={label} url={url} />;
          })}
        </>
      )}

      <div className="h-3" />

      {/* Official links */}
      <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-1 mt-2">Links</p>
      <LinkRow label="Website"    url={data.website_url ?? null} />
      <LinkRow label="Whitepaper" url={data.whitepaper_url ?? null} />
      <LinkRow label="Twitter / X" url={data.twitter_url ?? null} />
      <LinkRow label="Telegram"   url={data.telegram_url ?? null} />
      <LinkRow label="Reddit"     url={data.reddit_url ?? null} />
    </div>
  );
}

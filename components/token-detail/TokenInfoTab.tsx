"use client";

import { useCoinGeckoData } from "@/lib/hooks/useTokenDetail";
import { useToastActions } from "@/components/shared/ToastContainer";
import { formatPrice, formatTimeAgo, truncateAddress } from "@/lib/utils/formatters";
import { Skeleton } from "@/components/shared/Skeleton";
import { IconCopy, IconExternalLink } from "@/components/icons";
import Big from "big.js";

interface StatRowProps {
  label: string;
  value: string | null;
  isPrice?: boolean;
  copyable?: boolean;
}

function StatRow({ label, value, isPrice, copyable }: StatRowProps) {
  const toast = useToastActions();

  if (!value) return null;

  const display = isPrice ? formatPrice(value) : value;

  return (
    <div className="flex items-start justify-between py-3 border-b border-border/50">
      <span className="font-outfit text-sm text-text-muted">{label}</span>
      <div className="flex items-center gap-2 max-w-[60%] text-right">
        <span className="font-price text-sm text-text-primary break-all">{display}</span>
        {copyable && (
          <button
            onClick={() => { navigator.clipboard.writeText(value); toast.copied(); }}
            className="flex-shrink-0 text-text-muted hover:text-primary transition-colors"
            aria-label="Copy"
          >
            <IconCopy size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function LinkRow({ label, url, icon }: { label: string; url: string | null; icon?: React.ReactNode }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between py-3 border-b border-border/50 active:opacity-70"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-outfit text-sm text-text-primary">{label}</span>
      </div>
      <IconExternalLink size={14} className="text-text-muted" />
    </a>
  );
}

interface TokenInfoTabProps {
  coingeckoId: string | null | undefined;
  contractAddress: string;
}

export function TokenInfoTab({ coingeckoId, contractAddress }: TokenInfoTabProps) {
  const { data, isLoading } = useCoinGeckoData(coingeckoId);
  const toast = useToastActions();

  if (isLoading) {
    return (
      <div className="px-4 py-4 space-y-3">
        <Skeleton height={14} className="w-full" />
        <Skeleton height={14} className="w-5/6" />
        <Skeleton height={14} className="w-4/6" />
        <div className="pt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between border-b border-border/50 pb-3">
              <Skeleton height={12} width={100} />
              <Skeleton height={12} width={120} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const formatLargeNum = (val: string | null | undefined) => {
    if (!val) return null;
    const n = new Big(val);
    if (n.gte(1e9)) return `$${n.div(1e9).toFixed(2)}B`;
    if (n.gte(1e6)) return `$${n.div(1e6).toFixed(2)}M`;
    if (n.gte(1e3)) return `$${n.div(1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };

  return (
    <div className="px-4 py-4">
      {/* Description */}
      {data?.description && (
        <p className="font-outfit text-sm text-text-secondary leading-relaxed mb-4">
          {data.description}
        </p>
      )}

      {/* Market stats */}
      <div className="mb-2">
        <StatRow label="Market Cap" value={formatLargeNum(data?.marketCap)} />
        <StatRow label="Circulating Supply" value={
          data?.circulatingSupply
            ? new Big(data.circulatingSupply).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
            : null
        } />
        <StatRow label="Total Supply" value={
          data?.totalSupply
            ? new Big(data.totalSupply).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
            : null
        } />
        <StatRow
          label="All-Time High"
          value={data?.allTimeHigh ? `${formatPrice(data.allTimeHigh)}${data.allTimeHighDate ? ` (${new Date(data.allTimeHighDate).toLocaleDateString()})` : ""}` : null}
          isPrice={false}
        />
        <StatRow
          label="All-Time Low"
          value={data?.allTimeLow ? `${formatPrice(data.allTimeLow)}${data.allTimeLowDate ? ` (${new Date(data.allTimeLowDate).toLocaleDateString()})` : ""}` : null}
          isPrice={false}
        />
      </div>

      {/* Contract address */}
      {contractAddress && contractAddress !== "BTCUSDT" && !contractAddress.endsWith("USDT") && (
        <div className="py-3 border-b border-border/50">
          <p className="font-outfit text-sm text-text-muted mb-1.5">Contract Address (BSC)</p>
          <div className="flex items-center gap-2 bg-bg-surface2 border border-border rounded-xl px-3 py-2.5">
            <span className="font-price text-xs text-text-primary flex-1 truncate">
              {contractAddress}
            </span>
            <button
              onClick={() => { navigator.clipboard.writeText(contractAddress); toast.copied(); }}
              className="flex-shrink-0 text-text-muted hover:text-primary transition-colors"
              aria-label="Copy contract address"
            >
              <IconCopy size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Links */}
      {(data?.website || data?.twitter || data?.telegram || data?.whitepaper) && (
        <div className="mt-2">
          <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-1">Official Links</p>
          <LinkRow label="Website" url={data?.website ?? null} />
          <LinkRow label="Whitepaper" url={data?.whitepaper ?? null} />
          <LinkRow label="Twitter" url={data?.twitter ?? null} />
          <LinkRow label="Telegram" url={data?.telegram ?? null} />
        </div>
      )}

      {!data && !isLoading && (
        <p className="text-text-muted font-outfit text-sm text-center py-8">
          Token information not available
        </p>
      )}
    </div>
  );
}

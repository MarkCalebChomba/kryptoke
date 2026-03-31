"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shared/TopBar";
import { AssetRow } from "@/components/assets/AssetRow";
import { SkeletonCoinRow } from "@/components/shared/Skeleton";
import { useWallet } from "@/lib/hooks/useWallet";
import { usePrices } from "@/lib/store";
import { formatKes } from "@/lib/utils/formatters";
import { IconDeposit, IconSend, IconTransfer } from "@/components/icons";

const KNOWN_ASSETS = [
  { symbol: "USDT", name: "Tether USD", iconUrl: null },
  { symbol: "BNB",  name: "BNB",        iconUrl: null },
  { symbol: "BTC",  name: "Bitcoin",    iconUrl: null },
  { symbol: "ETH",  name: "Ethereum",   iconUrl: null },
];

export default function AssetsPage() {
  const router = useRouter();
  const { totalKes, totalUsd, kesBalance, usdtBalance, bnbBalance, rate, isLoading } = useWallet();
  const { prices, priceChanges } = usePrices();
  const kesPerUsd = rate?.kesPerUsd ?? "130";

  const assets = [
    { symbol: "KES",  name: "Kenyan Shilling", iconUrl: null, amount: kesBalance,  price: "1",                                    change: "0" },
    { symbol: "USDT", name: "Tether USD",       iconUrl: null, amount: usdtBalance, price: "1",                                    change: priceChanges["USDTUSDT"] ?? "0" },
    { symbol: "BNB",  name: "BNB",              iconUrl: null, amount: bnbBalance,  price: prices["BNBUSDT"] ?? "300",             change: priceChanges["BNBUSDT"] ?? "0" },
  ].filter((a) => parseFloat(a.amount) > 0);

  return (
    <div className="screen">
      <TopBar title="Assets" showBack />

      {/* Portfolio value */}
      <div className="px-4 pt-4 pb-2">
        <p className="font-outfit text-xs text-text-muted uppercase tracking-wider mb-1">Total Balance</p>
        <p className="font-price text-3xl font-medium text-text-primary">
          {isLoading ? "—" : formatKes(totalKes).replace("KSh ", "")}
        </p>
        <p className="font-outfit text-sm text-text-muted mt-0.5">
          ≈ ${parseFloat(totalUsd).toFixed(2)} USD
        </p>
      </div>

      {/* Action row */}
      <div className="flex gap-3 px-4 py-3">
        {[
          { icon: IconDeposit, label: "Add Funds", action: () => router.push("/") },
          { icon: IconSend,    label: "Send",      action: () => router.push("/") },
          { icon: IconTransfer,label: "Transfer",  action: () => router.push("/") },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action}
            className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-bg-surface2 border border-border active:scale-95 transition-transform">
            <Icon size={18} className="text-text-secondary" />
            <span className="font-outfit text-xs text-text-muted">{label}</span>
          </button>
        ))}
      </div>

      {/* Allocation tiles */}
      <div className="flex gap-2 px-4 pb-4">
        {[
          { label: "Funding",  value: formatKes(kesBalance), color: "#00E5B4" },
          { label: "Trading",  value: `${parseFloat(usdtBalance).toFixed(2)} USDT`, color: "#F0B429" },
          { label: "Earn",     value: "0.00 USDT", color: "#4A90E2" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex-1 card-2 border-l-2" style={{ borderLeftColor: color }}>
            <p className="font-outfit text-[10px] text-text-muted uppercase">{label}</p>
            <p className="font-price text-xs text-text-primary mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-border" />

      {/* Asset list */}
      <div className="pt-2">
        <p className="px-4 py-2 font-outfit text-xs text-text-muted uppercase tracking-wider">Holdings</p>
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonCoinRow key={i} />)
          : assets.map((a) => (
              <AssetRow
                key={a.symbol}
                {...a}
                kesPerUsd={kesPerUsd}
                onTrade={() => router.push("/trade")}
                onClick={() => router.push(`/markets/${a.symbol}`)}
              />
            ))}
        {!isLoading && assets.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-text-muted font-outfit text-sm">No assets yet</p>
            <button onClick={() => router.push("/")} className="text-primary font-outfit text-sm mt-2">
              Make your first deposit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

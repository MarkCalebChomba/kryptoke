"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TopBar } from "@/components/shared/TopBar";
import { AssetRow } from "@/components/assets/AssetRow";
import { SkeletonCoinRow } from "@/components/shared/Skeleton";
import { DepositSheet } from "@/components/home/DepositSheet";
import { useWallet } from "@/lib/hooks/useWallet";
import { usePrices } from "@/lib/store";
import { formatKes } from "@/lib/utils/formatters";
import { IconDeposit, IconSend, IconTransfer } from "@/components/icons";
import { cn } from "@/lib/utils/cn";

export default function AssetsPage() {
  const router = useRouter();
  const [depositOpen, setDepositOpen] = useState(false);
  const { totalKes, totalUsd, kesBalance, usdtBalance, bnbBalance, rate, isLoading } = useWallet();
  const { prices, priceChanges } = usePrices();
  const kesPerUsd = rate?.kesPerUsd ?? "130";

  const assets = [
    { symbol: "KES",  name: "Kenyan Shilling", iconUrl: null, amount: kesBalance,  price: "1",                         change: "0" },
    { symbol: "USDT", name: "Tether USD",       iconUrl: null, amount: usdtBalance, price: "1",                         change: priceChanges["USDTUSDT"] ?? "0" },
    { symbol: "BNB",  name: "BNB",              iconUrl: null, amount: bnbBalance,  price: prices["BNBUSDT"] ?? "300",  change: priceChanges["BNBUSDT"] ?? "0" },
  ].filter((a) => parseFloat(a.amount) > 0);

  // Action buttons — fixed routing
  const actions = [
    { icon: IconDeposit, label: "Add Funds", color: "text-up",      bg: "bg-up/10 border-up/20",          action: () => setDepositOpen(true) },
    { icon: IconSend,    label: "Send",       color: "text-primary", bg: "bg-primary/10 border-primary/20", action: () => router.push("/withdraw") },
    { icon: IconTransfer,label: "Transfer",   color: "text-gold",    bg: "bg-gold/10 border-gold/20",       action: () => router.push("/trade") },
  ];

  return (
    <div className="screen">
      <TopBar title="Assets" showBack />

      {/* Portfolio value */}
      <div className="px-4 pt-4 pb-3">
        <p className="font-outfit text-xs text-text-muted uppercase tracking-wider mb-1">Total Balance</p>
        <p className="font-price text-3xl font-medium text-text-primary">
          {isLoading ? "—" : formatKes(totalKes).replace("KSh ", "")}
          <span className="font-outfit text-sm text-text-muted ml-1">KSh</span>
        </p>
        <p className="font-outfit text-sm text-text-muted mt-0.5">
          ≈ ${parseFloat(totalUsd).toFixed(2)} USD
        </p>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-2 px-4 mb-3">
        {actions.map(({ icon: Icon, label, color, bg, action }) => (
          <button key={label} onClick={action}
            className={cn("flex flex-col items-center gap-1.5 py-3 rounded-xl border active:scale-95 transition-transform", bg)}>
            <Icon size={18} className={color} />
            <span className={cn("font-outfit text-xs font-medium", color)}>{label}</span>
          </button>
        ))}
      </div>

      {/* Allocation tiles */}
      <div className="flex gap-2 px-4 pb-4">
        {[
          { label: "Funding",  value: `KSh ${parseFloat(kesBalance).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`, color: "#00E5B4" },
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
          : assets.length === 0
            ? (
              <div className="py-12 text-center px-6">
                <p className="font-outfit text-sm text-text-muted">No assets yet</p>
                <button onClick={() => setDepositOpen(true)}
                  className="mt-3 font-outfit text-sm text-primary font-semibold">
                  Deposit to get started →
                </button>
              </div>
            )
            : assets.map((asset) => (
              <AssetRow
                key={asset.symbol}
                symbol={asset.symbol}
                name={asset.name}
                amount={asset.amount}
                price={asset.price}
                change={asset.change}
                iconUrl={asset.iconUrl}
                kesPerUsd={kesPerUsd}
              />
            ))
        }
      </div>

      <DepositSheet isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  );
}

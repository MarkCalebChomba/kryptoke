"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shared/TopBar";
import { AssetRow } from "@/components/assets/AssetRow";
import { SkeletonCoinRow } from "@/components/shared/Skeleton";
import { useWallet } from "@/lib/hooks/useWallet";
import { usePrices } from "@/lib/store";
import { formatKes } from "@/lib/utils/formatters";
import { IconDeposit, IconSend, IconTransfer, IconWithdraw } from "@/components/icons";
import { DepositSheet } from "@/components/home/DepositSheet";
import { cn } from "@/lib/utils/cn";

// ── Portfolio donut chart ─────────────────────────────────────────────────────
function DonutChart({ slices }: { slices: { pct: number; color: string; label: string }[] }) {
  const R = 52, cx = 64, cy = 64, strokeW = 18;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  return (
    <svg width={128} height={128} viewBox="0 0 128 128">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#1C2840" strokeWidth={strokeW} />
      {slices.map((s, i) => {
        const dash = (s.pct / 100) * circumference;
        const gap  = circumference - dash;
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeW}
            strokeDasharray={`${dash.toFixed(2)} ${gap.toFixed(2)}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            style={{ transform: "rotate(-90deg)", transformOrigin: "64px 64px" }}
          />
        );
        offset += dash;
        return el;
      })}
      {/* Centre label */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#E2E8F0" fontSize="11"
        fontFamily="var(--font-dm-mono), monospace" fontWeight="700">
        {slices.length > 0 ? "100%" : "—"}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#4A5B7A" fontSize="8"
        fontFamily="var(--font-outfit), sans-serif">
        Portfolio
      </text>
    </svg>
  );
}

export default function AssetsPage() {
  const router = useRouter();
  const [depositOpen, setDepositOpen] = useState(false);
  const { totalKes, totalUsd, kesBalance, usdtBalance, bnbBalance, rate, isLoading } = useWallet();
  const { prices, priceChanges } = usePrices();
  const kesPerUsd = rate?.kesPerUsd ?? "130";

  const assets = [
    { symbol: "KES",  name: "Kenyan Shilling", iconUrl: null, amount: kesBalance,  price: "1",                        change: "0" },
    { symbol: "USDT", name: "Tether USD",       iconUrl: null, amount: usdtBalance, price: "1",                        change: priceChanges["USDTUSDT"] ?? "0" },
    { symbol: "BNB",  name: "BNB",              iconUrl: null, amount: bnbBalance,  price: prices["BNBUSDT"] ?? "300", change: priceChanges["BNBUSDT"] ?? "0" },
  ].filter((a) => parseFloat(a.amount) > 0);

  // Compute USD values for donut
  const totalNum = parseFloat(totalUsd) || 1;
  const assetColors = ["#00D68F", "#F0B429", "#00B4FF", "#FF4560"];
  const slices = assets.map((a, i) => {
    const usdVal = a.symbol === "KES"
      ? parseFloat(a.amount) / parseFloat(kesPerUsd)
      : parseFloat(a.amount) * parseFloat(a.price);
    return {
      pct: Math.max(2, (usdVal / totalNum) * 100),
      color: assetColors[i] ?? "#4A5B7A",
      label: a.symbol,
    };
  });

  return (
    <div className="screen">
      <TopBar title="Assets" showBack />

      {/* Portfolio card with donut */}
      <div className="mx-4 mt-4 card flex items-center gap-4">
        <DonutChart slices={slices} />
        <div className="flex-1 min-w-0">
          <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wider mb-1">Total Balance</p>
          <p className="font-price text-2xl font-bold text-text-primary">
            {isLoading ? "—" : formatKes(totalKes)}
          </p>
          <p className="font-outfit text-xs text-text-muted mt-0.5">
            ≈ ${parseFloat(totalUsd).toFixed(2)} USD
          </p>
          {/* Legend */}
          <div className="flex flex-col gap-1 mt-3">
            {slices.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="font-outfit text-[10px] text-text-muted">{s.label}</span>
                <span className="font-price text-[10px] text-text-secondary ml-auto">{s.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div className="flex gap-2 px-4 py-3">
        {[
          { icon: IconDeposit,  label: "Deposit",  color: "text-up",      action: () => setDepositOpen(true) },
          { icon: IconWithdraw, label: "Withdraw", color: "text-down",    action: () => router.push("/withdraw") },
          { icon: IconTransfer, label: "Transfer", color: "text-primary", action: () => router.push("/me") },
          { icon: IconSend,     label: "Send",     color: "text-gold",    action: () => router.push("/me") },
        ].map(({ icon: Icon, label, color, action }) => (
          <button key={label} onClick={action}
            className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-bg-surface2 border border-border active:scale-95 transition-transform">
            <Icon size={18} className={color} />
            <span className={`font-outfit text-[10px] font-semibold ${color}`}>{label}</span>
          </button>
        ))}
      </div>

      {/* Allocation tiles */}
      <div className="flex gap-2 px-4 pb-4">
        {[
          { label: "Funding",  value: formatKes(kesBalance),                           color: "#00E5B4" },
          { label: "Trading",  value: `${parseFloat(usdtBalance).toFixed(2)} USDT`,    color: "#F0B429" },
          { label: "Earn",     value: "0.00 USDT",                                     color: "#4A90E2" },
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
      <DepositSheet isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  );
}

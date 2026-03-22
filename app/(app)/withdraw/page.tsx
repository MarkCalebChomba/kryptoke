"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { TopBar } from "@/components/shared/TopBar";
import { IconMpesa } from "@/components/icons";
import { cn } from "@/lib/utils/cn";
import { KesWithdrawForm } from "@/components/withdraw/KesWithdrawForm";

const CryptoWithdrawForm = dynamic(
  () => import("@/components/withdraw/CryptoWithdrawForm").then(m => ({ default: m.CryptoWithdrawForm })),
  {
    loading: () => (
      <div className="px-4 pt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-14 rounded-2xl" />
        ))}
      </div>
    ),
    ssr: false,
  }
);

type WithdrawTab = "mpesa" | "crypto";

export default function WithdrawPage() {
  const [tab, setTab] = useState<WithdrawTab>("mpesa");

  return (
    <div className="screen">
      <TopBar title="Withdraw" showBack />

      <div className="mx-4 mt-4 mb-1 tab-bar">
        <button
          data-active={tab === "mpesa"}
          onClick={() => setTab("mpesa")}
          className="tab-item flex items-center justify-center gap-1.5"
        >
          <IconMpesa size={14} className={cn(tab === "mpesa" ? "text-mpesa" : "text-text-muted")} />
          M-Pesa (KES)
        </button>
        <button
          data-active={tab === "crypto"}
          onClick={() => setTab("crypto")}
          className="tab-item"
        >
          Crypto (on-chain)
        </button>
      </div>

      <div className="mx-4 mt-3 mb-1 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15">
        <span className="text-primary text-xs mt-0.5">ℹ</span>
        <p className="font-outfit text-xs text-text-secondary leading-relaxed">
          {tab === "mpesa"
            ? "Withdraw KES directly to your M-Pesa. USDT is converted at the live rate. Processing time: under 2 minutes."
            : "Send crypto to any wallet address on 15+ supported blockchains. Network fees apply."}
        </p>
      </div>

      <div className="mt-2">
        {tab === "mpesa" ? (
          <KesWithdrawForm />
        ) : (
          <CryptoWithdrawForm onSuccess={() => undefined} />
        )}
      </div>
    </div>
  );
}

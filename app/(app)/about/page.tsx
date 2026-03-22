"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shared/TopBar";

export default function AboutPage() {
  const router = useRouter();
  return (
    <div className="screen">
      <TopBar title="About KryptoKe" showBack onBack={() => router.back()} />
      <div className="px-4 pt-4 pb-8 space-y-6">
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
            <span className="font-syne font-bold text-xl text-primary">KK</span>
          </div>
          <h1 className="font-syne font-bold text-lg text-text-primary">KryptoKe</h1>
          <p className="font-outfit text-sm text-text-muted">v{process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0"} · Built for Kenya</p>
        </div>

        <p className="font-outfit text-sm text-text-secondary leading-relaxed text-center">
          KryptoKe is Kenya&apos;s mobile-first crypto exchange. Deposit KES via M-Pesa,
          trade 200+ cryptocurrencies, earn yield on your holdings, and withdraw back
          to M-Pesa — all from your phone.
        </p>

        <div className="divide-y divide-border/50 rounded-xl border border-border overflow-hidden">
          {[
            ["Founded", "2024"],
            ["Headquarters", "Nairobi, Kenya"],
            ["Supported Assets", "200+ cryptocurrencies"],
            ["Payment Method", "M-Pesa (Safaricom Daraja)"],
            ["Blockchains", "15+ chains supported"],
            ["Security", "AES-256 · TLS 1.3 · 2FA · Asset PIN"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-4 py-3 bg-bg-surface">
              <span className="font-outfit text-sm text-text-muted">{label}</span>
              <span className="font-outfit text-sm font-medium text-text-primary">{value}</span>
            </div>
          ))}
        </div>

        <div className="text-center space-y-2">
          <a href="mailto:support@kryptoke.com" className="block font-outfit text-sm text-primary">support@kryptoke.com</a>
          <p className="font-outfit text-xs text-text-muted">© 2024 KryptoKe. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

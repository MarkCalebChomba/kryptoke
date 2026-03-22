"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shared/TopBar";

export default function TermsPage() {
  const router = useRouter();
  return (
    <div className="screen">
      <TopBar title="Terms of Use" showBack onBack={() => router.back()} />
      <div className="px-4 pt-2 pb-8 space-y-6 font-outfit text-sm text-text-secondary leading-relaxed">
        <p className="text-text-muted text-xs">Last updated: 1 March 2025</p>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using KryptoKe you agree to be bound by these Terms of Use and all applicable laws. If you do not agree, do not use the platform.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">2. Eligibility</h2>
          <p>You must be at least 18 years old and a resident of a jurisdiction where cryptocurrency trading is legal. You are responsible for ensuring compliance with local laws.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">3. Account Security</h2>
          <p>You are responsible for maintaining the confidentiality of your credentials and Asset PIN. KryptoKe will never ask for your password or PIN. Enable 2FA for maximum security.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">4. Trading Risks</h2>
          <p>Cryptocurrency trading involves significant risk. Prices are volatile. You may lose some or all of your invested capital. Futures trading involves leverage which amplifies both gains and losses. Trade responsibly.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">5. Fees</h2>
          <p>Spot trading: 0.1% maker/taker fee. Futures: $0.05 flat fee + 0.04% spread per trade. M-Pesa deposits: free. M-Pesa withdrawals: 1% fee. On-chain withdrawals: network fee applies. Fee schedule may change with 7 days notice.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">6. Prohibited Activities</h2>
          <p>You may not use KryptoKe for money laundering, market manipulation, fraudulent activity, or any activity that violates applicable law. Accounts engaged in prohibited activities will be suspended immediately.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">7. Limitation of Liability</h2>
          <p>KryptoKe is not liable for losses arising from market volatility, system downtime, or factors beyond our reasonable control. Our maximum liability is limited to fees paid in the preceding 30 days.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">8. Governing Law</h2>
          <p>These terms are governed by the laws of Kenya. Disputes shall be resolved through binding arbitration in Nairobi.</p>
        </section>

        <p className="text-xs text-text-muted pt-2">Contact: legal@kryptoke.com</p>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shared/TopBar";

const FAQS = [
  { category: "Getting Started", items: [
    { q: "What is KryptoKe?", a: "KryptoKe is a Kenyan cryptocurrency exchange. Deposit KES via M-Pesa, trade 200+ coins, earn interest, and withdraw back to M-Pesa." },
    { q: "How do I create an account?", a: "Tap 'Create Account', enter your email and Kenyan phone number, verify your email, set your Asset PIN." },
    { q: "Is KryptoKe safe?", a: "Yes. We use bcrypt password hashing, JWT authentication, TLS encryption, rate limiting, and a separate Asset PIN for every withdrawal." },
    { q: "Do I need KYC?", a: "Basic trading works without KYC. For withdrawals above KSh 50,000/day, identity verification is required." },
  ]},
  { category: "Deposits & M-Pesa", items: [
    { q: "How do I deposit KES?", a: "Tap Deposit → M-Pesa, enter your amount, confirm on your phone. Funds appear within 30 seconds." },
    { q: "What's the minimum deposit?", a: "KSh 10. There are no deposit fees — you receive the full amount in USDT at the current rate." },
    { q: "What's the KES/USD rate?", a: "We use the live interbank rate from Frankfurter.app, updated every 5 minutes." },
  ]},
  { category: "Trading", items: [
    { q: "What pairs can I trade?", a: "200+ USDT pairs covering all major and mid-cap tokens. Spot trading (market + limit orders) and Futures up to 125×." },
    { q: "What are the trading fees?", a: "Spot: 0.1% maker/taker. Futures: $0.05 flat fee + 0.04% spread per trade." },
    { q: "What is Convert?", a: "Instant swap between any two supported assets at the current market price. No order book." },
  ]},
  { category: "Withdrawals", items: [
    { q: "How do I withdraw to M-Pesa?", a: "Tap Withdraw → M-Pesa, enter amount and phone number, confirm with your Asset PIN. Arrives within 2 minutes." },
    { q: "Can I withdraw crypto on-chain?", a: "Yes. Tap Withdraw → Crypto, select chain, enter address. Supports 15+ blockchains." },
    { q: "What's the daily withdrawal limit?", a: "KSh 150,000 per day without KYC. After verification limits are raised." },
  ]},
  { category: "Earn", items: [
    { q: "How does Earn work?", a: "Subscribe USDT or BTC to Simple Earn or Flash Earn products. Interest accrues daily and is shown in real-time on your Earn page." },
    { q: "Can I redeem early?", a: "Simple Earn: redeem anytime. Flash Earn: locked for the product duration (typically 7 days)." },
  ]},
];

export default function FaqPage() {
  const router = useRouter();
  return (
    <div className="screen">
      <TopBar title="FAQ" showBack onBack={() => router.back()} />
      <div className="px-4 pt-2 pb-8 space-y-6">
        {FAQS.map((section) => (
          <div key={section.category}>
            <p className="font-syne font-bold text-sm text-text-primary mb-2 px-0.5">{section.category}</p>
            <div className="divide-y divide-border/50 rounded-xl border border-border overflow-hidden">
              {section.items.map((item) => (
                <details key={item.q} className="group bg-bg-surface">
                  <summary className="flex items-center justify-between px-4 py-3.5 cursor-pointer list-none select-none active:bg-bg-surface2">
                    <span className="font-outfit text-sm text-text-primary pr-3">{item.q}</span>
                    <span className="text-text-muted group-open:rotate-180 transition-transform flex-shrink-0 text-xs">▼</span>
                  </summary>
                  <div className="px-4 pb-3.5 pt-0">
                    <p className="font-outfit text-sm text-text-secondary leading-relaxed">{item.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
        <div className="text-center pt-2">
          <p className="font-outfit text-sm text-text-muted mb-2">Still have questions?</p>
          <a href="mailto:support@kryptoke.com" className="font-outfit text-sm text-primary font-semibold">
            support@kryptoke.com
          </a>
        </div>
      </div>
    </div>
  );
}

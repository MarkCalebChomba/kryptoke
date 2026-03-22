import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About KryptoKe",
  description: "KryptoKe — Kenya's cryptocurrency exchange built for M-Pesa.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="mb-8">
          <Link href="/" className="font-outfit text-sm text-primary font-semibold mb-6 inline-block">
            ← Back to KryptoKe
          </Link>
        </div>

        {/* Hero */}
        <div className="mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg, #00E5B4 0%, #F0B429 100%)" }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="12" stroke="#080C14" strokeWidth="2"/>
              <path d="M16 9v14M12 12.5s.7-2 4-2 4 2 4 3.5c0 3.5-4 3.5-4 3.5s4 0 4 3.5-2 4-4 4-4-.7-4-2.5"
                stroke="#080C14" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="font-syne font-bold text-3xl text-text-primary mb-3">About KryptoKe</h1>
          <p className="font-outfit text-base text-text-secondary leading-relaxed">
            KryptoKe is Kenya's cryptocurrency exchange — built from the ground up for Kenyans,
            by Kenyans. Our mission is simple: make it as easy to buy and sell crypto as sending
            money via M-Pesa.
          </p>
        </div>

        {/* What makes us different */}
        <div className="mb-10">
          <h2 className="font-syne font-bold text-xl text-text-primary mb-4">What makes us different</h2>
          <div className="space-y-4">
            {[
              {
                icon: "🟢",
                title: "Any crypto → KES via M-Pesa, instantly",
                body: "Sell Bitcoin, Ethereum, USDT, Solana, or any of our 86 supported coins and receive KES directly to your M-Pesa. No bank account needed, no waiting days for settlement.",
              },
              {
                icon: "🇰🇪",
                title: "Built for Kenya",
                body: "Prices in KES, M-Pesa as a first-class payment method, 24/7 support in English and Swahili, and compliance with Kenyan financial regulations.",
              },
              {
                icon: "🔒",
                title: "Security first",
                body: "All funds protected by a 6-digit Asset PIN, bcrypt hashed passwords, TLS encryption, rate limiting, and a multi-signature HD wallet architecture. Large withdrawals require manual review.",
              },
              {
                icon: "📊",
                title: "Real markets",
                body: "Live prices from Binance and OKX. 400+ trading pairs. Professional-grade order book, candlestick charts, and limit orders.",
              },
              {
                icon: "⚡",
                title: "Low fees",
                body: "1% on M-Pesa withdrawals. No deposit fees. Trading spreads are kept competitive. Network fees on crypto withdrawals are shown transparently before you confirm.",
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="flex gap-4 p-4 rounded-2xl bg-bg-surface2 border border-border">
                <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>
                <div>
                  <p className="font-outfit font-semibold text-sm text-text-primary mb-1">{title}</p>
                  <p className="font-outfit text-sm text-text-muted leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="mb-10 grid grid-cols-3 gap-3">
          {[
            { value: "86+", label: "Supported coins" },
            { value: "20", label: "Networks" },
            { value: "KSh 150K", label: "Daily limit" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center p-4 rounded-2xl bg-bg-surface2 border border-border">
              <p className="font-syne font-bold text-xl text-primary">{value}</p>
              <p className="font-outfit text-xs text-text-muted mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Compliance */}
        <div className="mb-10 p-5 rounded-2xl border border-border bg-bg-surface2">
          <h2 className="font-syne font-bold text-base text-text-primary mb-2">Compliance & Trust</h2>
          <p className="font-outfit text-sm text-text-secondary leading-relaxed">
            KryptoKe operates under Kenya's financial regulations including the Proceeds of Crime and
            Anti-Money Laundering Act (POCAMLA) and guidelines from the Financial Reporting Centre (FRC).
            We implement Know Your Customer (KYC) procedures and report suspicious transactions as
            required by law. We are registered under the Companies Act (Cap. 486) and registered with
            the Office of the Data Protection Commissioner (ODPC) under the Kenya Data Protection Act, 2019.
          </p>
        </div>

        {/* Contact */}
        <div className="mb-8">
          <h2 className="font-syne font-bold text-xl text-text-primary mb-4">Contact us</h2>
          <div className="space-y-2 font-outfit text-sm">
            {[
              { label: "General support", email: "support@kryptoke.com" },
              { label: "Security issues", email: "security@kryptoke.com" },
              { label: "Legal & compliance", email: "legal@kryptoke.com" },
              { label: "Data protection officer", email: "dpo@kryptoke.com" },
            ].map(({ label, email }) => (
              <div key={email} className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-text-muted">{label}</span>
                <a href={`mailto:${email}`} className="text-primary font-medium">{email}</a>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm font-outfit border-t border-border pt-6">
          <Link href="/terms" className="text-primary font-medium">Terms of Use</Link>
          <Link href="/privacy" className="text-primary font-medium">Privacy Policy</Link>
          <Link href="/faq" className="text-primary font-medium">FAQ</Link>
          <Link href="/" className="text-text-muted">← Back to App</Link>
        </div>
      </div>
    </div>
  );
}

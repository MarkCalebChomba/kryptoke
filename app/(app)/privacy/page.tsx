"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shared/TopBar";

export default function PrivacyPage() {
  const router = useRouter();
  return (
    <div className="screen">
      <TopBar title="Privacy Policy" showBack onBack={() => router.back()} />
      <div className="px-4 pt-2 pb-8 space-y-6 font-outfit text-sm text-text-secondary leading-relaxed">
        <p className="text-text-muted text-xs">Last updated: 1 March 2025</p>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">Information We Collect</h2>
          <p>We collect your email address, phone number, and identity documents (for KYC). We also collect transaction data, device information, and usage logs to provide and improve our service.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">How We Use Your Data</h2>
          <p>Your data is used to: operate your account, process transactions, comply with anti-money laundering regulations, send security alerts, and improve our platform. We do not sell your personal data to third parties.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">Data Storage & Security</h2>
          <p>Data is stored on encrypted servers in the EU (Supabase, Ireland region). Passwords are hashed with bcrypt. API communications are secured with TLS 1.3. We conduct regular security audits.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">M-Pesa Data</h2>
          <p>M-Pesa transaction data is processed via Safaricom Daraja API. We store transaction references and amounts. We do not store your M-Pesa PIN.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">Your Rights</h2>
          <p>Under Kenyan data protection law, you have the right to access, correct, or delete your personal data. Submit requests to privacy@kryptoke.com. We respond within 30 days.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">Cookies</h2>
          <p>We use session cookies for authentication only. We do not use tracking cookies or analytics cookies. No third-party advertising trackers.</p>
        </section>

        <section>
          <h2 className="font-syne font-bold text-sm text-text-primary mb-2">Contact</h2>
          <p>Data Protection Officer: dpo@kryptoke.com<br />Privacy queries: privacy@kryptoke.com</p>
        </section>
      </div>
    </div>
  );
}

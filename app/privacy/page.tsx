import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — KryptoKe",
  description: "How KryptoKe collects, uses, stores, and protects your personal data.",
};

const LAST_UPDATED = "1 March 2025";
const CONTACT_EMAIL = "privacy@kryptoke.com";
const DPO_EMAIL = "dpo@kryptoke.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-syne font-bold text-lg text-text-primary mb-3">{title}</h2>
      <div className="space-y-3 font-outfit text-sm text-text-secondary leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-syne font-semibold text-base text-text-primary mb-1.5">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-5 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="font-outfit text-sm text-primary font-semibold mb-6 inline-block">
            ← Back to KryptoKe
          </Link>
          <h1 className="font-syne font-bold text-3xl text-text-primary mb-2">Privacy Policy</h1>
          <p className="font-outfit text-sm text-text-muted">
            Last updated: {LAST_UPDATED} &nbsp;·&nbsp; Effective immediately upon acceptance
          </p>
        </div>

        {/* Intro */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl px-5 py-4 mb-8">
          <p className="font-outfit text-sm text-text-secondary leading-relaxed">
            KryptoKe Limited ("<strong className="text-text-primary">KryptoKe</strong>", "we", "our", "us") is a
            cryptocurrency exchange platform registered and operating in Kenya under the Companies Act (Cap. 486).
            We are committed to protecting your privacy and handling your personal data responsibly in accordance
            with the <strong className="text-text-primary">Kenya Data Protection Act, 2019</strong> and applicable
            guidelines issued by the Office of the Data Protection Commissioner (ODPC).
          </p>
          <p className="font-outfit text-sm text-text-secondary leading-relaxed mt-3">
            By registering for or using KryptoKe, you acknowledge that you have read and understood this Privacy
            Policy and consent to the processing of your personal data as described herein.
          </p>
        </div>

        <Section title="1. Who We Are and How to Contact Us">
          <p>
            <strong className="text-text-primary">Data Controller:</strong> KryptoKe Limited, Nairobi, Kenya.
          </p>
          <p>
            <strong className="text-text-primary">Data Protection Officer:</strong>{" "}
            <a href={`mailto:${DPO_EMAIL}`} className="text-primary">{DPO_EMAIL}</a>
          </p>
          <p>
            <strong className="text-text-primary">General Privacy Enquiries:</strong>{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary">{CONTACT_EMAIL}</a>
          </p>
          <p>
            For any complaints regarding how we handle your data, you may also contact the Office of the Data
            Protection Commissioner (ODPC) at{" "}
            <a href="https://www.odpc.go.ke" className="text-primary" target="_blank" rel="noopener noreferrer">
              www.odpc.go.ke
            </a>.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <Sub title="2.1 Information you provide directly">
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li>Full name and date of birth (for account registration and KYC)</li>
              <li>Email address and Kenyan mobile phone number</li>
              <li>National ID / Passport number and photograph (for identity verification)</li>
              <li>Selfie / liveness check images (for KYC facial verification)</li>
              <li>Residential address and proof of address documents</li>
              <li>Crypto wallet addresses you provide for withdrawals</li>
              <li>Customer support messages and feedback you send us</li>
            </ul>
          </Sub>
          <Sub title="2.2 Information collected automatically">
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li>IP address and approximate geolocation (city/country level only)</li>
              <li>Device type, operating system, browser, and app version</li>
              <li>Login timestamps and session activity logs</li>
              <li>Transaction history, deposit/withdrawal records, and trading activity</li>
              <li>M-Pesa phone numbers associated with deposits and withdrawals</li>
              <li>Failed login attempts and security event logs</li>
            </ul>
          </Sub>
          <Sub title="2.3 Information from third parties">
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li>Identity verification results from our KYC provider (where applicable)</li>
              <li>Safaricom M-Pesa transaction confirmations and reference numbers</li>
              <li>Blockchain transaction data (publicly available on-chain information)</li>
              <li>Sanctions screening results from compliance databases</li>
            </ul>
          </Sub>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We process your personal data on the following legal bases:</p>
          <Sub title="3.1 Performance of contract">
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li>Creating and managing your KryptoKe account</li>
              <li>Processing deposits, withdrawals, and trades you initiate</li>
              <li>Sending transaction confirmations and account notifications</li>
              <li>Providing customer support</li>
            </ul>
          </Sub>
          <Sub title="3.2 Legal obligation">
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li>Verifying your identity under Kenya's anti-money laundering (AML) regulations</li>
              <li>Screening against sanctions lists and politically exposed persons (PEP) databases</li>
              <li>Reporting suspicious transactions to the Financial Reporting Centre (FRC) as required by the Proceeds of Crime and Anti-Money Laundering Act (POCAMLA)</li>
              <li>Retaining transaction records as required by law (minimum 5 years)</li>
              <li>Responding to court orders, regulatory requests, or law enforcement inquiries</li>
            </ul>
          </Sub>
          <Sub title="3.3 Legitimate interests">
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li>Detecting and preventing fraud, account takeover, and money laundering</li>
              <li>Security monitoring, anomaly detection, and platform abuse prevention</li>
              <li>Improving our platform, fixing bugs, and analysing usage patterns (using aggregated, non-identifiable data)</li>
              <li>Risk assessment and creditworthiness evaluation for higher withdrawal limits</li>
            </ul>
          </Sub>
          <Sub title="3.4 Consent (where required)">
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li>Sending marketing communications (you may opt out at any time)</li>
              <li>Push notifications (you may disable these in device settings)</li>
            </ul>
          </Sub>
        </Section>

        <Section title="4. Data Sharing and Disclosure">
          <p>
            We do not sell your personal data to third parties. We share your data only in the following
            limited circumstances:
          </p>
          <Sub title="4.1 Service providers (data processors)">
            <p>We share data with carefully vetted providers who process it solely on our behalf:</p>
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li><strong className="text-text-secondary">Supabase</strong> — database hosting (EU/US data centres, under standard contractual clauses)</li>
              <li><strong className="text-text-secondary">Safaricom M-Pesa</strong> — payment processing (Kenya)</li>
              <li><strong className="text-text-secondary">KYC providers</strong> — identity verification (subject to their own privacy policies)</li>
              <li><strong className="text-text-secondary">Resend / email providers</strong> — transactional email delivery</li>
              <li><strong className="text-text-secondary">Upstash (Redis)</strong> — session and rate-limit caching</li>
              <li><strong className="text-text-secondary">Sentry</strong> — error monitoring (anonymised stack traces only)</li>
            </ul>
          </Sub>
          <Sub title="4.2 Legal and regulatory disclosures">
            <p>
              We may disclose your data to law enforcement, regulators (including the Central Bank of Kenya,
              Financial Reporting Centre, and ODPC), or courts when required by law, regulation, or a binding
              legal process.
            </p>
          </Sub>
          <Sub title="4.3 Business transfers">
            <p>
              In the event of a merger, acquisition, or sale of all or part of our assets, your data may
              be transferred to the acquiring entity. We will notify you before your data is subject to a
              different privacy policy.
            </p>
          </Sub>
        </Section>

        <Section title="5. Data Security">
          <p>
            We implement industry-standard technical and organisational measures to protect your personal data:
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-muted">
            <li>All data transmitted between your device and our servers is encrypted using TLS 1.2+</li>
            <li>Passwords are hashed using bcrypt with a cost factor of 12; we never store plaintext passwords</li>
            <li>Asset PINs are separately hashed and never stored or transmitted in plaintext</li>
            <li>Cryptographic wallet private keys are derived from a hardware-secured master seed and never exposed in logs or responses</li>
            <li>Database access is restricted to application service accounts via row-level security (RLS)</li>
            <li>Failed login and PIN attempts are rate-limited; accounts are temporarily locked after repeated failures</li>
            <li>All API responses include strict security headers (HSTS, CSP, X-Frame-Options, etc.)</li>
            <li>Staff access to production data is logged, audited, and restricted on a need-to-know basis</li>
            <li>We maintain an incident response plan and will notify affected users within 72 hours of a confirmed breach affecting their personal data</li>
          </ul>
          <p>
            Despite these measures, no system is 100% secure. We encourage you to use a strong, unique
            password and enable two-factor authentication to further protect your account.
          </p>
        </Section>

        <Section title="6. Data Retention">
          <p>We retain your personal data for the following periods:</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-syne text-text-primary font-semibold">Data Type</th>
                  <th className="text-left py-2 pr-4 font-syne text-text-primary font-semibold">Retention Period</th>
                  <th className="text-left py-2 font-syne text-text-primary font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="text-text-muted">
                {[
                  ["Account information", "5 years after account closure", "AML / POCAMLA"],
                  ["Transaction records", "7 years", "Tax and regulatory requirements"],
                  ["KYC documents", "5 years after account closure", "AML / Know Your Customer"],
                  ["Login and security logs", "2 years", "Fraud investigation"],
                  ["Customer support records", "3 years", "Legal claims"],
                  ["Marketing consents", "Until opt-out + 1 year", "GDPR / DPA 2019"],
                ].map(([type, period, reason]) => (
                  <tr key={type} className="border-b border-border/50">
                    <td className="py-2 pr-4">{type}</td>
                    <td className="py-2 pr-4">{period}</td>
                    <td className="py-2">{reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            After the applicable retention period, data is securely deleted or anonymised.
          </p>
        </Section>

        <Section title="7. Your Rights Under the Kenya Data Protection Act, 2019">
          <p>As a data subject, you have the following rights:</p>
          <ul className="list-disc list-inside space-y-2 text-text-muted">
            <li><strong className="text-text-secondary">Right of access</strong> — request a copy of the personal data we hold about you</li>
            <li><strong className="text-text-secondary">Right to rectification</strong> — request correction of inaccurate or incomplete data</li>
            <li><strong className="text-text-secondary">Right to erasure</strong> — request deletion of your data (subject to legal retention obligations)</li>
            <li><strong className="text-text-secondary">Right to restriction</strong> — request that we limit processing of your data</li>
            <li><strong className="text-text-secondary">Right to portability</strong> — receive your data in a structured, machine-readable format</li>
            <li><strong className="text-text-secondary">Right to object</strong> — object to processing based on legitimate interests or for direct marketing</li>
            <li><strong className="text-text-secondary">Right to withdraw consent</strong> — withdraw consent at any time (where processing is based on consent)</li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a href={`mailto:${DPO_EMAIL}`} className="text-primary">{DPO_EMAIL}</a>{" "}
            with "Data Subject Request" in the subject line. We will respond within 30 days. We may ask you
            to verify your identity before processing your request.
          </p>
        </Section>

        <Section title="8. Cookies and Tracking">
          <p>
            KryptoKe is a progressive web app. We do not use advertising or tracking cookies. We use
            only essential session cookies required for authentication and security (JWT tokens stored
            in <code className="bg-bg-surface2 px-1 rounded text-xs font-price">localStorage</code> and 
            secure HTTP-only session references where applicable).
          </p>
          <p>
            We do not use Google Analytics, Facebook Pixel, or any third-party advertising trackers.
            We do not share your behavioural data with advertisers.
          </p>
        </Section>

        <Section title="9. International Data Transfers">
          <p>
            Some of our service providers (e.g. Supabase, Upstash, Sentry) may process your data outside
            Kenya. Where this occurs, we ensure adequate safeguards are in place through:
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-muted">
            <li>Standard Contractual Clauses approved by the relevant data protection authorities</li>
            <li>Adequacy decisions where the receiving country provides equivalent protection</li>
            <li>Binding corporate rules or equivalent mechanisms</li>
          </ul>
        </Section>

        <Section title="10. Children's Privacy">
          <p>
            KryptoKe is not directed at persons under 18 years of age. We do not knowingly collect
            personal data from children. If you believe we have inadvertently collected data from a
            minor, please contact us immediately at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary">{CONTACT_EMAIL}</a>{" "}
            and we will promptly delete it.
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes
            via in-app notification and/or email at least 14 days before the changes take effect. Continued
            use of KryptoKe after the effective date constitutes acceptance of the updated policy.
          </p>
          <p>
            The version history of this policy is maintained and available on request.
          </p>
        </Section>

        {/* Footer nav */}
        <div className="border-t border-border pt-6 flex flex-wrap gap-4 text-sm font-outfit">
          <Link href="/terms" className="text-primary font-medium">Terms of Use</Link>
          <Link href="/" className="text-text-muted">← Back to App</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-text-muted">{CONTACT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}

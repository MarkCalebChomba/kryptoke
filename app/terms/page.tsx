import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use — KryptoKe",
  description: "Terms and conditions for using the KryptoKe cryptocurrency exchange platform.",
};

const LAST_UPDATED = "1 March 2025";
const CONTACT_EMAIL = "legal@kryptoke.com";

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h2 id={id} className="font-syne font-bold text-lg text-text-primary mb-3 mt-6">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-syne font-semibold text-sm text-text-primary mb-1.5 mt-4">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="font-outfit text-sm text-text-secondary leading-relaxed mb-3">{children}</p>;
}
function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 font-outfit text-sm text-text-muted mb-3">
      {items.map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: item }} />)}
    </ul>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="mb-8">
          <Link href="/" className="font-outfit text-sm text-primary font-semibold mb-6 inline-block">← Back to KryptoKe</Link>
          <h1 className="font-syne font-bold text-3xl text-text-primary mb-2">Terms of Use</h1>
          <p className="font-outfit text-sm text-text-muted">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="bg-gold/5 border border-gold/25 rounded-2xl px-5 py-4 mb-8">
          <P>
            By creating an account or using any feature of KryptoKe, you confirm that you have read, understood, and agree to be bound by these Terms and our{" "}
            <Link href="/privacy" className="text-primary font-semibold">Privacy Policy</Link>. If you do not agree, do not use KryptoKe.
          </P>
        </div>

        <H2>1. About KryptoKe</H2>
        <P>KryptoKe Limited ("<strong>KryptoKe</strong>") is a cryptocurrency exchange platform incorporated in Kenya. KryptoKe enables users to deposit KES via M-Pesa, trade crypto, and withdraw the value of assets back to M-Pesa or external wallets. KryptoKe is not a bank and funds held on the platform are not covered by the Kenya Deposit Insurance Corporation (KDIC).</P>

        <H2>2. Eligibility</H2>
        <P>You may use KryptoKe only if:</P>
        <Ul items={[
          "You are at least <strong>18 years of age</strong>",
          "You are a <strong>resident of Kenya</strong> with a valid Kenyan phone number",
          "You have legal capacity to enter into binding contracts under Kenyan law",
          "You are not subject to any sanctions, asset freezes, or prohibited-person lists",
          "Cryptocurrency trading is not prohibited under any law applicable to you",
          "You are acting on your own behalf, not as an undisclosed agent",
        ]} />

        <H2>3. Account Registration and Security</H2>
        <H3>3.1 Accurate information</H3>
        <P>You must provide accurate, current, and complete information. Providing false information is grounds for immediate suspension and may constitute a criminal offence.</P>
        <H3>3.2 KYC verification</H3>
        <P>Higher withdrawal limits require identity verification (KYC) including a government-issued ID and selfie. We are required by Kenyan law to verify user identities before allowing higher transaction volumes.</P>
        <H3>3.3 Account security</H3>
        <P>You are solely responsible for your login credentials, asset PIN, and OTP codes. You must notify us immediately at <a href="mailto:security@kryptoke.com" className="text-primary">security@kryptoke.com</a> if you suspect unauthorised access. KryptoKe will never ask for your password, PIN, or OTP by phone, SMS, or email.</P>
        <H3>3.4 One account per person</H3>
        <P>Each person may hold only one account. Creating multiple accounts will result in suspension of all associated accounts.</P>

        <H2>4. Deposits and Withdrawals</H2>
        <H3>4.1 M-Pesa deposits</H3>
        <P>Deposits are credited in USDT at the prevailing exchange rate, which includes a spread covering operational costs. This spread is always shown before you confirm.</P>
        <H3>4.2 Crypto deposits</H3>
        <P>Credited after required blockchain confirmations. Minimum deposit amounts per network are shown in the app. Underpayments are not credited.</P>
        <H3>4.3 M-Pesa withdrawals (Crypto → KES)</H3>
        <P>You may convert any supported cryptocurrency to KES and receive funds via M-Pesa. A <strong>1% fee</strong> applies. Maximum withdrawal is <strong>KSh 150,000/day</strong>. The KES conversion rate includes our withdrawal spread, displayed before confirmation.</P>
        <H3>4.4 On-chain crypto withdrawals</H3>
        <P>Subject to network fees, minimum amounts, and a 10-minute cancellation window. Withdrawals above USD 500 equivalent require manual review and may take up to 24 hours.</P>
        <H3>4.5 Irreversibility</H3>
        <P>Once broadcast to a blockchain, a crypto withdrawal cannot be reversed. You are solely responsible for the accuracy of recipient addresses.</P>
        <H3>4.6 Memo / Destination Tag</H3>
        <P>XRP, TON, and Stellar deposits require a correct memo/tag. Funds sent without the correct memo may be permanently lost. KryptoKe is not liable for such losses.</P>

        <H2>5. Fees</H2>
        <div className="overflow-x-auto mb-4">
          <table className="w-full border-collapse text-xs font-outfit">
            <thead>
              <tr className="border-b border-border">
                {["Service","Fee","Notes"].map(h => <th key={h} className="text-left py-2 pr-4 font-syne text-text-primary font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="text-text-muted">
              {[
                ["M-Pesa deposit","None","Exchange spread applies"],
                ["Crypto deposit","None","On-chain gas not charged by KryptoKe"],
                ["M-Pesa withdrawal","1% of amount","Max KSh 150,000/day"],
                ["Crypto withdrawal","Per network","Displayed before confirmation"],
                ["Spot trading","Included in spread","Buy/sell spread covers market making"],
                ["Account maintenance","None","No monthly or dormancy fees"],
              ].map(([s,f,n]) => (
                <tr key={s} className="border-b border-border/50">
                  <td className="py-2 pr-4 text-text-secondary font-medium">{s}</td>
                  <td className="py-2 pr-4">{f}</td>
                  <td className="py-2">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>We will provide at least 14 days&apos; notice before changing fee structures.</P>

        <H2>6. Risk Disclosure</H2>
        <div className="bg-down/5 border border-down/20 rounded-xl px-4 py-3 mb-4">
          <Ul items={[
            "Cryptocurrency markets are highly volatile — prices can fall to zero",
            "Past performance is not indicative of future results",
            "Only invest funds you can afford to lose entirely",
            "Blockchain transactions are irreversible — wrong address = permanent loss",
            "Regulatory changes may affect asset value or legality",
            "KryptoKe does not provide investment, financial, tax, or legal advice",
          ]} />
        </div>

        <H2>7. Prohibited Activities</H2>
        <Ul items={[
          "Money laundering, terrorism financing, or sanctions evasion",
          "Fraud, identity theft, or impersonation of any person",
          "Market manipulation (wash trading, spoofing, pump-and-dump)",
          "Depositing or trading proceeds of crime",
          "Any activity violating Kenyan law or applicable law in your jurisdiction",
          "Automated trading without our prior written consent",
          "Attempting to reverse-engineer or circumvent our security systems",
          "Creating accounts on behalf of others without their knowledge",
        ]} />
        <P>Violations may result in account suspension, asset freeze, and reporting to law enforcement or the Financial Reporting Centre.</P>

        <H2>8. AML and Compliance</H2>
        <P>KryptoKe operates under Kenya&apos;s anti-money laundering framework including POCAMLA and FRC regulations. We verify user identities, monitor transactions, file Suspicious Transaction Reports (STRs), and cooperate with law enforcement as required. We may freeze your account without prior notice if required by law, court order, or our compliance obligations.</P>

        <H2>9. Platform Availability</H2>
        <P>We aim for continuous availability but do not guarantee uninterrupted service. Downtime may occur due to maintenance, security incidents, force majeure events, or third-party outages (M-Pesa, blockchain networks). We are not liable for losses from unavailability if we have taken reasonable steps to restore service.</P>

        <H2>10. Intellectual Property</H2>
        <P>All content, trademarks, logos, and software on KryptoKe are owned by or licensed to KryptoKe Limited. You may not reproduce or distribute our content without prior written consent.</P>

        <H2>11. Limitation of Liability</H2>
        <P>To the maximum extent permitted by Kenyan law, KryptoKe shall not be liable for: loss of profits or data; indirect or consequential damages; losses from market fluctuations; losses from incorrect withdrawal addresses; losses from your failure to maintain account security; or blockchain network failures.</P>
        <P>Our total aggregate liability for any claim shall not exceed fees paid by you to KryptoKe in the 3 months preceding the claim.</P>

        <H2>12. Governing Law and Dispute Resolution</H2>
        <P>These Terms are governed by the laws of Kenya. Complaints should first be directed to <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary">{CONTACT_EMAIL}</a>. We will acknowledge within 2 business days and aim to resolve within 14 business days. Unresolved disputes shall be submitted to the exclusive jurisdiction of the courts of Nairobi, Kenya.</P>

        <H2>13. Changes to These Terms</H2>
        <P>We may update these Terms with at least <strong>14 days&apos; notice</strong> of material changes. Continued use after the effective date constitutes acceptance. If you do not accept updated Terms, you may close your account and withdraw your funds.</P>

        <H2>14. Contact</H2>
        <Ul items={[
          `Legal: <a href="mailto:${CONTACT_EMAIL}" class="text-primary">${CONTACT_EMAIL}</a>`,
          `Security: <a href="mailto:security@kryptoke.com" class="text-primary">security@kryptoke.com</a>`,
          `Support: <a href="mailto:support@kryptoke.com" class="text-primary">support@kryptoke.com</a>`,
        ]} />

        <div className="border-t border-border pt-6 flex flex-wrap gap-4 text-sm font-outfit">
          <Link href="/privacy" className="text-primary font-medium">Privacy Policy</Link>
          <Link href="/" className="text-text-muted">← Back to App</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-text-muted">{CONTACT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}

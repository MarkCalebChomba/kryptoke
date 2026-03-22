import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ — KryptoKe",
  description: "Frequently asked questions about KryptoKe, deposits, withdrawals, and trading.",
};

const FAQS = [
  {
    category: "Getting Started",
    items: [
      {
        q: "What is KryptoKe?",
        a: "KryptoKe is a Kenyan cryptocurrency exchange that lets you buy, sell, and trade crypto using M-Pesa. Deposit KES via M-Pesa, trade over 80 coins, and withdraw back to your M-Pesa instantly.",
      },
      {
        q: "How do I create an account?",
        a: "Download the KryptoKe app, tap 'Create Account', enter your email and Kenyan phone number, verify your email with the code we send, and set your Asset PIN. You can start depositing immediately.",
      },
      {
        q: "Is KryptoKe safe?",
        a: "Yes. We use industry-standard security: bcrypt password hashing, JWT authentication, TLS encryption on all connections, rate limiting on all endpoints, and a separate Asset PIN required for every withdrawal. Your crypto private keys are stored in an HD wallet derived from a hardware-secured master seed.",
      },
      {
        q: "Do I need KYC to use KryptoKe?",
        a: "Basic trading is available without KYC. To withdraw more than KSh 50,000/day or access advanced features, identity verification is required. KYC involves uploading a government-issued ID and a selfie.",
      },
    ],
  },
  {
    category: "Deposits",
    items: [
      {
        q: "How do I deposit via M-Pesa?",
        a: "Tap 'Deposit' on the home screen, select M-Pesa, enter the amount (minimum KSh 10), and tap 'Send M-Pesa Push'. You'll receive a payment prompt on your phone. Enter your M-Pesa PIN and your USDT balance will be credited instantly.",
      },
      {
        q: "What is the minimum M-Pesa deposit?",
        a: "KSh 10. There is no maximum for deposits.",
      },
      {
        q: "How do I deposit crypto from another wallet or exchange?",
        a: "Tap 'Deposit', select 'Crypto Deposit', choose your coin (e.g. BTC, USDT), then choose the network. You'll see your deposit address. Send crypto to that address from your external wallet. Most deposits arrive within 5–30 minutes depending on the network.",
      },
      {
        q: "Why hasn't my crypto deposit arrived?",
        a: "Crypto deposits require a number of blockchain confirmations before they are credited: Bitcoin requires 3 confirmations (~30 min), Ethereum/ERC-20 requires 12 (~3 min), TRON/TRC-20 requires 20 (~1 min), Solana requires 32 (~15 sec). If your deposit hasn't appeared after the expected time, contact support with your transaction hash.",
      },
      {
        q: "I sent XRP/TON/Stellar but forgot the memo. What happens?",
        a: "Deposits to shared-address chains (XRP, TON, Stellar) require a correct memo/destination tag to identify your account. If you sent without a memo, contact support@kryptoke.com immediately with your transaction hash and sending address. We will attempt to locate and credit the funds, but this is not guaranteed and may take up to 7 business days.",
      },
    ],
  },
  {
    category: "Withdrawals to M-Pesa",
    items: [
      {
        q: "How do I withdraw crypto to M-Pesa?",
        a: "This is our core feature. Tap 'Withdraw', select 'Withdraw via M-Pesa', choose the coin you want to sell (BTC, ETH, USDT, SOL, and 82 more), enter the KES amount you want to receive, confirm the details, and enter your Asset PIN. Funds arrive in your M-Pesa in seconds.",
      },
      {
        q: "What coins can I convert to KES via M-Pesa?",
        a: "All 86 supported coins, including Bitcoin, Ethereum, BNB, Solana, XRP, USDT, TRON, Dogecoin, Litecoin, and many more. If you hold a coin on KryptoKe, you can sell it for KES via M-Pesa.",
      },
      {
        q: "What is the maximum M-Pesa withdrawal?",
        a: "KSh 150,000 per day. This limit resets at midnight. Higher limits are available after completing KYC verification.",
      },
      {
        q: "What fee does KryptoKe charge for M-Pesa withdrawals?",
        a: "1% of the withdrawal amount. For example, withdrawing KSh 10,000 costs KSh 100, and you receive KSh 9,900.",
      },
      {
        q: "Why is the KES amount slightly different from what I expected?",
        a: "The conversion rate from crypto to KES includes a small spread that covers our operational costs. This spread is applied transparently — the exact KES amount you will receive is always shown before you confirm the withdrawal.",
      },
    ],
  },
  {
    category: "On-Chain Crypto Withdrawals",
    items: [
      {
        q: "How do I send crypto to an external wallet?",
        a: "Tap 'Withdraw', select 'Send to Wallet', choose your coin and network, enter the destination address and amount, then confirm with your Asset PIN. Withdrawals enter a 10-minute queue — you can cancel during this window.",
      },
      {
        q: "Can I cancel a crypto withdrawal?",
        a: "Yes, within 10 minutes of submitting. Open the Withdrawal History and tap 'Cancel'. After 10 minutes, the withdrawal is broadcast to the blockchain and cannot be reversed.",
      },
      {
        q: "Why is my withdrawal taking so long?",
        a: "Withdrawals above USD 500 equivalent require manual review for security and may take up to 24 hours. Standard withdrawals are broadcast within 10 minutes and confirmed on-chain within the network's normal time.",
      },
      {
        q: "I sent to the wrong address. Can I get a refund?",
        a: "No. Blockchain transactions are irreversible once broadcast. Always double-check the address before confirming. KryptoKe cannot recover funds sent to incorrect addresses.",
      },
    ],
  },
  {
    category: "Trading",
    items: [
      {
        q: "What order types does KryptoKe support?",
        a: "Limit orders (specify the exact price) and Market orders (execute immediately at the best available price). Stop-limit and OCO orders are coming soon.",
      },
      {
        q: "What is the trading spread?",
        a: "KryptoKe uses an internal spread-based model. The buy price is slightly above and the sell price slightly below the market price. The exact prices are always shown before you confirm a trade.",
      },
      {
        q: "Where do my trading funds come from?",
        a: "You trade from your Funding account. Transfer funds between your Funding, Trading, and Earn accounts from the Assets page.",
      },
    ],
  },
  {
    category: "Security",
    items: [
      {
        q: "What is an Asset PIN?",
        a: "A 6-digit PIN required for all withdrawals and trades. It is separate from your login password and adds an extra layer of protection. Even if someone gains access to your account, they cannot withdraw funds without your Asset PIN. Set it in Settings → Security.",
      },
      {
        q: "What should I do if I think my account was compromised?",
        a: "Immediately contact security@kryptoke.com and change your password. We will freeze your account within minutes of receiving your report. We recommend also setting a new Asset PIN after regaining access.",
      },
      {
        q: "Does KryptoKe support two-factor authentication (2FA)?",
        a: "Authenticator app 2FA (Google Authenticator, Authy) is coming soon. Currently, we use OTP codes sent to your verified email address for sensitive actions.",
      },
    ],
  },
  {
    category: "Account",
    items: [
      {
        q: "How do I change my phone number?",
        a: "Go to Settings → Security → Phone. You'll need to verify both your old and new phone numbers via OTP.",
      },
      {
        q: "How do I close my account?",
        a: "Email legal@kryptoke.com from your registered email address. Before we can close your account, you must withdraw all funds. We are required by law to retain transaction records for 5 years after account closure.",
      },
      {
        q: "Can I have multiple KryptoKe accounts?",
        a: "No. Each person is allowed one account only. Creating multiple accounts violates our Terms of Use and will result in all accounts being suspended.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="mb-8">
          <Link href="/" className="font-outfit text-sm text-primary font-semibold mb-6 inline-block">
            ← Back to KryptoKe
          </Link>
          <h1 className="font-syne font-bold text-3xl text-text-primary mb-2">
            Frequently Asked Questions
          </h1>
          <p className="font-outfit text-sm text-text-muted">
            Can't find what you need?{" "}
            <a href="mailto:support@kryptoke.com" className="text-primary">
              support@kryptoke.com
            </a>
          </p>
        </div>

        <div className="space-y-10">
          {FAQS.map((section) => (
            <div key={section.category}>
              <h2 className="font-syne font-bold text-lg text-text-primary mb-4 pb-2 border-b border-border">
                {section.category}
              </h2>
              <div className="space-y-0">
                {section.items.map((item, i) => (
                  <details
                    key={i}
                    className="border-b border-border/50 group"
                  >
                    <summary className="flex items-center justify-between py-4 cursor-pointer list-none select-none">
                      <span className="font-outfit font-semibold text-sm text-text-primary pr-4">
                        {item.q}
                      </span>
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        className="flex-shrink-0 text-text-muted transition-transform group-open:rotate-180"
                      >
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </summary>
                    <p className="font-outfit text-sm text-text-secondary leading-relaxed pb-4 pr-6">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 p-5 rounded-2xl bg-primary/5 border border-primary/20 text-center">
          <p className="font-outfit text-sm text-text-secondary mb-3">
            Still have questions? Our support team is here to help.
          </p>
          <a
            href="mailto:support@kryptoke.com"
            className="font-outfit text-sm text-primary font-semibold"
          >
            support@kryptoke.com
          </a>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-sm font-outfit border-t border-border pt-6">
          <Link href="/terms" className="text-primary font-medium">Terms of Use</Link>
          <Link href="/privacy" className="text-primary font-medium">Privacy Policy</Link>
          <Link href="/about" className="text-text-muted">About KryptoKe</Link>
          <Link href="/" className="text-text-muted">← Back to App</Link>
        </div>
      </div>
    </div>
  );
}

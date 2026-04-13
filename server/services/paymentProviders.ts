/**
 * Payment Provider Registry — NEXUS N-A
 *
 * A static registry of fiat payment methods available per country.
 * Used by:
 *   - GET /api/v1/config/payment-methods?country=XX  (public, no auth)
 *   - deposit/page.tsx to show available payment methods to the user
 *   - withdraw route to validate the requested provider
 *
 * To activate a provider: set active: true and ensure the backend
 * integration is complete (M-Pesa is the only fully active one at launch).
 *
 * Adding a new provider:
 *   1. Add it to PAYMENT_PROVIDERS below
 *   2. Implement its initiate/callback logic in server/services/
 *   3. Set active: true
 *   4. Wire into deposit & withdrawal routes
 */

export type ProviderType = "mobile_money" | "bank_transfer" | "card";

export interface PaymentProvider {
  id: string;
  name: string;
  type: ProviderType;
  /** ISO 3166-1 alpha-2 country codes. '*' means globally available. */
  countries: string[];
  /** ISO 4217 currency codes this provider transacts in. */
  currencies: string[];
  minAmount: number;
  maxAmount: number;
  /** Fee charged to user as a percentage of transaction (0.01 = 1%). */
  feePercent: number;
  /** Flat fee in the provider's currency. */
  flatFee: number;
  /** Estimated processing time shown to users. */
  processingTime: string;
  /** Whether this provider is accepting new transactions right now. */
  active: boolean;
  /** Optional icon URL for the UI. */
  logoUrl?: string;
}

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  // ── Kenya ──────────────────────────────────────────────────────────────────
  {
    id: "mpesa",
    name: "M-Pesa",
    type: "mobile_money",
    countries: ["KE"],
    currencies: ["KES"],
    minAmount: 10,
    maxAmount: 300_000,
    feePercent: 0,
    flatFee: 0,
    processingTime: "Instant",
    active: true,
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/M-PESA_LOGO-01.svg/320px-M-PESA_LOGO-01.svg.png",
  },
  {
    id: "airtel_ke",
    name: "Airtel Money",
    type: "mobile_money",
    countries: ["KE"],
    currencies: ["KES"],
    minAmount: 10,
    maxAmount: 100_000,
    feePercent: 0,
    flatFee: 0,
    processingTime: "Instant",
    active: false,
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Airtel_logo.svg/320px-Airtel_logo.svg.png",
  },

  // ── Ghana ──────────────────────────────────────────────────────────────────
  {
    id: "mtn_gh",
    name: "MTN MoMo",
    type: "mobile_money",
    countries: ["GH"],
    currencies: ["GHS"],
    minAmount: 1,
    maxAmount: 5_000,
    feePercent: 0,
    flatFee: 0,
    processingTime: "Instant",
    active: false,
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/New-mtn-logo.jpg/320px-New-mtn-logo.jpg",
  },
  {
    id: "vodafone_gh",
    name: "Vodafone Cash",
    type: "mobile_money",
    countries: ["GH"],
    currencies: ["GHS"],
    minAmount: 1,
    maxAmount: 5_000,
    feePercent: 0,
    flatFee: 0,
    processingTime: "Instant",
    active: false,
  },

  // ── Nigeria ────────────────────────────────────────────────────────────────
  {
    id: "bank_ng",
    name: "Bank Transfer (NGN)",
    type: "bank_transfer",
    countries: ["NG"],
    currencies: ["NGN"],
    minAmount: 500,
    maxAmount: 5_000_000,
    feePercent: 0.015,
    flatFee: 100,
    processingTime: "1–5 minutes",
    active: false,
  },

  // ── Uganda ─────────────────────────────────────────────────────────────────
  {
    id: "mtn_ug",
    name: "MTN MoMo Uganda",
    type: "mobile_money",
    countries: ["UG"],
    currencies: ["UGX"],
    minAmount: 500,
    maxAmount: 5_000_000,
    feePercent: 0,
    flatFee: 0,
    processingTime: "Instant",
    active: false,
  },

  // ── Tanzania ───────────────────────────────────────────────────────────────
  {
    id: "mpesa_tz",
    name: "M-Pesa Tanzania",
    type: "mobile_money",
    countries: ["TZ"],
    currencies: ["TZS"],
    minAmount: 500,
    maxAmount: 3_000_000,
    feePercent: 0,
    flatFee: 0,
    processingTime: "Instant",
    active: false,
  },

  // ── South Africa ───────────────────────────────────────────────────────────
  {
    id: "eft_za",
    name: "EFT Bank Transfer",
    type: "bank_transfer",
    countries: ["ZA"],
    currencies: ["ZAR"],
    minAmount: 50,
    maxAmount: 100_000,
    feePercent: 0,
    flatFee: 5,
    processingTime: "1–3 hours",
    active: false,
  },

  // ── Global card (future) ───────────────────────────────────────────────────
  {
    id: "card_global",
    name: "Visa / Mastercard",
    type: "card",
    countries: ["*"],
    currencies: ["USD", "EUR", "GBP"],
    minAmount: 10,
    maxAmount: 10_000,
    feePercent: 0.029,
    flatFee: 0.30,
    processingTime: "Instant",
    active: false,
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/320px-Visa_Inc._logo.svg.png",
  },
];

/**
 * Returns all **active** providers available for a given country code.
 * Providers with countries: ['*'] are included for every country.
 */
export function getActiveProvidersForCountry(countryCode: string): PaymentProvider[] {
  const code = countryCode.toUpperCase();
  return PAYMENT_PROVIDERS.filter(
    (p) => p.active && (p.countries.includes(code) || p.countries.includes("*"))
  );
}

/**
 * Returns a provider by its ID, or undefined if not found.
 */
export function getProviderById(id: string): PaymentProvider | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}

/**
 * Validate that a provider is active and supports the given country.
 * Returns the provider if valid, or an error string.
 */
export function validateProvider(
  providerId: string,
  countryCode: string
): { provider: PaymentProvider } | { error: string } {
  const provider = getProviderById(providerId);
  if (!provider) return { error: `Payment method '${providerId}' does not exist.` };
  if (!provider.active) return { error: `Payment method '${provider.name}' is not currently available.` };

  const code = countryCode.toUpperCase();
  const countrySupported =
    provider.countries.includes(code) || provider.countries.includes("*");
  if (!countrySupported) {
    return { error: `Payment method '${provider.name}' is not available in your country.` };
  }

  return { provider };
}

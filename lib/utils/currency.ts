/**
 * lib/utils/currency.ts
 * International currency helpers for KryptoKe.
 * Maps ISO 3166-1 alpha-2 country codes → local fiat currency.
 */

export interface CurrencyInfo {
  code: string;   // ISO 4217 e.g. "KES"
  symbol: string; // Display symbol e.g. "KSh"
  name: string;   // e.g. "Kenyan Shilling"
  decimals: number;
}

export const COUNTRY_CURRENCY: Record<string, CurrencyInfo> = {
  // ── Africa ──────────────────────────────────────────────────────────────
  KE: { code: "KES", symbol: "KSh",  name: "Kenyan Shilling",        decimals: 2 },
  NG: { code: "NGN", symbol: "₦",    name: "Nigerian Naira",          decimals: 2 },
  GH: { code: "GHS", symbol: "GH₵",  name: "Ghanaian Cedi",           decimals: 2 },
  UG: { code: "UGX", symbol: "USh",  name: "Ugandan Shilling",        decimals: 0 },
  TZ: { code: "TZS", symbol: "TSh",  name: "Tanzanian Shilling",      decimals: 0 },
  ZA: { code: "ZAR", symbol: "R",    name: "South African Rand",      decimals: 2 },
  RW: { code: "RWF", symbol: "FRw",  name: "Rwandan Franc",           decimals: 0 },
  ET: { code: "ETB", symbol: "Br",   name: "Ethiopian Birr",          decimals: 2 },
  SN: { code: "XOF", symbol: "CFA",  name: "West African CFA Franc",  decimals: 0 },
  CI: { code: "XOF", symbol: "CFA",  name: "West African CFA Franc",  decimals: 0 },
  CM: { code: "XAF", symbol: "FCFA", name: "Central African CFA",     decimals: 0 },
  ZM: { code: "ZMW", symbol: "K",    name: "Zambian Kwacha",          decimals: 2 },
  ZW: { code: "ZWL", symbol: "Z$",   name: "Zimbabwean Dollar",       decimals: 2 },
  EG: { code: "EGP", symbol: "E£",   name: "Egyptian Pound",          decimals: 2 },
  MA: { code: "MAD", symbol: "MAD",  name: "Moroccan Dirham",         decimals: 2 },
  // ── Middle East ─────────────────────────────────────────────────────────
  AE: { code: "AED", symbol: "د.إ",  name: "UAE Dirham",              decimals: 2 },
  SA: { code: "SAR", symbol: "﷼",    name: "Saudi Riyal",             decimals: 2 },
  TR: { code: "TRY", symbol: "₺",    name: "Turkish Lira",            decimals: 2 },
  // ── Asia Pacific ────────────────────────────────────────────────────────
  IN: { code: "INR", symbol: "₹",    name: "Indian Rupee",            decimals: 2 },
  CN: { code: "CNY", symbol: "¥",    name: "Chinese Yuan",            decimals: 2 },
  JP: { code: "JPY", symbol: "¥",    name: "Japanese Yen",            decimals: 0 },
  PH: { code: "PHP", symbol: "₱",    name: "Philippine Peso",         decimals: 2 },
  ID: { code: "IDR", symbol: "Rp",   name: "Indonesian Rupiah",       decimals: 0 },
  SG: { code: "SGD", symbol: "S$",   name: "Singapore Dollar",        decimals: 2 },
  AU: { code: "AUD", symbol: "A$",   name: "Australian Dollar",       decimals: 2 },
  PK: { code: "PKR", symbol: "Rs",   name: "Pakistani Rupee",         decimals: 2 },
  BD: { code: "BDT", symbol: "৳",    name: "Bangladeshi Taka",        decimals: 2 },
  // ── Americas ────────────────────────────────────────────────────────────
  US: { code: "USD", symbol: "$",    name: "US Dollar",               decimals: 2 },
  CA: { code: "CAD", symbol: "CA$",  name: "Canadian Dollar",         decimals: 2 },
  BR: { code: "BRL", symbol: "R$",   name: "Brazilian Real",          decimals: 2 },
  MX: { code: "MXN", symbol: "MX$",  name: "Mexican Peso",            decimals: 2 },
  AR: { code: "ARS", symbol: "$",    name: "Argentine Peso",          decimals: 2 },
  // ── Europe ──────────────────────────────────────────────────────────────
  GB: { code: "GBP", symbol: "£",    name: "British Pound",           decimals: 2 },
  EU: { code: "EUR", symbol: "€",    name: "Euro",                    decimals: 2 },
  // Map common EU countries to EUR
  DE: { code: "EUR", symbol: "€",    name: "Euro",                    decimals: 2 },
  FR: { code: "EUR", symbol: "€",    name: "Euro",                    decimals: 2 },
  IT: { code: "EUR", symbol: "€",    name: "Euro",                    decimals: 2 },
  ES: { code: "EUR", symbol: "€",    name: "Euro",                    decimals: 2 },
  NL: { code: "EUR", symbol: "€",    name: "Euro",                    decimals: 2 },
  RU: { code: "RUB", symbol: "₽",    name: "Russian Ruble",           decimals: 2 },
  UA: { code: "UAH", symbol: "₴",    name: "Ukrainian Hryvnia",       decimals: 2 },
};

/** Fallback to USD for unknown country codes */
export function getCurrencyForCountry(countryCode: string): CurrencyInfo {
  return COUNTRY_CURRENCY[countryCode?.toUpperCase()] ?? COUNTRY_CURRENCY["US"]!;
}

/**
 * Format a fiat amount in the user's local currency.
 * Uses the forex rate from the user's context if available.
 *
 * @param amountUsd - amount in USD (as string or number)
 * @param countryCode - ISO 3166-1 alpha-2
 * @param usdToLocalRate - conversion rate (1 USD = N local). Pass 1 to show USD.
 */
export function formatFiat(
  amountUsd: string | number,
  countryCode: string,
  usdToLocalRate = 1
): string {
  const currency = getCurrencyForCountry(countryCode);
  const value = parseFloat(String(amountUsd)) * usdToLocalRate;

  if (!isFinite(value)) return `${currency.symbol} —`;

  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  });

  return `${currency.symbol} ${formatted}`;
}

/**
 * List of countries for UI selectors, sorted: Kenya first, then alphabetically.
 */
export const COUNTRY_OPTIONS: Array<{ code: string; name: string; flag: string }> = [
  { code: "KE", name: "Kenya",               flag: "🇰🇪" },
  { code: "NG", name: "Nigeria",             flag: "🇳🇬" },
  { code: "GH", name: "Ghana",               flag: "🇬🇭" },
  { code: "UG", name: "Uganda",              flag: "🇺🇬" },
  { code: "TZ", name: "Tanzania",            flag: "🇹🇿" },
  { code: "ZA", name: "South Africa",        flag: "🇿🇦" },
  { code: "RW", name: "Rwanda",              flag: "🇷🇼" },
  { code: "ET", name: "Ethiopia",            flag: "🇪🇹" },
  { code: "SN", name: "Senegal",             flag: "🇸🇳" },
  { code: "CI", name: "Ivory Coast",         flag: "🇨🇮" },
  { code: "CM", name: "Cameroon",            flag: "🇨🇲" },
  { code: "ZM", name: "Zambia",              flag: "🇿🇲" },
  { code: "ZW", name: "Zimbabwe",            flag: "🇿🇼" },
  { code: "EG", name: "Egypt",               flag: "🇪🇬" },
  { code: "MA", name: "Morocco",             flag: "🇲🇦" },
  { code: "AE", name: "United Arab Emirates",flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia",        flag: "🇸🇦" },
  { code: "TR", name: "Turkey",              flag: "🇹🇷" },
  { code: "IN", name: "India",               flag: "🇮🇳" },
  { code: "CN", name: "China",               flag: "🇨🇳" },
  { code: "JP", name: "Japan",               flag: "🇯🇵" },
  { code: "PH", name: "Philippines",         flag: "🇵🇭" },
  { code: "ID", name: "Indonesia",           flag: "🇮🇩" },
  { code: "SG", name: "Singapore",           flag: "🇸🇬" },
  { code: "AU", name: "Australia",           flag: "🇦🇺" },
  { code: "PK", name: "Pakistan",            flag: "🇵🇰" },
  { code: "BD", name: "Bangladesh",          flag: "🇧🇩" },
  { code: "US", name: "United States",       flag: "🇺🇸" },
  { code: "CA", name: "Canada",              flag: "🇨🇦" },
  { code: "BR", name: "Brazil",              flag: "🇧🇷" },
  { code: "MX", name: "Mexico",              flag: "🇲🇽" },
  { code: "AR", name: "Argentina",           flag: "🇦🇷" },
  { code: "GB", name: "United Kingdom",      flag: "🇬🇧" },
  { code: "DE", name: "Germany",             flag: "🇩🇪" },
  { code: "FR", name: "France",              flag: "🇫🇷" },
  { code: "IT", name: "Italy",               flag: "🇮🇹" },
  { code: "ES", name: "Spain",               flag: "🇪🇸" },
  { code: "NL", name: "Netherlands",         flag: "🇳🇱" },
  { code: "RU", name: "Russia",              flag: "🇷🇺" },
  { code: "UA", name: "Ukraine",             flag: "🇺🇦" },
];

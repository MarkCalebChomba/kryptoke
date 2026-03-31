import { redis, CacheKeys, CacheTTL } from "@/lib/redis/client";
import type { ExchangeRate } from "@/types";

const KES_USD_SANITY_MIN = 50;
const KES_USD_SANITY_MAX = 300;

/* ─── Frankfurter (free, no API key) ───────────────────────────────────── */

async function fetchFromFrankfurter(): Promise<number | null> {
  try {
    // Use env var if set, otherwise default to the free public endpoint
    const url =
      process.env.EXCHANGE_RATE_API_URL ??
      "https://api.frankfurter.app/latest?from=USD&to=KES";
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: { KES?: number }; conversion_rate?: number };
    // Frankfurter returns { rates: { KES: ... } }
    // exchangerate-api returns { conversion_rate: ... }
    return data.rates?.KES ?? data.conversion_rate ?? null;
  } catch {
    return null;
  }
}

/* ─── exchangerate-api (requires key, used if EXCHANGE_RATE_API_KEY set) ── */

async function fetchFromExchangeRateApi(): Promise<number | null> {
  try {
    const key = process.env.EXCHANGE_RATE_API_KEY;
    if (!key) return null; // Key not set — skip this source
    const res = await fetch(
      `https://v6.exchangerate-api.com/v6/${key}/pair/USD/KES`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { conversion_rate?: number };
    return data.conversion_rate ?? null;
  } catch {
    return null;
  }
}

/* ─── BNB/USD from Binance ──────────────────────────────────────────────── */

async function fetchBnbUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT",
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { price?: string };
    return data.price ? parseFloat(data.price) : null;
  } catch {
    return null;
  }
}

/* ─── Main rate fetcher ─────────────────────────────────────────────────── */

export async function getExchangeRate(): Promise<ExchangeRate> {
  const cached = await redis.get<ExchangeRate>(CacheKeys.forexRate());
  if (cached) return cached;

  // Fetch KES/USD and BNB/USD in parallel on cold cache
  let [kesPerUsdRaw, bnbUsdRaw] = await Promise.all([
    fetchFromExchangeRateApi().catch(() => null),
    fetchBnbUsd().catch(() => null),
  ]);

  // Fallback chain for KES/USD
  let kesPerUsd = kesPerUsdRaw;
  if (!kesPerUsd) {
    kesPerUsd = await fetchFromFrankfurter();
  }

  // Sanity check
  if (
    !kesPerUsd ||
    kesPerUsd < KES_USD_SANITY_MIN ||
    kesPerUsd > KES_USD_SANITY_MAX
  ) {
    const stale = await redis.get<ExchangeRate>(`${CacheKeys.forexRate()}:stale`);
    if (stale) return stale;
    kesPerUsd = 130; // Safe fallback — Frankfurter should never fail
    console.warn("[Forex] All sources failed — using fallback rate 130");
  }

  const bnbUsd = bnbUsdRaw ?? 300;

  const rate: ExchangeRate = {
    bnbUsd: bnbUsd.toFixed(2),
    kesPerUsd: kesPerUsd.toFixed(4),
    bnbKes: (bnbUsd * kesPerUsd).toFixed(2),
    usdtKes: kesPerUsd.toFixed(4),
    fetchedAt: new Date().toISOString(),
  };

  await redis.set(CacheKeys.forexRate(), rate, { ex: CacheTTL.forexRate });
  await redis.set(`${CacheKeys.forexRate()}:stale`, rate, { ex: 60 * 60 });

  return rate;
}

export async function getKesPerUsd(): Promise<string> {
  const rate = await getExchangeRate();
  return rate.kesPerUsd;
}

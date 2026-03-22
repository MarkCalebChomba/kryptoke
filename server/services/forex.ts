/**
 * Forex Service — KES/USD exchange rate
 *
 * SPEED DESIGN:
 * getExchangeRate() NEVER blocks. It returns:
 *   1. Redis cache (fresh, < 5 min) → immediate, ~2ms
 *   2. Module-level in-memory fallback → immediate, 0ms
 *   3. Schedules background refresh when stale
 *
 * External HTTP calls happen ONLY in the background, never on the hot path.
 */
import { redis, CacheKeys, CacheTTL } from "@/lib/redis/client";
import type { ExchangeRate } from "@/types";

const KES_USD_SANITY_MIN = 50;
const KES_USD_SANITY_MAX = 300;

// Module-level in-memory cache — survives across requests in the same Node process.
// Eliminates cold Redis round-trip on the very first call.
let _memCache: ExchangeRate | null = null;
let _memCacheAt = 0;
const MEM_TTL = 5 * 60 * 1000; // 5 minutes

// Last known safe rate — used when all sources fail
const FALLBACK_RATE: ExchangeRate = {
  bnbUsd:    "300.00",
  kesPerUsd: "130.0000",
  bnbKes:    "39000.00",
  usdtKes:   "130.0000",
  fetchedAt: new Date().toISOString(),
};

// Is a background refresh already in-flight? Don't pile up concurrent fetches.
let _refreshInFlight = false;

async function fetchFresh(): Promise<ExchangeRate | null> {
  try {
    const [kesRes, bnbRes] = await Promise.allSettled([
      // Frankfurter — free, reliable, no key needed
      fetch("https://api.frankfurter.app/latest?from=USD&to=KES", {
        signal: AbortSignal.timeout(4000),
      }),
      // BNB price from Binance
      fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT", {
        signal: AbortSignal.timeout(4000),
      }),
    ]);

    let kesPerUsd = 0;
    if (kesRes.status === "fulfilled" && kesRes.value.ok) {
      const d = await kesRes.value.json() as { rates?: { KES?: number } };
      kesPerUsd = d.rates?.KES ?? 0;
    }
    // Try exchangerate-api if env key is set and Frankfurter failed
    if (!kesPerUsd && process.env.EXCHANGE_RATE_API_KEY) {
      try {
        const r = await fetch(
          `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_RATE_API_KEY}/pair/USD/KES`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (r.ok) {
          const d = await r.json() as { conversion_rate?: number };
          kesPerUsd = d.conversion_rate ?? 0;
        }
      } catch { /* ignore */ }
    }

    let bnbUsd = 0;
    if (bnbRes.status === "fulfilled" && bnbRes.value.ok) {
      const d = await bnbRes.value.json() as { price?: string };
      bnbUsd = parseFloat(d.price ?? "0");
    }

    if (!kesPerUsd || kesPerUsd < KES_USD_SANITY_MIN || kesPerUsd > KES_USD_SANITY_MAX) {
      return null; // sanity failed — keep stale
    }

    const rate: ExchangeRate = {
      bnbUsd:    (bnbUsd || 300).toFixed(2),
      kesPerUsd: kesPerUsd.toFixed(4),
      bnbKes:    ((bnbUsd || 300) * kesPerUsd).toFixed(2),
      usdtKes:   kesPerUsd.toFixed(4),
      fetchedAt: new Date().toISOString(),
    };

    return rate;
  } catch {
    return null;
  }
}

async function refreshInBackground(): Promise<void> {
  if (_refreshInFlight) return;
  _refreshInFlight = true;
  try {
    const rate = await fetchFresh();
    if (rate) {
      _memCache  = rate;
      _memCacheAt = Date.now();
      await redis.set(CacheKeys.forexRate(), rate, { ex: CacheTTL.forexRate }).catch(() => undefined);
      // Keep a long-lived stale copy as ultimate fallback
      await redis.set(`${CacheKeys.forexRate()}:stale`, rate, { ex: 24 * 60 * 60 }).catch(() => undefined);
    }
  } catch { /* non-fatal */ }
  finally { _refreshInFlight = false; }
}

/**
 * Get exchange rate — NEVER blocks the request.
 * Returns stale/fallback instantly and refreshes in background.
 */
export async function getExchangeRate(): Promise<ExchangeRate> {
  const now = Date.now();

  // 1. In-memory cache — fastest path, zero network
  if (_memCache && (now - _memCacheAt) < MEM_TTL) {
    return _memCache;
  }

  // 2. Redis cache
  const cached = await redis.get<ExchangeRate>(CacheKeys.forexRate()).catch(() => null);
  if (cached) {
    _memCache  = cached;
    _memCacheAt = now;
    return cached;
  }

  // 3. Redis stale copy — return immediately, refresh in background
  const stale = await redis.get<ExchangeRate>(`${CacheKeys.forexRate()}:stale`).catch(() => null);
  if (stale) {
    _memCache  = stale;
    _memCacheAt = now - MEM_TTL + 30_000; // trigger re-check in 30s
    refreshInBackground(); // fire-and-forget
    return stale;
  }

  // 4. Module fallback — return immediately, refresh in background
  refreshInBackground(); // fire-and-forget
  return FALLBACK_RATE;
}

export async function getKesPerUsd(): Promise<string> {
  const rate = await getExchangeRate();
  return rate.kesPerUsd;
}

// Warm on module load — starts a background fetch so by the time
// the first user request arrives, the cache is likely already populated.
refreshInBackground();

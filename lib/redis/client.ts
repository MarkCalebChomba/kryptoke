import { Redis } from "@upstash/redis";

function getRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing Redis environment variables: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required."
    );
  }

  return new Redis({ url, token });
}

export const redis = getRedisClient();

/* ─── Cache Key Namespaces ──────────────────────────────────────────────── */

export const CacheKeys = {
  // Safaricom OAuth token — cached 55 minutes
  mpesaToken: () => "mpesa:oauth_token",

  // Forex rate — cached 5 minutes
  forexRate: () => "forex:kes_usd",

  // Token prices — cached 10 seconds
  tokenPrice: (address: string) => `price:${address.toLowerCase()}`,
  allPrices: () => "prices:all",

  // Binance ticker cache — updated every second by the market service
  binanceTicker: (symbol: string) => `binance:ticker:${symbol.toUpperCase()}`,
  binanceAllTickers: () => "binance:tickers",

  // OKX ticker fallback
  okxTicker: (symbol: string) => `okx:ticker:${symbol.toUpperCase()}`,

  // Order book — cached 500ms
  orderBook: (symbol: string) => `orderbook:${symbol.toUpperCase()}`,

  // User balance (short cache to reduce DB reads on high-traffic pages)
  userBalance: (uid: string) => `balance:${uid}`,

  // Rate limiting counters
  rateLimitIp: (ip: string, route: string) => `ratelimit:ip:${ip}:${route}`,
  rateLimitUser: (uid: string, route: string) => `ratelimit:user:${uid}:${route}`,

  // System config
  systemConfig: () => "config:system",

  // Fear and greed index — cached 1 hour
  fearGreed: () => "market:fear_greed",
} as const;

/* ─── TTL Constants (in seconds) ────────────────────────────────────────── */

export const CacheTTL = {
  mpesaToken: 55 * 60,       // 55 minutes
  forexRate: 5 * 60,         // 5 minutes
  tokenPrice: 10,             // 10 seconds
  binanceTicker: 2,           // 2 seconds
  orderBook: 1,               // 1 second
  userBalance: 30,            // 30 seconds
  systemConfig: 5 * 60,      // 5 minutes
  fearGreed: 60 * 60,        // 1 hour
} as const;

/* ─── Typed Cache Helpers ───────────────────────────────────────────────── */

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get<T>(key);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    // Cache failures are non-fatal — log but continue
    console.error(`[Redis] Failed to set cache key: ${key}`);
  }
}

export async function deleteCached(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    console.error(`[Redis] Failed to delete cache key: ${key}`);
  }
}

/* ─── Atomic Increment ──────────────────────────────────────────────────── */

export async function atomicIncrement(key: string): Promise<number> {
  const result = await redis.incr(key);
  return result;
}

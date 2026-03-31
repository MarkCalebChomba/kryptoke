/**
 * server/jobs/prices.ts
 *
 * Price cron — fetches live prices for all active tokens from their primary
 * exchange and writes to:
 *   1. Redis key  "market:prices"  — single JSON blob, read by the markets API
 *   2. Supabase   market_cache     — persistent fallback, survives Redis flush
 *
 * Called by: POST /api/v1/cron/prices  (secured by X-Cron-Secret header)
 * Schedule:  Every 30 seconds via cron-job.org
 */

import { getDb } from "@/server/db/client";
import { redis } from "@/lib/redis/client";

export const MARKET_PRICES_KEY   = "market:prices";
export const MARKET_GAINERS_1H   = "market:gainers:1h";
export const MARKET_LOSERS_1H    = "market:losers:1h";
export const MARKET_GAINERS_24H  = "market:gainers:24h";
export const MARKET_LOSERS_24H   = "market:losers:24h";
export const MARKET_HOT          = "market:hot";

export interface CoinPrice {
  symbol:     string;
  name:       string;
  logo_url:   string;
  cmc_rank:   number;
  price:      string;
  change_24h: string;
  change_1h:  string;
  volume_24h: string;
  high_24h:   string;
  low_24h:    string;
  source:     string;
}

// ── Exchange fetchers ─────────────────────────────────────────────────────────

async function fetchBinancePrices(symbols: string[]): Promise<Map<string, {
  price: string; change_24h: string; change_1h: string;
  volume: string; high: string; low: string;
}>> {
  // Binance 24hr ticker — one call gets ALL pairs
  const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Binance ticker failed: ${res.status}`);

  const data = await res.json() as Array<{
    symbol: string; lastPrice: string; priceChangePercent: string;
    quoteVolume: string; highPrice: string; lowPrice: string;
    openPrice: string;
  }>;

  const needed = new Set(symbols.map((s) => `${s}USDT`));
  const map = new Map<string, ReturnType<typeof fetchBinancePrices> extends Promise<Map<string, infer V>> ? V : never>();

  for (const t of data) {
    if (!needed.has(t.symbol)) continue;
    const base = t.symbol.replace("USDT", "");
    // Approximate 1h change from open price (Binance doesn't provide 1h natively in 24hr endpoint)
    // We store 0 here — the hourly cron computes accurate 1h change from snapshots
    map.set(base, {
      price:      t.lastPrice,
      change_24h: t.priceChangePercent,
      change_1h:  "0",
      volume:     t.quoteVolume,
      high:       t.highPrice,
      low:        t.lowPrice,
    });
  }
  return map;
}

async function fetchOkxPrices(symbols: string[]): Promise<Map<string, {
  price: string; change_24h: string; change_1h: string;
  volume: string; high: string; low: string;
}>> {
  const map = new Map<string, ReturnType<typeof fetchOkxPrices> extends Promise<Map<string, infer V>> ? V : never>();

  // OKX supports batch ticker, comma-separated instIds
  const instIds = symbols.map((s) => `${s}-USDT`).join(",");
  const res = await fetch(
    `https://www.okx.com/api/v5/market/tickers?instType=SPOT&instId=${instIds}`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return map;

  const data = await res.json() as {
    data: Array<{
      instId: string; last: string; open24h: string;
      vol24h: string; high24h: string; low24h: string;
    }>;
  };

  for (const t of data.data ?? []) {
    const base = t.instId.replace("-USDT", "");
    const open = parseFloat(t.open24h);
    const last = parseFloat(t.last);
    const change = open > 0 ? (((last - open) / open) * 100).toFixed(4) : "0";
    map.set(base, {
      price:      t.last,
      change_24h: change,
      change_1h:  "0",
      volume:     t.vol24h,
      high:       t.high24h,
      low:        t.low24h,
    });
  }
  return map;
}

async function fetchBybitPrices(symbols: string[]): Promise<Map<string, {
  price: string; change_24h: string; change_1h: string;
  volume: string; high: string; low: string;
}>> {
  const map = new Map<string, ReturnType<typeof fetchBybitPrices> extends Promise<Map<string, infer V>> ? V : never>();
  const res = await fetch(
    "https://api.bybit.com/v5/market/tickers?category=spot",
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return map;

  const needed = new Set(symbols.map((s) => `${s}USDT`));
  const data = await res.json() as {
    result: { list: Array<{ symbol: string; lastPrice: string; price24hPcnt: string; volume24h: string; highPrice24h: string; lowPrice24h: string }> };
  };

  for (const t of data.result?.list ?? []) {
    if (!needed.has(t.symbol)) continue;
    const base = t.symbol.replace("USDT", "");
    map.set(base, {
      price:      t.lastPrice,
      change_24h: (parseFloat(t.price24hPcnt) * 100).toFixed(4),
      change_1h:  "0",
      volume:     t.volume24h,
      high:       t.highPrice24h,
      low:        t.lowPrice24h,
    });
  }
  return map;
}

async function fetchBitgetPrices(symbols: string[]): Promise<Map<string, {
  price: string; change_24h: string; change_1h: string;
  volume: string; high: string; low: string;
}>> {
  const map = new Map<string, ReturnType<typeof fetchBitgetPrices> extends Promise<Map<string, infer V>> ? V : never>();
  const res = await fetch(
    "https://api.bitget.com/api/v2/spot/market/tickers",
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return map;

  const needed = new Set(symbols.map((s) => `${s}USDT`));
  const data = await res.json() as {
    data: Array<{ symbol: string; lastPr: string; change24h: string; quoteVolume: string; high24h: string; low24h: string }>;
  };

  for (const t of data.data ?? []) {
    if (!needed.has(t.symbol)) continue;
    const base = t.symbol.replace("USDT", "");
    map.set(base, {
      price:      t.lastPr,
      change_24h: (parseFloat(t.change24h) * 100).toFixed(4),
      change_1h:  "0",
      volume:     t.quoteVolume,
      high:       t.high24h,
      low:        t.low24h,
    });
  }
  return map;
}

// ── Main price refresh ─────────────────────────────────────────────────────────
export async function refreshPrices(): Promise<{ updated: number; errors: string[] }> {
  const db = getDb();
  const errors: string[] = [];

  // Load all active tokens with their primary exchange
  const { data: tokens, error: tokenErr } = await db
    .from("tokens")
    .select(`
      id, symbol, name, logo_url, cmc_rank,
      token_exchange_pairs!inner (exchange, pair_symbol, is_primary)
    `)
    .eq("is_active", true)
    .eq("token_exchange_pairs.is_primary", true)
    .order("cmc_rank", { ascending: true });

  if (tokenErr || !tokens) {
    throw new Error(`Failed to load tokens: ${tokenErr?.message}`);
  }

  // Group symbols by primary exchange
  const byExchange: Record<string, string[]> = {
    binance: [], okx: [], bybit: [], bitget: [],
  };

  const tokenMeta: Record<string, { name: string; logo_url: string; cmc_rank: number; exchange: string }> = {};

  for (const token of tokens) {
    const pairs = token.token_exchange_pairs as Array<{ exchange: string; pair_symbol: string; is_primary: boolean }>;
    const primary = pairs.find((p) => p.is_primary);
    if (!primary) continue;

    byExchange[primary.exchange]?.push(token.symbol);
    tokenMeta[token.symbol] = {
      name:     token.name,
      logo_url: token.logo_url,
      cmc_rank: token.cmc_rank,
      exchange: primary.exchange,
    };
  }

  // Fetch from all exchanges in parallel
  const [binanceMap, okxMap, bybitMap, bitgetMap] = await Promise.allSettled([
    byExchange.binance.length > 0 ? fetchBinancePrices(byExchange.binance) : Promise.resolve(new Map()),
    byExchange.okx.length    > 0 ? fetchOkxPrices(byExchange.okx)         : Promise.resolve(new Map()),
    byExchange.bybit.length  > 0 ? fetchBybitPrices(byExchange.bybit)      : Promise.resolve(new Map()),
    byExchange.bitget.length > 0 ? fetchBitgetPrices(byExchange.bitget)    : Promise.resolve(new Map()),
  ]);

  const pricesByExchange: Record<string, Map<string, ReturnType<typeof fetchBinancePrices> extends Promise<infer V> ? V : never>> = {
    binance: binanceMap.status === "fulfilled" ? binanceMap.value as Map<string, ReturnType<typeof fetchBinancePrices> extends Promise<Map<string, infer V>> ? V : never> : new Map(),
    okx:     okxMap.status     === "fulfilled" ? okxMap.value     as Map<string, ReturnType<typeof fetchBinancePrices> extends Promise<Map<string, infer V>> ? V : never> : new Map(),
    bybit:   bybitMap.status   === "fulfilled" ? bybitMap.value   as Map<string, ReturnType<typeof fetchBinancePrices> extends Promise<Map<string, infer V>> ? V : never> : new Map(),
    bitget:  bitgetMap.status  === "fulfilled" ? bitgetMap.value  as Map<string, ReturnType<typeof fetchBinancePrices> extends Promise<Map<string, infer V>> ? V : never> : new Map(),
  };

  if (binanceMap.status === "rejected") errors.push(`Binance: ${binanceMap.reason}`);
  if (okxMap.status     === "rejected") errors.push(`OKX: ${okxMap.reason}`);
  if (bybitMap.status   === "rejected") errors.push(`Bybit: ${bybitMap.reason}`);
  if (bitgetMap.status  === "rejected") errors.push(`Bitget: ${bitgetMap.reason}`);

  // Assemble the unified price blob
  const priceBlob: Record<string, CoinPrice> = {};
  const marketCacheRows: Array<{
    symbol: string; price_usd: number; change_24h: number; change_1h: number;
    volume_24h: number; high_24h: number; low_24h: number; source: string; updated_at: string;
  }> = [];
  let updated = 0;

  for (const symbol of Object.keys(tokenMeta)) {
    const meta   = tokenMeta[symbol]!;
    const exMap  = pricesByExchange[meta.exchange];
    const data   = exMap?.get(symbol);
    if (!data) continue;

    priceBlob[symbol] = {
      symbol,
      name:       meta.name,
      logo_url:   meta.logo_url,
      cmc_rank:   meta.cmc_rank,
      price:      data.price,
      change_24h: data.change_24h,
      change_1h:  data.change_1h,
      volume_24h: data.volume,
      high_24h:   data.high,
      low_24h:    data.low,
      source:     meta.exchange,
    };

    marketCacheRows.push({
      symbol,
      price_usd:  parseFloat(data.price)      || 0,
      change_24h: parseFloat(data.change_24h) || 0,
      change_1h:  0,
      volume_24h: parseFloat(data.volume)     || 0,
      high_24h:   parseFloat(data.high)       || 0,
      low_24h:    parseFloat(data.low)        || 0,
      source:     meta.exchange,
      updated_at: new Date().toISOString(),
    });

    updated++;
  }

  // Write to Redis — single blob, 90s TTL (covers 3 missed cron runs)
  await redis.set(MARKET_PRICES_KEY, JSON.stringify(priceBlob), { ex: 90 });

  // Write to Supabase market_cache in batches of 100
  if (marketCacheRows.length > 0) {
    for (let i = 0; i < marketCacheRows.length; i += 100) {
      const batch = marketCacheRows.slice(i, i + 100);
      await db.from("market_cache").upsert(batch, { onConflict: "symbol" });
    }
  }

  return { updated, errors };
}

// ── Gainers/losers computation (called by hourly cron) ────────────────────────
export async function refreshGainersLosers(): Promise<void> {
  const raw = await redis.get<string>(MARKET_PRICES_KEY);
  if (!raw) return;

  const prices: Record<string, CoinPrice> = typeof raw === "string" ? JSON.parse(raw) : raw;
  const coins = Object.values(prices);

  const sorted24h = [...coins].sort((a, b) => parseFloat(b.change_24h) - parseFloat(a.change_24h));
  const sorted1h  = [...coins].sort((a, b) => parseFloat(b.change_1h)  - parseFloat(a.change_1h));

  const top20 = (arr: CoinPrice[]) => arr.slice(0, 20).map((c) => ({
    symbol:   c.symbol,
    name:     c.name,
    logo_url: c.logo_url,
    price:    c.price,
    change:   c.change_24h,
  }));

  const bottom20 = (arr: CoinPrice[]) => arr.slice(-20).reverse().map((c) => ({
    symbol:   c.symbol,
    name:     c.name,
    logo_url: c.logo_url,
    price:    c.price,
    change:   c.change_24h,
  }));

  await Promise.all([
    redis.set(MARKET_GAINERS_24H, JSON.stringify(top20(sorted24h)),    { ex: 3700 }), // 1h + buffer
    redis.set(MARKET_LOSERS_24H,  JSON.stringify(bottom20(sorted24h)), { ex: 3700 }),
    redis.set(MARKET_GAINERS_1H,  JSON.stringify(top20(sorted1h)),     { ex: 3700 }),
    redis.set(MARKET_LOSERS_1H,   JSON.stringify(bottom20(sorted1h)),  { ex: 3700 }),
  ]);
}

// ── Hot list computation (called by daily cron) ───────────────────────────────
export async function refreshHotList(): Promise<void> {
  const raw = await redis.get<string>(MARKET_PRICES_KEY);
  if (!raw) return;

  const prices: Record<string, CoinPrice> = typeof raw === "string" ? JSON.parse(raw) : raw;
  const coins = Object.values(prices);

  // Hot = high absolute price change AND high volume — score combines both
  const scored = coins
    .map((c) => ({
      ...c,
      hotScore: Math.abs(parseFloat(c.change_24h)) * Math.log10(parseFloat(c.volume_24h) + 1),
    }))
    .sort((a, b) => b.hotScore - a.hotScore)
    .slice(0, 20)
    .map(({ symbol, name, logo_url, price, change_24h }) => ({
      symbol, name, logo_url, price, change: change_24h,
    }));

  await redis.set(MARKET_HOT, JSON.stringify(scored), { ex: 86_400 + 3600 }); // 25h
}

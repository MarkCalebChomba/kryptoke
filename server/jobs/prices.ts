/**
 * server/jobs/prices.ts
 *
 * Price cron — fetches live prices from CoinGecko and writes to Redis only.
 * Redis key "market:prices" is the canonical price store.
 * market_cache DB upsert removed: was writing 200 rows to Postgres every 30s,
 * causing Supabase Disk IO spikes with zero benefit (Redis is faster and always
 * available; the DB fallback was never actually read by any API route).
 *
 * Called by: POST /api/v1/cron/prices  (secured by X-Cron-Secret header)
 * Schedule:  Every 60 seconds via cron-job.org
 */

import { getDb } from "@/server/db/client";
import { redis } from "@/lib/redis/client";

export const MARKET_PRICES_KEY  = "market:prices";
export const MARKET_GAINERS_24H = "market:gainers:24h";
export const MARKET_LOSERS_24H  = "market:losers:24h";
export const MARKET_HOT         = "market:hot";

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

// CMC logo CDN — reliable logos for well-known coins
const CMC_LOGO = (cmcId: number) =>
  `https://s2.coinmarketcap.com/static/img/coins/64x64/${cmcId}.png`;

const CMC_IDS: Record<string, number> = {
  BTC:1,ETH:1027,USDT:825,BNB:1839,SOL:5426,USDC:3408,XRP:52,DOGE:74,
  TRX:1958,ADA:2010,AVAX:5805,SHIB:5994,LINK:1975,DOT:6636,TON:11419,
  MATIC:3890,LTC:2,BCH:1831,UNI:7083,NEAR:6535,ATOM:3794,XLM:512,
  APT:21794,ARB:11841,OP:11840,HBAR:4642,AAVE:7278,MKR:1518,GRT:6719,DAI:4943,
};

async function fetchCoinGeckoPrices(): Promise<Map<string, {
  price: string; change_24h: string; change_1h: string;
  volume: string; high: string; low: string;
  name: string; logo_url: string; rank: number;
}>> {
  // Fetch top 200 — page 1 (ranks 1-100) + page 2 (ranks 101-200)
  const BASE =
    "https://api.coingecko.com/api/v3/coins/markets" +
    "?vs_currency=usd&order=market_cap_desc&per_page=100" +
    "&price_change_percentage=1h%2C24h&sparkline=false";

  const [res1, res2] = await Promise.all([
    fetch(`${BASE}&page=1`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) }),
    fetch(`${BASE}&page=2`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) })
      .catch(() => null), // page 2 failure is non-fatal
  ]);

  if (!res1.ok) throw new Error(`CoinGecko ${res1.status}`);

  type CgCoin = {
    symbol: string; name: string; image: string;
    current_price: number; price_change_percentage_24h: number;
    price_change_percentage_1h_in_currency: number;
    total_volume: number; high_24h: number; low_24h: number;
    market_cap_rank: number;
  };

  const page1 = (await res1.json()) as CgCoin[];
  const page2 = res2?.ok ? (await res2.json()) as CgCoin[] : [];
  const data = [...page1, ...page2];

  const map = new Map<string, {
    price: string; change_24h: string; change_1h: string;
    volume: string; high: string; low: string;
    name: string; logo_url: string; rank: number;
  }>();

  for (const coin of data) {
    const sym = coin.symbol.toUpperCase();
    const cmcId = CMC_IDS[sym];
    map.set(sym, {
      price:      String(coin.current_price ?? 0),
      change_24h: String(coin.price_change_percentage_24h ?? 0),
      change_1h:  String(coin.price_change_percentage_1h_in_currency ?? 0),
      volume:     String(coin.total_volume ?? 0),
      high:       String(coin.high_24h ?? 0),
      low:        String(coin.low_24h ?? 0),
      name:       coin.name,
      logo_url:   cmcId ? CMC_LOGO(cmcId) : coin.image,
      rank:       coin.market_cap_rank ?? 9999,
    });
  }

  return map;
}

export async function refreshPrices(): Promise<{ updated: number; errors: string[] }> {
  const db = getDb();
  const errors: string[] = [];

  // Load active tokens for metadata enrichment (name, logo override)
  const { data: tokens, error: tokenErr } = await db
    .from("tokens")
    .select("id, symbol, name, logo_url, cmc_rank")
    .eq("is_active", true)
    .order("cmc_rank", { ascending: true });

  if (tokenErr) errors.push(`DB load: ${tokenErr.message}`);

  // Fetch prices from CoinGecko
  let cgMap: Awaited<ReturnType<typeof fetchCoinGeckoPrices>> = new Map();
  try {
    cgMap = await fetchCoinGeckoPrices();
  } catch (e) {
    errors.push(`CoinGecko: ${e}`);
  }

  if (cgMap.size === 0) {
    return { updated: 0, errors: errors.length ? errors : ["CoinGecko returned no data"] };
  }

  // Build the price blob — merge DB token metadata with CoinGecko prices
  const priceBlob: Record<string, CoinPrice> = {};
  let updated = 0;

  for (const [sym, data] of cgMap) {
    const dbToken = (tokens ?? []).find((t) => t.symbol === sym);

    priceBlob[sym] = {
      symbol:     sym,
      name:       dbToken?.name ?? data.name,
      logo_url:   dbToken?.logo_url ?? data.logo_url,
      cmc_rank:   dbToken?.cmc_rank ?? data.rank,
      price:      data.price,
      change_24h: data.change_24h,
      change_1h:  data.change_1h,
      volume_24h: data.volume,
      high_24h:   data.high,
      low_24h:    data.low,
      source:     "coingecko",
    };

    updated++;
  }

  // Write prices to Redis (canonical store — 5 min TTL, cron refills every 60s)
  await redis.set(MARKET_PRICES_KEY, JSON.stringify(priceBlob), { ex: 300 });

  // Compute and cache gainers / losers / hot lists
  const allCoins = Object.values(priceBlob);

  const gainers = [...allCoins]
    .sort((a, b) => parseFloat(b.change_24h) - parseFloat(a.change_24h))
    .slice(0, 20);
  const losers = [...allCoins]
    .sort((a, b) => parseFloat(a.change_24h) - parseFloat(b.change_24h))
    .slice(0, 20);
  const hot = [...allCoins]
    .sort((a, b) =>
      Math.abs(parseFloat(b.change_24h)) * Math.log10(parseFloat(b.volume_24h) + 1) -
      Math.abs(parseFloat(a.change_24h)) * Math.log10(parseFloat(a.volume_24h) + 1)
    )
    .slice(0, 20);

  await Promise.all([
    redis.set(MARKET_GAINERS_24H, JSON.stringify(gainers), { ex: 300 }),
    redis.set(MARKET_LOSERS_24H,  JSON.stringify(losers),  { ex: 300 }),
    redis.set(MARKET_HOT,         JSON.stringify(hot),     { ex: 300 }),
  ]);

  // NOTE: market_cache DB upsert intentionally removed.
  // Writing 200 rows to Postgres every 30s was causing Supabase Disk IO spikes.
  // Redis is the canonical price store. All market API routes read from Redis only.

  return { updated, errors };
}


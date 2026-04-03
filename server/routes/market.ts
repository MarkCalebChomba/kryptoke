import { Hono } from "hono";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { redis, CacheKeys } from "@/lib/redis/client";
import { getTokenPrice } from "@/server/services/blockchain";
import { getExchangeRate } from "@/server/services/forex";
import { getDb } from "@/server/db/client";
import type { OHLCV } from "@/types";

const market = new Hono();
market.use("*", withApiRateLimit());

/* ─── GET /overview ─────────────────────────────────────────────────────── */

market.get("/overview", async (c) => {
  const db = getDb();
  // Run all three in parallel — getExchangeRate() hits an external API sequentially
  const [{ data: tokens }, rate, prices] = await Promise.all([
    db.from("tokens").select("*").eq("is_native", false).order("whitelisted_at", { ascending: false }).limit(50),
    getExchangeRate(),
    redis.get<Record<string, string>>(CacheKeys.binanceAllTickers()),
  ]);

  const overview = (tokens ?? []).map((t) => {
    const price = prices?.[`${t.symbol}USDT`] ?? "0";
    return {
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      price,
      iconUrl: t.icon_url,
      isNew: t.is_new,
      isSeed: t.is_seed,
      kesPrice: price !== "0"
        ? (parseFloat(price) * parseFloat(rate.kesPerUsd)).toFixed(2)
        : "0",
    };
  });

  return c.json({ success: true, data: overview });
});

/* ─── GET /price/:tokenAddress ──────────────────────────────────────────── */

market.get("/price/:tokenAddress", async (c) => {
  const { tokenAddress } = c.req.param();

  const [price, rate] = await Promise.all([
    getTokenPrice(tokenAddress),
    getExchangeRate(),
  ]);
  const kesPrice = price !== "0"
    ? (parseFloat(price) * parseFloat(rate.kesPerUsd)).toFixed(2)
    : "0";

  return c.json({ success: true, data: { tokenAddress, price, kesPrice } });
});

/* ─── GET /candles/:tokenAddress ── Bug #6 fix: fallback when Graph deprecated */

market.get("/candles/:tokenAddress", async (c) => {
  const { tokenAddress } = c.req.param();
  const interval = c.req.query("interval") ?? "1h";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 200);

  const binanceIntervalMap: Record<string, string> = {
    "15m": "15m", "hour": "1h", "1h": "1h",
    "4h": "4h", "day": "1d", "1D": "1d", "1W": "1w", "3m": "3m",
  };
  const binanceInterval = binanceIntervalMap[interval] ?? "1h";

  // Strategy 1: tokenAddress already looks like a Binance symbol (e.g. "DOGEUSDT", "BTCUSDT")
  const looksLikeBinanceSymbol = /^[A-Z0-9]{2,10}USDT$/.test(tokenAddress.toUpperCase());
  if (looksLikeBinanceSymbol) {
    try {
      const candles = await fetchBinanceCandles(tokenAddress.toUpperCase(), binanceInterval, limit);
      if (candles.length > 0) return c.json({ success: true, data: candles, source: "binance" });
    } catch { /* fall through */ }
  }

  // Strategy 2: tokenAddress is a plain symbol without USDT suffix (e.g. "DOGE", "BTC")
  const asUsdtPair = `${tokenAddress.toUpperCase()}USDT`;
  if (!looksLikeBinanceSymbol) {
    try {
      const candles = await fetchBinanceCandles(asUsdtPair, binanceInterval, limit);
      if (candles.length > 0) return c.json({ success: true, data: candles, source: "binance" });
    } catch { /* fall through */ }
  }

  // Strategy 3: Look up symbol from DB by address
  const db = getDb();
  const { data: token } = await db
    .from("tokens")
    .select("symbol")
    .eq("address", tokenAddress)
    .maybeSingle();

  if (token?.symbol) {
    try {
      const candles = await fetchBinanceCandles(`${token.symbol}USDT`, binanceInterval, limit);
      if (candles.length > 0) return c.json({ success: true, data: candles, source: "binance" });
    } catch { /* fall through */ }
  }

  // Final fallback: empty (no on-chain trade data for this token)
  return c.json({ success: true, data: [], source: "empty" });
});

async function fetchBinanceCandles(
  symbol: string,
  interval: string,
  limit: number
): Promise<OHLCV[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Binance klines failed: ${res.status}`);

  const raw = (await res.json()) as Array<[
    number, string, string, string, string, string, ...unknown[]
  ]>;

  return raw.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: k[5],
  }));
}

function buildCandlesFromTrades(
  trades: Array<{ created_at: string; price: string | null; amount_in: string; side: string }>,
  interval: string,
  limit: number
): OHLCV[] {
  const intervalMs: Record<string, number> = {
    "15m": 15 * 60_000, "1h": 60 * 60_000, "hour": 60 * 60_000,
    "4h": 4 * 60 * 60_000, "1d": 24 * 60 * 60_000, "1D": 24 * 60 * 60_000,
  };
  const bucketMs = intervalMs[interval] ?? 60 * 60_000;

  const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

  for (const trade of trades) {
    if (!trade.price) continue;
    const price = parseFloat(trade.price);
    const ts = Math.floor(new Date(trade.created_at).getTime() / bucketMs) * bucketMs;

    const existing = buckets.get(ts);
    if (!existing) {
      buckets.set(ts, {
        open: price, high: price, low: price, close: price,
        volume: parseFloat(trade.amount_in),
      });
    } else {
      existing.high = Math.max(existing.high, price);
      existing.low = Math.min(existing.low, price);
      existing.close = price;
      existing.volume += parseFloat(trade.amount_in);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .slice(-limit)
    .map(([ts, v]) => ({
      time: Math.floor(ts / 1000),
      open: v.open.toFixed(8),
      high: v.high.toFixed(8),
      low: v.low.toFixed(8),
      close: v.close.toFixed(8),
      volume: v.volume.toFixed(6),
    }));
}

/* ─── GET /orderbook/:symbol ────────────────────────────────────────────── */

market.get("/orderbook/:symbol", async (c) => {
  const { symbol } = c.req.param();

  // Try cached order book first (set by WebSocket service)
  const cached = await redis.get(CacheKeys.orderBook(symbol));
  if (cached) {
    return c.json({ success: true, data: cached });
  }

  // Fetch from Binance REST as fallback
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=20`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) throw new Error("Binance order book unavailable");

    const data = (await res.json()) as {
      bids: [string, string][];
      asks: [string, string][];
    };

    const maxBid = Math.max(...data.bids.map((b) => parseFloat(b[1])));
    const maxAsk = Math.max(...data.asks.map((a) => parseFloat(a[1])));

    const orderBook = {
      symbol: symbol.toUpperCase(),
      bids: data.bids.map(([price, qty]) => ({
        price,
        quantity: qty,
        depth: parseFloat(qty) / maxBid,
      })),
      asks: data.asks.map(([price, qty]) => ({
        price,
        quantity: qty,
        depth: parseFloat(qty) / maxAsk,
      })),
      spread: (parseFloat(data.asks[0]?.[0] ?? "0") - parseFloat(data.bids[0]?.[0] ?? "0")).toFixed(8),
      updatedAt: Date.now(),
    };

    // Cache for 10 seconds
    await redis.set(CacheKeys.orderBook(symbol), orderBook, { ex: 10 });
    return c.json({ success: true, data: orderBook });
  } catch {
    // Return empty but valid order book structure so UI doesn't crash
    return c.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        bids: [],
        asks: [],
        spread: "0",
        updatedAt: Date.now(),
        unavailable: true,
      },
    });
  }
});

/* ─── GET /ticker/:symbol — single pair live tick ──────────────────────── */

market.get("/ticker/:symbol", async (c) => {
  const { symbol } = c.req.param();

  const cached = await redis.get<Record<string, string>>(
    CacheKeys.binanceTicker(symbol)
  );

  if (cached) {
    return c.json({ success: true, data: cached });
  }

  // Fetch from Binance REST
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) throw new Error("Binance unavailable");

    const data = (await res.json()) as {
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
      highPrice: string;
      lowPrice: string;
      volume: string;
      quoteVolume: string;
    };

    const ticker = {
      symbol: data.symbol,
      lastPrice: data.lastPrice,
      priceChangePercent: data.priceChangePercent,
      highPrice: data.highPrice,
      lowPrice: data.lowPrice,
      volume: data.volume,
      quoteVolume: data.quoteVolume,
      updatedAt: Date.now(),
    };

    // Cache for 30 seconds so subsequent requests are instant
    await redis.set(CacheKeys.binanceTicker(symbol), ticker, { ex: 30 });
    return c.json({ success: true, data: ticker });
  } catch { /* fall through to CoinGecko */ }

  // Fallback: CoinGecko simple price (not blocked by Vercel)
  // CoinGecko uses full coin IDs, not ticker symbols
  const CG_ID_MAP: Record<string, string> = {
    BTC: "bitcoin", ETH: "ethereum", USDT: "tether", BNB: "binancecoin",
    SOL: "solana", USDC: "usd-coin", XRP: "ripple", DOGE: "dogecoin",
    TRX: "tron", ADA: "cardano", AVAX: "avalanche-2", SHIB: "shiba-inu",
    LINK: "chainlink", DOT: "polkadot", TON: "the-open-network",
    MATIC: "matic-network", LTC: "litecoin", BCH: "bitcoin-cash",
    UNI: "uniswap", NEAR: "near", ATOM: "cosmos", XLM: "stellar",
    APT: "aptos", ARB: "arbitrum", OP: "optimism", HBAR: "hedera-hashgraph",
    AAVE: "aave", MKR: "maker", GRT: "the-graph", DAI: "dai",
    CRV: "curve-dao-token", LDO: "lido-dao", SNX: "havven",
    ENJ: "enjincoin", SAND: "the-sandbox", MANA: "decentraland",
    ALGO: "algorand", VET: "vechain", FIL: "filecoin", EGLD: "elrond-erd-2",
    THETA: "theta-token", AXS: "axie-infinity", CHZ: "chiliz",
    GALA: "gala", IMX: "immutable-x", KAVA: "kava", ROSE: "oasis-network",
  };
  try {
    const baseSymbol = symbol.toUpperCase().replace(/USDT$|USDC$/, "");
    const cgId = CG_ID_MAP[baseSymbol] ?? baseSymbol.toLowerCase();
    const cgRes = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_24hr=true&include_low_24hr=true`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!cgRes.ok) throw new Error("CoinGecko unavailable");

    const cgData = await cgRes.json() as Record<string, {
      usd?: number; usd_24h_change?: number; usd_24h_vol?: number;
      usd_24h_high?: number; usd_24h_low?: number;
    }>;

    const coin = cgData[cgId];
    if (!coin?.usd) throw new Error("No CoinGecko data");

    const ticker = {
      symbol: symbol.toUpperCase(),
      lastPrice: coin.usd.toString(),
      priceChangePercent: (coin.usd_24h_change ?? 0).toFixed(2),
      highPrice: (coin.usd_24h_high ?? coin.usd).toString(),
      lowPrice: (coin.usd_24h_low ?? coin.usd).toString(),
      volume: "0",
      quoteVolume: (coin.usd_24h_vol ?? 0).toString(),
      updatedAt: Date.now(),
      source: "coingecko",
    };

    await redis.set(CacheKeys.binanceTicker(symbol), ticker, { ex: 60 });
    return c.json({ success: true, data: ticker });
  } catch {
    // Last resort: return zeros so the UI renders without crashing
    const fallbackTicker = {
      symbol: symbol.toUpperCase(), lastPrice: "0", priceChangePercent: "0",
      highPrice: "0", lowPrice: "0", volume: "0", quoteVolume: "0",
      updatedAt: Date.now(), source: "unavailable",
    };
    return c.json({ success: true, data: fallbackTicker });
  }
});

/* ─── GET /usdt-kes ─────────────────────────────────────────────────────── */

market.get("/usdt-kes", async (c) => {
  const rate = await getExchangeRate();
  return c.json({
    success: true,
    data: {
      symbol: "USDT/KES",
      price: rate.usdtKes,
      source: "forex",
      updatedAt: rate.fetchedAt,
    },
  });
});

/* ─── GET /search ───────────────────────────────────────────────────────── */

market.get("/search", async (c) => {
  const q = c.req.query("q")?.trim().toUpperCase() ?? "";
  if (!q) return c.json({ success: true, data: [] });

  const db = getDb();
  const { data: tokens } = await db
    .from("tokens")
    .select("address, symbol, name, icon_url")
    .or(`symbol.ilike.%${q}%,name.ilike.%${q}%`)
    .limit(10);

  return c.json({ success: true, data: tokens ?? [] });
});

/* ─── GET /trades/:tokenAddress ─────────────────────────────────────────── */

market.get("/trades/:tokenAddress", async (c) => {
  const { tokenAddress } = c.req.param();
  const db = getDb();

  const { data: trades } = await db
    .from("trades")
    .select("id, price, amount_in, side, created_at")
    .eq("token_in", tokenAddress)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(20);

  return c.json({ success: true, data: trades ?? [] });
});

/* ─── GET /fear-greed ── Fear and Greed Index ───────────────────────────── */

market.get("/fear-greed", async (c) => {
  const cached = await redis.get(CacheKeys.fearGreed());
  if (cached) return c.json({ success: true, data: cached });

  try {
    const res = await fetch(
      "https://api.alternative.me/fng/?limit=1",
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) throw new Error("Fear and greed API unavailable");

    const data = (await res.json()) as {
      data?: Array<{ value: string; value_classification: string; timestamp: string }>;
    };

    const item = data.data?.[0];
    if (!item) throw new Error("No data");

    const result = {
      value: parseInt(item.value),
      classification: item.value_classification,
      timestamp: item.timestamp,
    };

    await redis.set(CacheKeys.fearGreed(), result, { ex: 60 * 60 }); // 1 hour cache

    return c.json({ success: true, data: result });
  } catch {
    return c.json({
      success: true,
      data: { value: 50, classification: "Neutral", timestamp: null },
    });
  }
});


/* ─── GET /events — upcoming published events (public) ─────────────────── */

market.get("/events", async (c) => {
  const db = getDb();
  const { data } = await db
    .from("events")
    .select("id, title, type, date, badge_color")
    .eq("published", true)
    .gte("date", new Date().toISOString())
    .order("date", { ascending: true })
    .limit(10);

  return c.json({ success: true, data: data ?? [] });
});


/* ─── GET /announcements — published announcements (public) ────────────── */

market.get("/announcements", async (c) => {
  const db = getDb();
  const { data } = await db
    .from("announcements")
    .select("id, title, body, type, created_at")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(10);

  return c.json({ success: true, data: data ?? [] });
});

/* ─── GET /coingecko/:id — proxied CoinGecko metadata ──────────────────── */

market.get("/coingecko/:id", authMiddleware, async (c) => {
  const { id } = c.req.param();
  if (!/^[a-z0-9-]+$/.test(id)) {
    return c.json({ success: false, error: "Invalid coin id", statusCode: 400 }, 400);
  }

  const cacheKey = `coingecko:meta:${id}`;
  const cached = await redis.get(cacheKey);
  if (cached) return c.json({ success: true, data: cached });

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error("CoinGecko unavailable");

    const raw = await res.json() as {
      description?: { en?: string };
      market_data?: {
        market_cap?: { usd?: number };
        circulating_supply?: number;
        total_supply?: number;
        ath?: { usd?: number };
        ath_date?: { usd?: string };
        atl?: { usd?: number };
        atl_date?: { usd?: string };
      };
      links?: {
        homepage?: string[];
        whitepaper?: string;
        twitter_screen_name?: string;
        telegram_channel_identifier?: string;
      };
    };

    const data = {
      description: raw.description?.en?.split(". ").slice(0, 2).join(". ") ?? "",
      marketCap: raw.market_data?.market_cap?.usd?.toFixed(0) ?? null,
      circulatingSupply: raw.market_data?.circulating_supply?.toFixed(0) ?? null,
      totalSupply: raw.market_data?.total_supply?.toFixed(0) ?? null,
      allTimeHigh: raw.market_data?.ath?.usd?.toFixed(8) ?? null,
      allTimeHighDate: raw.market_data?.ath_date?.usd ?? null,
      allTimeLow: raw.market_data?.atl?.usd?.toFixed(8) ?? null,
      allTimeLowDate: raw.market_data?.atl_date?.usd ?? null,
      website: raw.links?.homepage?.[0] ?? null,
      whitepaper: raw.links?.whitepaper ?? null,
      twitter: raw.links?.twitter_screen_name
        ? `https://twitter.com/${raw.links.twitter_screen_name}` : null,
      telegram: raw.links?.telegram_channel_identifier
        ? `https://t.me/${raw.links.telegram_channel_identifier}` : null,
    };

    await redis.set(cacheKey, data, { ex: 60 * 60 }); // 1 hour cache
    return c.json({ success: true, data });
  } catch {
    return c.json({ success: false, error: "CoinGecko data unavailable", statusCode: 503 }, 503);
  }
});

/* ─── GET /honeypot/:address — proxied Honeypot.is check ───────────────── */

market.get("/honeypot/:address", authMiddleware, async (c) => {
  const { address } = c.req.param();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return c.json({ success: false, error: "Invalid EVM address", statusCode: 400 }, 400);
  }

  const cacheKey = `honeypot:${address.toLowerCase()}`;
  const cached = await redis.get(cacheKey);
  if (cached) return c.json({ success: true, data: cached });

  try {
    const res = await fetch(
      `https://api.honeypot.is/v2/IsHoneypot?address=${address}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error("Honeypot API unavailable");

    const raw = await res.json() as {
      honeypotResult?: { isHoneypot?: boolean };
      token?: { deployer?: string };
      summary?: { riskLevel?: string };
      contractCode?: { openSource?: boolean };
    };

    const data = {
      isHoneypot: raw.honeypotResult?.isHoneypot ?? false,
      isVerified: raw.contractCode?.openSource ?? false,
      deployerAddress: raw.token?.deployer ?? null,
      riskLevel: (raw.summary?.riskLevel?.toLowerCase() ?? "unknown") as "low" | "medium" | "high" | "unknown",
      message: raw.honeypotResult?.isHoneypot
        ? "WARNING: This contract may be a honeypot"
        : "No honeypot detected",
    };

    await redis.set(cacheKey, data, { ex: 30 * 60 }); // 30 min cache
    return c.json({ success: true, data });
  } catch {
    return c.json({
      success: true,
      data: { isHoneypot: false, isVerified: false, deployerAddress: null, riskLevel: "unknown", message: "Could not verify contract" },
    });
  }
});

/* ─── GET /returns/:symbol — multi-period returns from Redis price history ── */

market.get("/returns/:symbol", authMiddleware, async (c) => {
  const { symbol } = c.req.param();
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean || clean.length > 20) {
    return c.json({ success: false, error: "Invalid symbol", statusCode: 400 }, 400);
  }

  const cacheKey = `returns:${clean}`;
  const cached = await redis.get(cacheKey);
  if (cached) return c.json({ success: true, data: cached });

  // Use the current price from Redis prices blob — return stubs since we
  // don't store historical daily candles yet. The UI renders "—" for null values.
  const priceRaw = await redis.get<string>("market:prices");
  const prices: Record<string, { price: string; change_24h: string }> =
    priceRaw ? (typeof priceRaw === "string" ? JSON.parse(priceRaw) : priceRaw) : {};

  const p = prices[clean];
  // We only have 24h change from CoinGecko, so fill what we can and null the rest
  const data = [
    { label: "Today", change: p?.change_24h ?? null },
    { label: "7D",    change: null },
    { label: "30D",   change: null },
    { label: "90D",   change: null },
    { label: "180D",  change: null },
    { label: "1Y",    change: null },
  ];

  await redis.set(cacheKey, data, { ex: 5 * 60 }); // 5 min cache
  return c.json({ success: true, data });
});

/* ─── GET /coins — unified paginated coin list with prices from Redis ──────
 *
 * Primary path: Redis price blob + Supabase metadata (zero Binance calls).
 * Fallback path: when tokens table is empty OR Redis has no prices, fetches
 * live from Binance 24hr ticker and synthesises coin objects on the fly.
 * This ensures the markets page always shows coins regardless of cron state.
 *
 * Query params:
 *   page    number  default 1
 *   limit   number  default 50, max 100
 *   tab     string  "all" | "gainers" | "losers" | "hot" | "favourites"
 *   chain   string  optional chain filter e.g. "1" (Ethereum), "56" (BSC), "SOL"
 *   search  string  optional symbol/name filter
 */

// CMC logo CDN — reliable fallback logos for common coins
const CMC_LOGO = (cmcId: number) =>
  `https://s2.coinmarketcap.com/static/img/coins/64x64/${cmcId}.png`;

// Well-known coins with CMC IDs for logo fallback when DB is cold
const KNOWN_COINS: Record<string, { name: string; cmcId: number; rank: number }> = {
  BTC:  { name: "Bitcoin",        cmcId: 1,    rank: 1  },
  ETH:  { name: "Ethereum",       cmcId: 1027, rank: 2  },
  USDT: { name: "Tether",         cmcId: 825,  rank: 3  },
  BNB:  { name: "BNB",            cmcId: 1839, rank: 4  },
  SOL:  { name: "Solana",         cmcId: 5426, rank: 5  },
  USDC: { name: "USD Coin",       cmcId: 3408, rank: 6  },
  XRP:  { name: "XRP",            cmcId: 52,   rank: 7  },
  DOGE: { name: "Dogecoin",       cmcId: 74,   rank: 8  },
  TRX:  { name: "TRON",           cmcId: 1958, rank: 9  },
  ADA:  { name: "Cardano",        cmcId: 2010, rank: 10 },
  AVAX: { name: "Avalanche",      cmcId: 5805, rank: 11 },
  SHIB: { name: "Shiba Inu",      cmcId: 5994, rank: 12 },
  LINK: { name: "Chainlink",      cmcId: 1975, rank: 13 },
  DOT:  { name: "Polkadot",       cmcId: 6636, rank: 14 },
  TON:  { name: "Toncoin",        cmcId: 11419,rank: 15 },
  MATIC:{ name: "Polygon",        cmcId: 3890, rank: 16 },
  WBTC: { name: "Wrapped Bitcoin",cmcId: 3717, rank: 17 },
  ICP:  { name: "Internet Computer",cmcId: 8916,rank: 18},
  DAI:  { name: "Dai",            cmcId: 4943, rank: 19 },
  LTC:  { name: "Litecoin",       cmcId: 2,    rank: 20 },
  BCH:  { name: "Bitcoin Cash",   cmcId: 1831, rank: 21 },
  UNI:  { name: "Uniswap",        cmcId: 7083, rank: 22 },
  NEAR: { name: "NEAR Protocol",  cmcId: 6535, rank: 23 },
  ATOM: { name: "Cosmos",         cmcId: 3794, rank: 24 },
  XLM:  { name: "Stellar",        cmcId: 512,  rank: 25 },
  ETC:  { name: "Ethereum Classic",cmcId: 1321,rank: 26 },
  XMR:  { name: "Monero",         cmcId: 328,  rank: 27 },
  APT:  { name: "Aptos",          cmcId: 21794,rank: 28 },
  FIL:  { name: "Filecoin",       cmcId: 2280, rank: 29 },
  ARB:  { name: "Arbitrum",       cmcId: 11841,rank: 30 },
  VET:  { name: "VeChain",        cmcId: 3077, rank: 31 },
  OP:   { name: "Optimism",       cmcId: 11840,rank: 32 },
  MKR:  { name: "Maker",          cmcId: 1518, rank: 33 },
  HBAR: { name: "Hedera",         cmcId: 4642, rank: 34 },
  GRT:  { name: "The Graph",      cmcId: 6719, rank: 35 },
  ALGO: { name: "Algorand",       cmcId: 4030, rank: 36 },
  AAVE: { name: "Aave",           cmcId: 7278, rank: 37 },
  QNT:  { name: "Quant",          cmcId: 3155, rank: 38 },
  STX:  { name: "Stacks",         cmcId: 4847, rank: 39 },
  SAND: { name: "The Sandbox",    cmcId: 6210, rank: 40 },
  MANA: { name: "Decentraland",   cmcId: 1966, rank: 41 },
  AXS:  { name: "Axie Infinity",  cmcId: 6783, rank: 42 },
  EOS:  { name: "EOS",            cmcId: 1765, rank: 43 },
  THETA:{ name: "Theta Network",  cmcId: 2416, rank: 44 },
  XTZ:  { name: "Tezos",          cmcId: 2011, rank: 45 },
  FTM:  { name: "Fantom",         cmcId: 3513, rank: 46 },
  EGLD: { name: "MultiversX",     cmcId: 6892, rank: 47 },
  FLOW: { name: "Flow",           cmcId: 4558, rank: 48 },
  ROSE: { name: "Oasis Network",  cmcId: 7653, rank: 49 },
  KAVA: { name: "Kava",           cmcId: 4846, rank: 50 },
};

async function fetchBinanceFallback(
  search: string,
  tab: string,
  offset: number,
  limit: number,
): Promise<{ data: unknown[]; total: number }> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { data: [], total: 0 };

    const tickers = await res.json() as Array<{
      symbol: string; lastPrice: string; priceChangePercent: string;
      quoteVolume: string; highPrice: string; lowPrice: string;
    }>;

    // Only USDT pairs, non-zero price
    let coins = tickers
      .filter((t) => t.symbol.endsWith("USDT") && parseFloat(t.lastPrice) > 0)
      .map((t) => {
        const sym = t.symbol.replace("USDT", "");
        const known = KNOWN_COINS[sym];
        return {
          symbol:      sym,
          name:        known?.name ?? sym,
          logo_url:    known ? CMC_LOGO(known.cmcId) : "",
          cmc_rank:    known?.rank ?? 9999,
          chain_ids:   [] as string[],
          is_depositable: false,
          price:       t.lastPrice,
          change_24h:  t.priceChangePercent,
          change_1h:   "0",
          volume_24h:  t.quoteVolume,
          high_24h:    t.highPrice,
          low_24h:     t.lowPrice,
          source:      "binance",
        };
      });

    if (search) {
      coins = coins.filter((c) =>
        c.symbol.includes(search) || c.name.toUpperCase().includes(search)
      );
    }

    // Sort by tab
    if (tab === "gainers") {
      coins.sort((a, b) => parseFloat(b.change_24h) - parseFloat(a.change_24h));
    } else if (tab === "losers") {
      coins.sort((a, b) => parseFloat(a.change_24h) - parseFloat(b.change_24h));
    } else if (tab === "hot") {
      coins.sort((a, b) =>
        Math.abs(parseFloat(b.change_24h)) * Math.log10(parseFloat(b.volume_24h) + 1) -
        Math.abs(parseFloat(a.change_24h)) * Math.log10(parseFloat(a.volume_24h) + 1)
      );
    } else {
      // "all" — sort by volume desc (most liquid first)
      coins.sort((a, b) => parseFloat(b.volume_24h) - parseFloat(a.volume_24h));
    }

    return { data: coins.slice(offset, offset + limit), total: coins.length };
  } catch {
    return { data: [], total: 0 };
  }
}

market.get("/coins", authMiddleware, async (c) => {
  const page   = Math.max(1, parseInt(c.req.query("page")  ?? "1"));
  const limit  = Math.min(Math.max(1, parseInt(c.req.query("limit") ?? "100")), 200);
  const tab    = (c.req.query("tab") ?? "all").toLowerCase();
  const chain  = c.req.query("chain") ?? "";
  const search = (c.req.query("search") ?? "").toUpperCase().trim();
  const offset = (page - 1) * limit;

  const db = getDb();

  // ── For gainers / losers / hot — try Redis pre-computed lists first
  if ((tab === "gainers" || tab === "losers" || tab === "hot") && !chain && !search) {
    const keyMap: Record<string, string> = {
      gainers: "market:gainers:24h",
      losers:  "market:losers:24h",
      hot:     "market:hot",
    };
    const raw = await redis.get<string>(keyMap[tab]!);
    if (raw) {
      const list = (typeof raw === "string" ? JSON.parse(raw) : raw) as unknown[];
      const sliced = (list as Array<Record<string, unknown>>).slice(offset, offset + limit);
      return c.json({
        success: true,
        data: sliced,
        meta: { page, limit, total: list.length, tab },
      });
    }
    // Redis cold — fall through to live Binance path below
  }

  // ── Load price blob from Redis
  const priceRaw = await redis.get<string>("market:prices");
  const prices: Record<string, {
    price: string; change_24h: string; change_1h: string;
    volume_24h: string; high_24h: string; low_24h: string; source: string;
  }> = priceRaw ? (typeof priceRaw === "string" ? JSON.parse(priceRaw) : priceRaw) : {};

  const hasPrices = Object.keys(prices).length > 0;

  // ── Load tokens from Supabase
  let query = db
    .from("tokens")
    .select("id, symbol, name, logo_url, cmc_rank, chain_ids, is_depositable")
    .eq("is_active", true)
    .order("cmc_rank", { ascending: true });

  if (chain) query = query.contains("chain_ids", [chain]);
  if (search) query = query.or(`symbol.ilike.%${search}%,name.ilike.%${search}%`);

  const { data: tokens, error } = await query;

  if (error) {
    // DB error (e.g. schema mismatch, table missing) — fall back to static coin list with Redis prices
    console.error("[market/coins] DB error, falling back to static list:", error.message);
    const staticCoins = Object.entries(KNOWN_COINS)
      .filter(([sym]) => !search || sym.includes(search) || KNOWN_COINS[sym]?.name.toUpperCase().includes(search))
      .map(([sym, info]) => {
        const p = prices[sym];
        return {
          symbol: sym, name: info.name,
          logo_url: CMC_LOGO(info.cmcId), cmc_rank: info.rank,
          chain_ids: [] as string[], is_depositable: false,
          price:      p?.price      ?? "0",
          change_24h: p?.change_24h ?? "0",
          change_1h:  p?.change_1h  ?? "0",
          volume_24h: p?.volume_24h ?? "0",
          high_24h:   p?.high_24h   ?? "0",
          low_24h:    p?.low_24h    ?? "0",
          source: p ? "coingecko" : "static",
        };
      })
      .sort((a, b) => parseFloat(b.volume_24h) - parseFloat(a.volume_24h) || a.cmc_rank - b.cmc_rank)
      .slice(offset, offset + limit);
    return c.json({
      success: true,
      data: staticCoins,
      meta: { page, limit, total: Object.keys(KNOWN_COINS).length, tab, chain: null, source: "static_fallback" },
    });
  }

  const hasTokens = (tokens ?? []).length > 0;

  // ── If no tokens in DB — use KNOWN_COINS static list merged with Redis prices
  if (!hasTokens) {
    const staticCoins = Object.entries(KNOWN_COINS)
      .filter(([sym]) => !search || sym.includes(search) || KNOWN_COINS[sym]?.name.toUpperCase().includes(search))
      .map(([sym, info]) => {
        const p = prices[sym]; // merge with Redis prices if available
        return {
          symbol: sym, name: info.name,
          logo_url: CMC_LOGO(info.cmcId), cmc_rank: info.rank,
          chain_ids: [] as string[], is_depositable: false,
          price:      p?.price      ?? "0",
          change_24h: p?.change_24h ?? "0",
          change_1h:  p?.change_1h  ?? "0",
          volume_24h: p?.volume_24h ?? "0",
          high_24h:   p?.high_24h   ?? "0",
          low_24h:    p?.low_24h    ?? "0",
          source: p ? "coingecko" : "static",
        };
      })
      .sort((a, b) => {
        // Sort by volume if we have prices, otherwise by rank
        if (a.volume_24h !== "0") return parseFloat(b.volume_24h) - parseFloat(a.volume_24h);
        return a.cmc_rank - b.cmc_rank;
      })
      .slice(offset, offset + limit);
    return c.json({
      success: true,
      data: staticCoins,
      meta: { page, limit, total: Object.keys(KNOWN_COINS).length, tab, chain: null, source: staticCoins[0]?.source === "coingecko" ? "redis_prices" : "static_fallback" },
    });
  }

  // ── Primary path: merge DB tokens with Redis prices
  let merged = (tokens ?? [])
    .map((t) => {
      const p = prices[t.symbol];
      if (!p) return null;
      return {
        symbol:         t.symbol,
        name:           t.name,
        logo_url:       t.logo_url,
        cmc_rank:       t.cmc_rank,
        chain_ids:      t.chain_ids,
        is_depositable: t.is_depositable,
        price:          p.price,
        change_24h:     p.change_24h,
        change_1h:      p.change_1h,
        volume_24h:     p.volume_24h,
        high_24h:       p.high_24h,
        low_24h:        p.low_24h,
        source:         p.source,
      };
    })
    .filter(Boolean) as NonNullable<ReturnType<typeof Array.prototype.map>>[];

  // ── If merged is still empty (tokens exist but no prices matched by symbol yet)
  // Try a case-insensitive match, then fall back to showing tokens with price:0
  if (merged.length === 0) {
    // Build a case-insensitive prices lookup
    const pricesUpper: typeof prices = {};
    for (const [k, v] of Object.entries(prices)) {
      pricesUpper[k.toUpperCase()] = v;
    }
    const noPriceFallback = (tokens ?? []).map((t) => {
      const p = pricesUpper[t.symbol.toUpperCase()];
      return {
        symbol:         t.symbol,
        name:           t.name,
        logo_url:       t.logo_url,
        cmc_rank:       t.cmc_rank,
        chain_ids:      t.chain_ids,
        is_depositable: t.is_depositable,
        price:          p?.price      ?? "0",
        change_24h:     p?.change_24h ?? "0",
        change_1h:      p?.change_1h  ?? "0",
        volume_24h:     p?.volume_24h ?? "0",
        high_24h:       p?.high_24h   ?? "0",
        low_24h:        p?.low_24h    ?? "0",
        source:         p ? "coingecko" : "pending",
      };
    }).slice(offset, offset + limit);
    return c.json({
      success: true,
      data: noPriceFallback,
      meta: { page, limit, total: (tokens ?? []).length, tab, chain: chain || null, source: "no_prices" },
    });
  }

  // ── Tab sorting on merged results
  if (tab === "gainers") {
    merged = [...merged].sort((a, b) =>
      parseFloat((b as { change_24h: string }).change_24h) - parseFloat((a as { change_24h: string }).change_24h)
    );
  } else if (tab === "losers") {
    merged = [...merged].sort((a, b) =>
      parseFloat((a as { change_24h: string }).change_24h) - parseFloat((b as { change_24h: string }).change_24h)
    );
  }

  const total  = merged.length;
  const sliced = merged.slice(offset, offset + limit);

  return c.json({
    success: true,
    data:    sliced,
    meta: { page, limit, total, tab, chain: chain || null },
  });
});

/* ─── GET /coins/:symbol — single coin detail with full metadata ───────── */

market.get("/coins/:symbol", authMiddleware, async (c) => {
  const symbol = c.req.param("symbol").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!symbol) return c.json({ success: false, error: "Invalid symbol", statusCode: 400 }, 400);

  const cacheKey = `coin:detail:${symbol}`;
  const cached = await redis.get(cacheKey);
  if (cached) return c.json({ success: true, data: cached });

  const db = getDb();

  const { data: token, error } = await db
    .from("tokens")
    .select("*")
    .eq("symbol", symbol)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !token) {
    return c.json({ success: false, error: "Coin not found", statusCode: 404 }, 404);
  }

  // Merge current price from Redis
  const priceRaw = await redis.get<string>("market:prices");
  const prices: Record<string, { price: string; change_24h: string; change_1h: string; volume_24h: string; high_24h: string; low_24h: string }> =
    priceRaw ? (typeof priceRaw === "string" ? JSON.parse(priceRaw) : priceRaw) : {};
  const livePrice = prices[symbol];

  const detail = {
    symbol:            token.symbol,
    name:              token.name,
    logo_url:          token.logo_url,
    cmc_rank:          token.cmc_rank,
    description:       token.description,
    whitepaper_url:    token.whitepaper_url,
    website_url:       token.website_url,
    twitter_url:       token.twitter_url,
    telegram_url:      token.telegram_url,
    reddit_url:        token.reddit_url,
    explorer_urls:     token.explorer_urls,
    ath:               token.ath,
    ath_date:          token.ath_date,
    atl:               token.atl,
    atl_date:          token.atl_date,
    circulating_supply:token.circulating_supply,
    max_supply:        token.max_supply,
    chain_ids:         token.chain_ids,
    is_depositable:    token.is_depositable,
    price:             livePrice?.price      ?? "0",
    change_24h:        livePrice?.change_24h ?? "0",
    change_1h:         livePrice?.change_1h  ?? "0",
    volume_24h:        livePrice?.volume_24h ?? "0",
    high_24h:          livePrice?.high_24h   ?? "0",
    low_24h:           livePrice?.low_24h    ?? "0",
  };

  await redis.set(cacheKey, detail, { ex: 60 }); // 1 min cache for detail page
  return c.json({ success: true, data: detail });
});

/* ─── GET /home — bundled home page data in one call ───────────────────── */

market.get("/home", authMiddleware, async (c) => {
  const cacheKeyPrefix = "market:home";

  // Fear & Greed — served from existing cache
  const fearGreed = await redis.get(CacheKeys.fearGreed());

  // Fear & Greed 30-day history for the curve
  const db = getDb();
  const { data: fgHistory } = await db
    .from("fear_greed_history")
    .select("date, value, label")
    .order("date", { ascending: true })
    .limit(30);

  // Get price blob
  const priceRaw = await redis.get<string>("market:prices");
  const prices: Record<string, { price: string; change_24h: string; name: string; logo_url: string }> =
    priceRaw ? (typeof priceRaw === "string" ? JSON.parse(priceRaw) : priceRaw) : {};

  // 2 majors always: BTC + ETH — if missing from Redis, fetch live from Binance
  let majors = ["BTC", "ETH"]
    .map((s) => prices[s] ? { symbol: s, ...prices[s] } : null)
    .filter(Boolean);

  if (majors.length === 0) {
    try {
      const btcEthRes = await fetch(
        "https://api.binance.com/api/v3/ticker/24hr?symbols=[\"BTCUSDT\",\"ETHUSDT\",\"BNBUSDT\",\"SOLUSDT\",\"XRPUSDT\"]",
        { signal: AbortSignal.timeout(5000) }
      );
      if (btcEthRes.ok) {
        const tickers = await btcEthRes.json() as Array<{
          symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string;
        }>;
        const KNOWN_COINS_HOME: Record<string, { name: string; cmcId: number }> = {
          BTC: { name: "Bitcoin",  cmcId: 1    },
          ETH: { name: "Ethereum", cmcId: 1027 },
          BNB: { name: "BNB",      cmcId: 1839 },
          SOL: { name: "Solana",   cmcId: 5426 },
          XRP: { name: "XRP",      cmcId: 52   },
        };
        majors = tickers.map((t) => {
          const sym = t.symbol.replace("USDT", "");
          const info = KNOWN_COINS_HOME[sym];
          return {
            symbol:     sym,
            name:       info?.name ?? sym,
            logo_url:   info ? `https://s2.coinmarketcap.com/static/img/coins/64x64/${info.cmcId}.png` : "",
            price:      t.lastPrice,
            change_24h: t.priceChangePercent,
          };
        }).filter(Boolean) as typeof majors;
      }
    } catch { /* keep majors empty */ }
  }

  // Top 3 gainers from pre-computed list
  const gainersRaw = await redis.get<string>("market:gainers:24h");
  const gainers = gainersRaw
    ? (typeof gainersRaw === "string" ? JSON.parse(gainersRaw) : gainersRaw) as Array<Record<string, string>>
    : [];
  const topGainers = gainers.slice(0, 3);

  // Market overview numbers from Binance global (cached)
  const overviewCacheKey = "market:home:overview";
  let overview = await redis.get(overviewCacheKey);
  if (!overview) {
    try {
      const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const tickers = await res.json() as Array<{ quoteVolume: string }>;
        const totalVolume = tickers.reduce((acc, t) => acc + parseFloat(t.quoteVolume || "0"), 0);
        overview = { totalVolume24h: totalVolume.toFixed(0) };
        await redis.set(overviewCacheKey, overview, { ex: 300 }); // 5 min
      }
    } catch {
      overview = { totalVolume24h: "0" };
    }
  }

  return c.json({
    success: true,
    data: {
      homeCoins:   [...majors, ...topGainers].slice(0, 5),
      fearGreed:   fearGreed ?? { value: 50, classification: "Neutral", timestamp: null },
      fgHistory:   fgHistory ?? [],
      overview,
    },
  });
});

export default market;

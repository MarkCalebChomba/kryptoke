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
  // Serve from Redis cache first — overview is static for 30s, rebuilds in background
  const CACHE_KEY = "market:overview:v3";
  const cached = await redis.get<string>(CACHE_KEY).catch(() => null);
  if (cached) {
    return c.json({ success: true, data: JSON.parse(cached) });
  }

  const db = getDb();
  const [{ data: tokens }, rate, wsprices] = await Promise.all([
    db.from("tokens").select("address,symbol,name,icon_url,is_new,is_seed,rank")
      .eq("is_native", false).order("rank", { ascending: true }).limit(200),
    getExchangeRate(),
    redis.get<Record<string, string>>(CacheKeys.binanceAllTickers()),
  ]);

  // First 60 (rank 1-60) are in the WS stream — include prices from Redis
  // Tokens 61+ include metadata only; client fetches prices on demand
  const WS_LIMIT = 60;
  const overview = (tokens ?? []).map((t, i) => {
    const tickerKey = `${t.symbol}USDT`;
    const inWs      = i < WS_LIMIT;
    const price     = inWs ? (wsprices?.[tickerKey] ?? "0") : "0";
    return {
      address: t.address,
      symbol:  t.symbol,
      name:    t.name,
      price,
      iconUrl: t.icon_url,
      isNew:   t.is_new,
      isSeed:  t.is_seed,
      rank:    (t.rank ?? i + 1),
      volume:  "0",
      kesPrice: price !== "0"
        ? (parseFloat(price) * parseFloat(rate.kesPerUsd)).toFixed(2)
        : "0",
    };
  });

  // Cache for 30 seconds
  await redis.set(CACHE_KEY, JSON.stringify(overview), { ex: 30 }).catch(() => undefined);
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
    "4h": "4h", "day": "1d", "1D": "1d", "1W": "1w", "3m": "3M",
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

    return c.json({ success: true, data: orderBook });
  } catch {
    return c.json({ success: false, error: "Order book unavailable", statusCode: 503 }, 503);
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

    if (!res.ok) throw new Error("Ticker unavailable");

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

    return c.json({ success: true, data: ticker });
  } catch {
    return c.json({ success: false, error: "Ticker unavailable", statusCode: 503 }, 503);
  }
});

/* ─── GET /prices?symbols=BTC,ETH,... — batch price fetch ───────────────── */
// Used by markets page for tokens 61-200 that aren't in the WS stream.
// Returns prices from Binance REST, cached per-symbol for 5s in Redis.

market.get("/prices", authMiddleware, async (c) => {
  const symbolsParam = c.req.query("symbols") ?? "";
  if (!symbolsParam) return c.json({ success: true, data: {} });

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9]{2,12}$/.test(s))
    .slice(0, 50); // max 50 per request

  if (symbols.length === 0) return c.json({ success: true, data: {} });

  // Check Redis for each symbol first
  const result: Record<string, { price: string; change: string; volume: string }> = {};
  const missing: string[] = [];

  for (const sym of symbols) {
    const cached = await redis.get<{ price: string; change: string; volume: string }>(
      `market:price:${sym}`
    ).catch(() => null);
    if (cached) {
      result[sym] = cached;
    } else {
      missing.push(sym);
    }
  }

  // Fetch missing from Binance in parallel (batches of 10)
  if (missing.length > 0) {
    const batchSize = 10;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      const fetches = batch.map(async (sym) => {
        try {
          const res = await fetch(
            `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}USDT`,
            { signal: AbortSignal.timeout(4000) }
          );
          if (!res.ok) return;
          const d = await res.json() as { lastPrice: string; priceChangePercent: string; quoteVolume: string };
          const entry = { price: d.lastPrice, change: d.priceChangePercent, volume: d.quoteVolume };
          result[sym] = entry;
          // Cache 5 seconds
          await redis.set(`market:price:${sym}`, entry, { ex: 5 }).catch(() => undefined);
        } catch { /* skip failed symbols */ }
      });
      await Promise.all(fetches);
    }
  }

  return c.json({ success: true, data: result });
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

/* ─── GET /returns/:symbol — proxied Binance multi-period returns ───────── */

market.get("/returns/:symbol", authMiddleware, async (c) => {
  const { symbol } = c.req.param();
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean || clean.length > 12) {
    return c.json({ success: false, error: "Invalid symbol", statusCode: 400 }, 400);
  }

  const cacheKey = `returns:${clean}`;
  const cached = await redis.get(cacheKey);
  if (cached) return c.json({ success: true, data: cached });

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${clean}USDT&interval=1d&limit=365`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error("Binance klines unavailable");

    const klines = await res.json() as Array<[number, string, string, string, string, ...unknown[]]>;
    if (!klines.length) return c.json({ success: true, data: [] });

    const current = parseFloat(klines[klines.length - 1]?.[4] ?? "0");
    function getChange(daysBack: number): string | null {
      const idx = Math.max(0, klines.length - 1 - daysBack);
      const open = parseFloat(klines[idx]?.[1] ?? "0");
      return open > 0 ? (((current - open) / open) * 100).toFixed(2) : null;
    }

    const data = [
      { label: "Today", change: getChange(1) },
      { label: "7D",    change: getChange(7) },
      { label: "30D",   change: getChange(30) },
      { label: "90D",   change: getChange(90) },
      { label: "180D",  change: getChange(180) },
      { label: "1Y",    change: getChange(364) },
    ];

    await redis.set(cacheKey, data, { ex: 10 * 60 }); // 10 min cache
    return c.json({ success: true, data });
  } catch {
    return c.json({ success: false, error: "Returns data unavailable", statusCode: 503 }, 503);
  }
});

export default market;

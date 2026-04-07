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

/* ─── GET /candles/:tokenAddress ─────────────────────────────────────────── */

// Shared CoinGecko ID map
const CG_ID_MAP: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", USDT: "tether", BNB: "binancecoin",
  SOL: "solana", USDC: "usd-coin", XRP: "ripple", DOGE: "dogecoin",
  TRX: "tron", ADA: "cardano", AVAX: "avalanche-2", SHIB: "shiba-inu",
  LINK: "chainlink", DOT: "polkadot", TON: "the-open-network",
  POL: "matic-network", MATIC: "matic-network", LTC: "litecoin", BCH: "bitcoin-cash",
  UNI: "uniswap", NEAR: "near", ATOM: "cosmos", XLM: "stellar",
  APT: "aptos", ARB: "arbitrum", OP: "optimism", HBAR: "hedera-hashgraph",
  AAVE: "aave", MKR: "maker", GRT: "the-graph", DAI: "dai",
  CRV: "curve-dao-token", LDO: "lido-dao", SAND: "the-sandbox",
  MANA: "decentraland", ALGO: "algorand", VET: "vechain", FIL: "filecoin",
  THETA: "theta-token", AXS: "axie-infinity", KAVA: "kava", ROSE: "oasis-network",
  SUI: "sui", PEPE: "pepe", INJ: "injective-protocol", SEI: "sei-network",
  WIF: "dogwifhat", ONDO: "ondo-finance", RUNE: "thorchain",
  FET: "fetch-ai", RNDR: "render-token", IMX: "immutable-x",
  STX: "blockstack", BONK: "bonk", JUP: "jupiter-exchange-solana",
  PYTH: "pyth-network", TIA: "celestia", WLD: "worldcoin-wld",
  FLOKI: "floki", BLUR: "blur", PENDLE: "pendle", ENS: "ethereum-name-service",
  SNX: "havven", COMP: "compound-governance-token", QNT: "quant-network",
  DYDX: "dydx", XMR: "monero", ZEC: "zcash", CFX: "conflux-token",
  EOS: "eos", XTZ: "tezos", MANTA: "manta-network", EGLD: "elrond-erd-2",
  STRK: "starknet", IOTA: "iota", ZRX: "0x", FLOW: "flow",
  "1INCH": "1inch", KAVA: "kava", ROSE: "oasis-network",
  NEO: "neo", DASH: "dash", DCR: "decred", ZIL: "zilliqa",
  ICX: "icon", QTUM: "qtum", BTT: "bittorrent", HOT: "holotoken",
  SC: "siacoin", ANKR: "ankr", BAND: "band-protocol", ONT: "ontology",
  WAVES: "waves", RVN: "ravencoin", XDC: "xdce-crowd-sale", FTM: "fantom",
  CELO: "celo", OCEAN: "ocean-protocol", AGIX: "singularitynet", NMR: "numeraire",
  HNT: "helium", KSM: "kusama", GALA: "gala", ENJ: "enjincoin",
  BAT: "basic-attention-token", CHZ: "chiliz", AUDIO: "audius",
  SKL: "skale", STORJ: "storj", MASK: "mask-network",
  RAY: "raydium", GMT: "stepn", CELR: "celer-network",
  GLMR: "moonbeam", MOVR: "moonriver", SCRT: "secret",
  WAXP: "wax", KCS: "kucoin-shares", MINA: "mina-protocol",
  COTI: "coti", XEM: "nem", IOST: "iostoken",
  DGB: "digibyte", HIVE: "hive", STEEM: "steem", LSK: "lisk",
  ARK: "ark", NANO: "nano", XNO: "nano",
  SUSHI: "sushi", UMA: "uma", DUSK: "dusk-network",
  GAL: "project-galaxy", LQTY: "liquity", T: "threshold-network-token",
  RDNT: "radiant-capital", JASMY: "jasmycoin", FLUX: "zelcash",
  ILV: "illuvium", DFI: "defichain", SSV: "ssv-network",
  QUICK: "quick", DODO: "dodo", TWT: "trust-wallet-token",
  SFP: "safepal", C98: "coin98", FARM: "harvest-finance",
  BIFI: "beefy-finance", MTL: "metal", ZRX: "0x",
  VRA: "verasity", NKN: "nkn", FIRO: "zcoin",
  REQ: "request-network", PIVX: "pivx", WIN: "wink",
};

const CG_INTERVAL_DAYS: Record<string, number> = {
  "15m": 1, "1h": 1, "hour": 1, "4h": 7, "1d": 30, "day": 30, "1D": 30, "1W": 90,
};

market.get("/candles/:tokenAddress", async (c) => {
  const { tokenAddress } = c.req.param();
  const interval = c.req.query("interval") ?? "1h";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 200);

  const binanceIntervalMap: Record<string, string> = {
    "15m": "15m", "hour": "1h", "1h": "1h",
    "4h": "4h", "day": "1d", "1D": "1d", "1W": "1w", "3m": "3m",
  };
  const binanceInterval = binanceIntervalMap[interval] ?? "1h";
  const cleanSym = tokenAddress.toUpperCase().replace(/USDT$/, "");
  const binanceSym = `${cleanSym}USDT`;

  // Strategy 1: Binance (fast but blocked on Vercel iad1 — try anyway)
  try {
    const candles = await fetchBinanceCandles(binanceSym, binanceInterval, limit);
    if (candles.length > 0) return c.json({ success: true, data: candles, source: "binance" });
  } catch { /* fall through */ }

  // Strategy 2: CoinGecko OHLC — works on Vercel
  const cgId = CG_ID_MAP[cleanSym];
  if (cgId) {
    try {
      const days = CG_INTERVAL_DAYS[interval] ?? 1;
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (cgRes.ok) {
        const raw = await cgRes.json() as Array<[number, number, number, number, number]>;
        const candles: OHLCV[] = raw.slice(-limit).map(([ts, o, h, l, cl]) => ({
          time: Math.floor(ts / 1000),
          open: o.toString(), high: h.toString(),
          low: l.toString(), close: cl.toString(), volume: "0",
        }));
        if (candles.length > 0) return c.json({ success: true, data: candles, source: "coingecko" });
      }
    } catch { /* fall through */ }
  }

  // Strategy 3: look up symbol from DB by address then try CoinGecko
  const db = getDb();
  const { data: token } = await db.from("tokens").select("symbol").eq("address", tokenAddress).maybeSingle();
  if (token?.symbol) {
    const dbCgId = CG_ID_MAP[token.symbol.toUpperCase()];
    if (dbCgId) {
      try {
        const days = CG_INTERVAL_DAYS[interval] ?? 1;
        const r = await fetch(
          `https://api.coingecko.com/api/v3/coins/${dbCgId}/ohlc?vs_currency=usd&days=${days}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (r.ok) {
          const raw = await r.json() as Array<[number, number, number, number, number]>;
          const candles: OHLCV[] = raw.slice(-limit).map(([ts, o, h, l, cl]) => ({
            time: Math.floor(ts / 1000),
            open: o.toString(), high: h.toString(),
            low: l.toString(), close: cl.toString(), volume: "0",
          }));
          if (candles.length > 0) return c.json({ success: true, data: candles, source: "coingecko" });
        }
      } catch { /* fall through */ }
    }
  }

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
  // Top 10
  BTC:   { name: "Bitcoin",            cmcId: 1,     rank: 1   },
  ETH:   { name: "Ethereum",           cmcId: 1027,  rank: 2   },
  USDT:  { name: "Tether",             cmcId: 825,   rank: 3   },
  BNB:   { name: "BNB",                cmcId: 1839,  rank: 4   },
  SOL:   { name: "Solana",             cmcId: 5426,  rank: 5   },
  USDC:  { name: "USD Coin",           cmcId: 3408,  rank: 6   },
  XRP:   { name: "XRP",                cmcId: 52,    rank: 7   },
  DOGE:  { name: "Dogecoin",           cmcId: 74,    rank: 8   },
  TRX:   { name: "TRON",               cmcId: 1958,  rank: 9   },
  ADA:   { name: "Cardano",            cmcId: 2010,  rank: 10  },
  // 11-20
  AVAX:  { name: "Avalanche",          cmcId: 5805,  rank: 11  },
  SHIB:  { name: "Shiba Inu",          cmcId: 5994,  rank: 12  },
  TON:   { name: "Toncoin",            cmcId: 11419, rank: 13  },
  LINK:  { name: "Chainlink",          cmcId: 1975,  rank: 14  },
  DOT:   { name: "Polkadot",           cmcId: 6636,  rank: 15  },
  SUI:   { name: "Sui",                cmcId: 20947, rank: 16  },
  NEAR:  { name: "NEAR Protocol",      cmcId: 6535,  rank: 17  },
  APT:   { name: "Aptos",              cmcId: 21794, rank: 18  },
  LTC:   { name: "Litecoin",           cmcId: 2,     rank: 19  },
  UNI:   { name: "Uniswap",            cmcId: 7083,  rank: 20  },
  // 21-30
  WBTC:  { name: "Wrapped Bitcoin",    cmcId: 3717,  rank: 21  },
  ICP:   { name: "Internet Computer",  cmcId: 8916,  rank: 22  },
  POL:   { name: "Polygon",            cmcId: 3890,  rank: 23  },
  PEPE:  { name: "Pepe",               cmcId: 24478, rank: 24  },
  ARB:   { name: "Arbitrum",           cmcId: 11841, rank: 25  },
  ATOM:  { name: "Cosmos",             cmcId: 3794,  rank: 26  },
  DAI:   { name: "Dai",                cmcId: 4943,  rank: 27  },
  BCH:   { name: "Bitcoin Cash",       cmcId: 1831,  rank: 28  },
  OP:    { name: "Optimism",           cmcId: 11840, rank: 29  },
  INJ:   { name: "Injective",          cmcId: 7226,  rank: 30  },
  // 31-40
  XLM:   { name: "Stellar",            cmcId: 512,   rank: 31  },
  MKR:   { name: "Maker",              cmcId: 1518,  rank: 32  },
  ETC:   { name: "Ethereum Classic",   cmcId: 1321,  rank: 33  },
  HBAR:  { name: "Hedera",             cmcId: 4642,  rank: 34  },
  WIF:   { name: "dogwifhat",          cmcId: 28752, rank: 35  },
  ONDO:  { name: "Ondo Finance",       cmcId: 21159, rank: 36  },
  FIL:   { name: "Filecoin",           cmcId: 2280,  rank: 37  },
  STX:   { name: "Stacks",             cmcId: 4847,  rank: 38  },
  IMX:   { name: "Immutable",          cmcId: 10603, rank: 39  },
  AAVE:  { name: "Aave",               cmcId: 7278,  rank: 40  },
  // 41-50
  VET:   { name: "VeChain",            cmcId: 3077,  rank: 41  },
  FET:   { name: "Fetch.ai",           cmcId: 3773,  rank: 42  },
  RNDR:  { name: "Render",             cmcId: 5690,  rank: 43  },
  GRT:   { name: "The Graph",          cmcId: 6719,  rank: 44  },
  SEI:   { name: "Sei",                cmcId: 23149, rank: 45  },
  LDO:   { name: "Lido DAO",           cmcId: 8000,  rank: 46  },
  ALGO:  { name: "Algorand",           cmcId: 4030,  rank: 47  },
  RUNE:  { name: "THORChain",          cmcId: 4157,  rank: 48  },
  BONK:  { name: "Bonk",              cmcId: 23095, rank: 49  },
  JUP:   { name: "Jupiter",            cmcId: 29210, rank: 50  },
  // 51-60
  PYTH:  { name: "Pyth Network",       cmcId: 28177, rank: 51  },
  TIA:   { name: "Celestia",           cmcId: 22861, rank: 52  },
  WLD:   { name: "Worldcoin",          cmcId: 13502, rank: 53  },
  FLOKI: { name: "Floki",              cmcId: 10804, rank: 54  },
  BLUR:  { name: "Blur",               cmcId: 23121, rank: 55  },
  PENDLE:{ name: "Pendle",             cmcId: 9481,  rank: 56  },
  ENS:   { name: "Ethereum Name Svc",  cmcId: 13855, rank: 57  },
  SNX:   { name: "Synthetix",          cmcId: 2586,  rank: 58  },
  CRV:   { name: "Curve DAO",          cmcId: 6538,  rank: 59  },
  QNT:   { name: "Quant",              cmcId: 3155,  rank: 60  },
  // 61-70
  DYDX:  { name: "dYdX",               cmcId: 11156, rank: 61  },
  XMR:   { name: "Monero",             cmcId: 328,   rank: 62  },
  ZEC:   { name: "Zcash",              cmcId: 1437,  rank: 63  },
  CFX:   { name: "Conflux",            cmcId: 7334,  rank: 64  },
  SAND:  { name: "The Sandbox",        cmcId: 6210,  rank: 65  },
  MANA:  { name: "Decentraland",       cmcId: 1966,  rank: 66  },
  EOS:   { name: "EOS",                cmcId: 1765,  rank: 67  },
  XTZ:   { name: "Tezos",              cmcId: 2011,  rank: 68  },
  COMP:  { name: "Compound",           cmcId: 5692,  rank: 69  },
  MANTA: { name: "Manta Network",      cmcId: 23422, rank: 70  },
  // 71-80
  EGLD:  { name: "MultiversX",         cmcId: 6892,  rank: 71  },
  STRK:  { name: "Starknet",           cmcId: 22691, rank: 72  },
  IOTA:  { name: "IOTA",               cmcId: 1720,  rank: 73  },
  ZRX:   { name: "0x Protocol",        cmcId: 1896,  rank: 74  },
  FLOW:  { name: "Flow",               cmcId: 4558,  rank: 75  },
  1INCH: { name: "1inch Network",      cmcId: 8104,  rank: 76  },
  THETA: { name: "Theta Network",      cmcId: 2416,  rank: 77  },
  KAVA:  { name: "Kava",               cmcId: 4846,  rank: 78  },
  ROSE:  { name: "Oasis Network",      cmcId: 7653,  rank: 79  },
  KCS:   { name: "KuCoin Token",       cmcId: 2087,  rank: 80  },
  // 81-90
  NEO:   { name: "Neo",                cmcId: 1376,  rank: 81  },
  DASH:  { name: "Dash",               cmcId: 131,   rank: 82  },
  DCR:   { name: "Decred",             cmcId: 1168,  rank: 83  },
  ZIL:   { name: "Zilliqa",            cmcId: 2469,  rank: 84  },
  ICX:   { name: "ICON",               cmcId: 2099,  rank: 85  },
  QTUM:  { name: "Qtum",               cmcId: 1684,  rank: 86  },
  BTT:   { name: "BitTorrent",         cmcId: 3718,  rank: 87  },
  HOT:   { name: "Holo",               cmcId: 2682,  rank: 88  },
  SC:    { name: "Siacoin",            cmcId: 1042,  rank: 89  },
  ANKR:  { name: "Ankr",               cmcId: 3783,  rank: 90  },
  // 91-100
  BAND:  { name: "Band Protocol",      cmcId: 4679,  rank: 91  },
  ONT:   { name: "Ontology",           cmcId: 2566,  rank: 92  },
  WAVES: { name: "Waves",              cmcId: 1274,  rank: 93  },
  RVN:   { name: "Ravencoin",          cmcId: 2577,  rank: 94  },
  XDC:   { name: "XDC Network",        cmcId: 2634,  rank: 95  },
  FTM:   { name: "Fantom",             cmcId: 3513,  rank: 96  },
  CELO:  { name: "Celo",               cmcId: 5567,  rank: 97  },
  OCEAN: { name: "Ocean Protocol",     cmcId: 3911,  rank: 98  },
  AGIX:  { name: "SingularityNET",     cmcId: 2424,  rank: 99  },
  NMR:   { name: "Numeraire",          cmcId: 1732,  rank: 100 },
  // 101-110
  HNT:   { name: "Helium",             cmcId: 5665,  rank: 101 },
  KSM:   { name: "Kusama",             cmcId: 5034,  rank: 102 },
  GALA:  { name: "Gala",               cmcId: 7080,  rank: 103 },
  AXS:   { name: "Axie Infinity",      cmcId: 6783,  rank: 104 },
  ENJ:   { name: "Enjin Coin",         cmcId: 2130,  rank: 105 },
  BAT:   { name: "Basic Attn Token",   cmcId: 1697,  rank: 106 },
  CHZ:   { name: "Chiliz",             cmcId: 4066,  rank: 107 },
  AUDIO: { name: "Audius",             cmcId: 7455,  rank: 108 },
  SKL:   { name: "SKALE",              cmcId: 5765,  rank: 109 },
  STORJ: { name: "Storj",              cmcId: 1772,  rank: 110 },
  // 111-120
  ALICE: { name: "My Neighbor Alice",  cmcId: 8766,  rank: 111 },
  MASK:  { name: "Mask Network",       cmcId: 8536,  rank: 112 },
  RAY:   { name: "Raydium",            cmcId: 8526,  rank: 113 },
  ORCA:  { name: "Orca",               cmcId: 11165, rank: 114 },
  GMT:   { name: "STEPN",              cmcId: 18069, rank: 115 },
  GST:   { name: "Green Satoshi Tkn",  cmcId: 18168, rank: 116 },
  LUNC:  { name: "Terra Classic",      cmcId: 4172,  rank: 117 },
  USTC:  { name: "TerraUSD Classic",   cmcId: 7129,  rank: 118 },
  PEOPLE:{ name: "ConstitutionDAO",    cmcId: 15238, rank: 119 },
  SUPER: { name: "SuperVerse",         cmcId: 8290,  rank: 120 },
  // 121-130
  SPELL: { name: "Spell Token",        cmcId: 11289, rank: 121 },
  SUSHI: { name: "SushiSwap",          cmcId: 6758,  rank: 122 },
  UMA:   { name: "UMA",                cmcId: 5617,  rank: 123 },
  BNX:   { name: "BinaryX",            cmcId: 10406, rank: 124 },
  CTSI:  { name: "Cartesi",            cmcId: 5444,  rank: 125 },
  CEEK:  { name: "CEEK Smart VR",      cmcId: 2856,  rank: 126 },
  TWT:   { name: "Trust Wallet Tkn",   cmcId: 5964,  rank: 127 },
  LOKA:  { name: "League of Kingdoms", cmcId: 15816, rank: 128 },
  POLS:  { name: "Polkastarter",       cmcId: 7461,  rank: 129 },
  MBOX:  { name: "Mobox",              cmcId: 9175,  rank: 130 },
  // 131-140
  SSV:   { name: "SSV Network",        cmcId: 15619, rank: 131 },
  BAKE:  { name: "BakeryToken",        cmcId: 7064,  rank: 132 },
  BURGER:{ name: "BurgerCities",       cmcId: 7158,  rank: 133 },
  C98:   { name: "Coin98",             cmcId: 10903, rank: 134 },
  CHESS: { name: "Tranchess",          cmcId: 11284, rank: 135 },
  LIT:   { name: "Litentry",           cmcId: 9456,  rank: 136 },
  ACH:   { name: "Alchemy Pay",        cmcId: 6958,  rank: 137 },
  DAR:   { name: "Mine of Dalarnia",   cmcId: 11374, rank: 138 },
  NULS:  { name: "NULS",               cmcId: 2092,  rank: 139 },
  OG:    { name: "OG Fan Token",       cmcId: 7055,  rank: 140 },
  // 141-150
  CELR:  { name: "Celer Network",      cmcId: 3673,  rank: 141 },
  DUSK:  { name: "Dusk Network",       cmcId: 4092,  rank: 142 },
  GLMR:  { name: "Moonbeam",           cmcId: 6836,  rank: 143 },
  MOVR:  { name: "Moonriver",          cmcId: 9285,  rank: 144 },
  SCRT:  { name: "Secret",             cmcId: 5604,  rank: 145 },
  POND:  { name: "Marlin",             cmcId: 7371,  rank: 146 },
  ATA:   { name: "Automata Network",   cmcId: 8985,  rank: 147 },
  WAXP:  { name: "WAX",                cmcId: 2300,  rank: 148 },
  ARDR:  { name: "Ardor",              cmcId: 1320,  rank: 149 },
  CLV:   { name: "Clover Finance",     cmcId: 8911,  rank: 150 },
  // 151-160
  PUNDIX:{ name: "Pundi X",            cmcId: 9696,  rank: 151 },
  BEL:   { name: "Bella Protocol",     cmcId: 6928,  rank: 152 },
  MDT:   { name: "Measurable Data Tkn",cmcId: 2441,  rank: 153 },
  OOKI:  { name: "Ooki Protocol",      cmcId: 12521, rank: 154 },
  RDNT:  { name: "Radiant Capital",    cmcId: 20764, rank: 155 },
  GAL:   { name: "Galxe",              cmcId: 15346, rank: 156 },
  T:     { name: "Threshold Network",  cmcId: 15968, rank: 157 },
  LQTY:  { name: "Liquity",            cmcId: 9816,  rank: 158 },
  QUICK: { name: "QuickSwap",          cmcId: 8206,  rank: 159 },
  AUCTION:{ name:"Bounce Finance",     cmcId: 8602,  rank: 160 },
  // 161-170
  DODO:  { name: "DODO",               cmcId: 7224,  rank: 161 },
  AKRO:  { name: "Akropolis",          cmcId: 4134,  rank: 162 },
  FARM:  { name: "Harvest Finance",    cmcId: 6859,  rank: 163 },
  FRONT: { name: "Frontier",           cmcId: 5893,  rank: 164 },
  BETA:  { name: "Beta Finance",       cmcId: 11307, rank: 165 },
  BIFI:  { name: "Beefy Finance",      cmcId: 7311,  rank: 166 },
  JASMY: { name: "JasmyCoin",          cmcId: 9816,  rank: 167 },
  FLUX:  { name: "Flux",               cmcId: 3029,  rank: 168 },
  VRA:   { name: "Verasity",           cmcId: 3816,  rank: 169 },
  MTL:   { name: "Metal DAO",          cmcId: 1788,  rank: 170 },
  // 171-180
  ALCX:  { name: "Alchemix",           cmcId: 8613,  rank: 171 },
  WILD:  { name: "Wilder World",       cmcId: 10454, rank: 172 },
  BADGER:{ name: "Badger DAO",         cmcId: 7859,  rank: 173 },
  SFP:   { name: "SafePal",            cmcId: 8285,  rank: 174 },
  PROM:  { name: "Prom",               cmcId: 4126,  rank: 175 },
  ILV:   { name: "Illuvium",           cmcId: 8719,  rank: 176 },
  MINA:  { name: "Mina Protocol",      cmcId: 8646,  rank: 177 },
  DFI:   { name: "DeFiChain",          cmcId: 5804,  rank: 178 },
  COTI:  { name: "COTI",               cmcId: 3992,  rank: 179 },
  XEM:   { name: "NEM",                cmcId: 873,   rank: 180 },
  // 181-190
  IOST:  { name: "IOST",               cmcId: 2405,  rank: 181 },
  WAXE:  { name: "WAX Economic Token", cmcId: 9678,  rank: 182 },
  KEY:   { name: "SelfKey",            cmcId: 2398,  rank: 183 },
  OXT:   { name: "Orchid",             cmcId: 5026,  rank: 184 },
  FIRO:  { name: "Firo",               cmcId: 1414,  rank: 185 },
  REQ:   { name: "Request",            cmcId: 2071,  rank: 186 },
  DGB:   { name: "DigiByte",           cmcId: 109,   rank: 187 },
  NKN:   { name: "NKN",                cmcId: 2780,  rank: 188 },
  PIVX:  { name: "PIVX",               cmcId: 1169,  rank: 189 },
  XVG:   { name: "Verge",              cmcId: 693,   rank: 190 },
  // 191-200
  WIN:   { name: "WINkLink",           cmcId: 4206,  rank: 191 },
  SXP:   { name: "Solar",              cmcId: 4278,  rank: 192 },
  STEEM: { name: "Steem",              cmcId: 1230,  rank: 193 },
  HIVE:  { name: "Hive",               cmcId: 5370,  rank: 194 },
  LSK:   { name: "Lisk",               cmcId: 1214,  rank: 195 },
  ARK:   { name: "Ark",                cmcId: 1586,  rank: 196 },
  NANO:  { name: "Nano",               cmcId: 1567,  rank: 197 },
  XNO:   { name: "Nano (XNO)",         cmcId: 1567,  rank: 198 },
  PAX:   { name: "Pax Dollar",         cmcId: 3289,  rank: 199 },
  BUSD:  { name: "Binance USD",        cmcId: 4687,  rank: 200 },
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
  let fearGreed = await redis.get<{ value: number; classification: string; timestamp: string | null }>(CacheKeys.fearGreed());

  // Fear & Greed 30-day history for the curve
  const db = getDb();
  const { data: fgHistory } = await db
    .from("fear_greed_history")
    .select("date, value, label")
    .order("date", { ascending: true })
    .limit(30);

  // If Redis cache is cold, populate from DB history
  if (!fearGreed && fgHistory && fgHistory.length > 0) {
    const latest = fgHistory[fgHistory.length - 1];
    if (latest) {
      fearGreed = { value: latest.value, classification: latest.label, timestamp: null };
      // Re-seed Redis so next call is fast
      redis.set(CacheKeys.fearGreed(), fearGreed, { ex: 60 * 60 }).catch(() => undefined);
    }
  }

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

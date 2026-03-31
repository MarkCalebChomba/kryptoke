/**
 * scripts/import-coins.ts
 *
 * One-time script: pulls top 300 coins from CoinMarketCap, enriches with
 * metadata, cross-references with Binance/OKX/Bybit/Bitget, and writes
 * everything to Supabase. Run once locally:
 *
 *   npx tsx scripts/import-coins.ts
 *
 * Prerequisites:
 *   - CMC_API_KEY in .env.local
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load env
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const CMC_API_KEY     = process.env.CMC_API_KEY!;
const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!CMC_API_KEY)   throw new Error("CMC_API_KEY is required in .env.local");
if (!SUPABASE_URL)  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
if (!SUPABASE_KEY)  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Chains that KryptoKe supports for deposits ────────────────────────────────
// These are the chain IDs from your wallet infrastructure
const DEPOSITABLE_CHAINS = new Set([
  "1",     // Ethereum
  "56",    // BNB Smart Chain
  "137",   // Polygon
  "42161", // Arbitrum
  "10",    // Optimism
  "8453",  // Base
  "250",   // Fantom
  "TRON",  // Tron
  "BTC",   // Bitcoin
  "SOL",   // Solana
  "XRP",   // XRP
  "TON",   // TON
  "XLM",   // Stellar
  "LTC",   // Litecoin
  "DOGE",  // Dogecoin
  "BCH",   // Bitcoin Cash
  "NEAR",  // NEAR
  "FIL",   // Filecoin
]);

// Map CMC platform IDs to our chain IDs
const CMC_PLATFORM_TO_CHAIN: Record<string, string> = {
  "1":    "1",     // Ethereum
  "1839": "56",    // BNB Chain
  "137":  "137",   // Polygon
  "42161":"42161", // Arbitrum
  "10":   "10",    // Optimism
  "8453": "8453",  // Base
  "250":  "250",   // Fantom
  "1958": "TRON",  // Tron (CMC id for Tron network)
  "4030": "SOL",   // Solana
};

// Native coin symbol → chain ID mapping
const NATIVE_SYMBOL_TO_CHAIN: Record<string, string> = {
  BTC:  "BTC",
  ETH:  "1",
  BNB:  "56",
  SOL:  "SOL",
  XRP:  "XRP",
  TRX:  "TRON",
  TON:  "TON",
  XLM:  "XLM",
  LTC:  "LTC",
  DOGE: "DOGE",
  BCH:  "BCH",
  NEAR: "NEAR",
  FIL:  "FIL",
  ADA:  "ADA",
  DOT:  "DOT",
  AVAX: "AVAX",
  MATIC:"137",
  ATOM: "ATOM",
};

// ── Step 1: Fetch top 300 from CMC listings ────────────────────────────────────
async function fetchCmcListings() {
  console.log("📡 Fetching CMC top 300 listings...");
  const url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest" +
    "?start=1&limit=300&convert=USD&sort=market_cap&sort_dir=desc";

  const res = await fetch(url, {
    headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CMC listings failed: ${res.status} ${text}`);
  }

  const json = await res.json() as {
    data: Array<{
      id: number;
      name: string;
      symbol: string;
      cmc_rank: number;
      platform?: { id: number; name: string; symbol: string; slug: string; token_address: string } | null;
      quote: { USD: { price: number; volume_24h: number; percent_change_24h: number } };
    }>;
  };

  console.log(`✅ Got ${json.data.length} coins from CMC`);
  return json.data;
}

// ── Step 2: Fetch metadata for all 300 in batches ─────────────────────────────
async function fetchCmcMetadata(ids: number[]) {
  console.log("📡 Fetching CMC metadata for all coins...");
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += 100) {
    batches.push(ids.slice(i, i + 100));
  }

  const allMeta: Record<number, {
    description?: string;
    urls?: {
      website?: string[];
      technical_doc?: string[];
      twitter?: string[];
      reddit?: string[];
      explorer?: string[];
      telegram?: string[];
    };
    logo?: string;
  }> = {};

  for (const batch of batches) {
    const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?id=${batch.join(",")}`;
    const res = await fetch(url, {
      headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`⚠️ Metadata batch failed for ids: ${batch.slice(0, 3).join(",")}...`);
      continue;
    }
    const json = await res.json() as { data: Record<string, typeof allMeta[number]> };
    for (const [id, meta] of Object.entries(json.data)) {
      allMeta[parseInt(id)] = meta;
    }
    // Respect CMC rate limits
    await sleep(500);
  }

  console.log(`✅ Got metadata for ${Object.keys(allMeta).length} coins`);
  return allMeta;
}

// ── Step 3: Fetch all available pairs from each exchange ──────────────────────
async function fetchExchangePairs(): Promise<{
  binance: Set<string>;
  okx: Set<string>;
  bybit: Set<string>;
  bitget: Set<string>;
}> {
  console.log("📡 Fetching available pairs from all exchanges...");

  const [binanceRes, okxRes, bybitRes, bitgetRes] = await Promise.allSettled([
    fetch("https://api.binance.com/api/v3/exchangeInfo", { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.json() as Promise<{ symbols: Array<{ symbol: string; baseAsset: string; quoteAsset: string; status: string }> }>)
      .then((d) => new Set(
        d.symbols
          .filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT")
          .map((s) => s.baseAsset)
      )),

    fetch("https://www.okx.com/api/v5/public/instruments?instType=SPOT", { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.json() as Promise<{ data: Array<{ instId: string; baseCcy: string; quoteCcy: string; state: string }> }>)
      .then((d) => new Set(
        d.data
          .filter((s) => s.quoteCcy === "USDT" && s.state === "live")
          .map((s) => s.baseCcy)
      )),

    fetch("https://api.bybit.com/v5/market/instruments-info?category=spot", { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.json() as Promise<{ result: { list: Array<{ symbol: string; baseCoin: string; quoteCoin: string; status: string }> } }>)
      .then((d) => new Set(
        d.result.list
          .filter((s) => s.quoteCoin === "USDT" && s.status === "Trading")
          .map((s) => s.baseCoin)
      )),

    fetch("https://api.bitget.com/api/v2/spot/public/symbols", { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.json() as Promise<{ data: Array<{ symbol: string; baseCoin: string; quoteCoin: string; status: string }> }>)
      .then((d) => new Set(
        d.data
          .filter((s) => s.quoteCoin === "USDT" && s.status === "online")
          .map((s) => s.baseCoin)
      )),
  ]);

  const result = {
    binance: binanceRes.status === "fulfilled" ? binanceRes.value : new Set<string>(),
    okx:     okxRes.status === "fulfilled"     ? okxRes.value     : new Set<string>(),
    bybit:   bybitRes.status === "fulfilled"   ? bybitRes.value   : new Set<string>(),
    bitget:  bitgetRes.status === "fulfilled"  ? bitgetRes.value  : new Set<string>(),
  };

  console.log(`✅ Exchange coverage: Binance=${result.binance.size} OKX=${result.okx.size} Bybit=${result.bybit.size} Bitget=${result.bitget.size}`);
  return result;
}

// ── Step 4: Determine chain IDs for a coin ────────────────────────────────────
function resolveChains(
  symbol: string,
  platform: { id: number } | null | undefined,
): string[] {
  const chains = new Set<string>();

  // Native coins
  const nativeChain = NATIVE_SYMBOL_TO_CHAIN[symbol];
  if (nativeChain) chains.add(nativeChain);

  // Token on a platform
  if (platform) {
    const chain = CMC_PLATFORM_TO_CHAIN[String(platform.id)];
    if (chain) chains.add(chain);
  }

  return Array.from(chains);
}

// ── Step 5: Main import ───────────────────────────────────────────────────────
async function main() {
  console.log("\n🚀 KryptoKe Coin Import — starting\n");

  const [listings, exchangePairs] = await Promise.all([
    fetchCmcListings(),
    fetchExchangePairs(),
  ]);

  const cmcIds = listings.map((l) => l.id);
  const metadata = await fetchCmcMetadata(cmcIds);

  console.log("\n📊 Processing coins...\n");

  let inserted = 0;
  let skipped  = 0;
  let noExchange = 0;

  for (const coin of listings) {
    const meta = metadata[coin.id];

    // ── Critical data checks ──────────────────────────────────────────────────
    if (!meta?.logo) {
      console.warn(`⚠️  SKIP ${coin.symbol} — no logo`);
      skipped++;
      continue;
    }

    if (!meta?.description || meta.description.trim().length < 10) {
      console.warn(`⚠️  SKIP ${coin.symbol} — no description`);
      skipped++;
      continue;
    }

    // ── Exchange mapping ──────────────────────────────────────────────────────
    const pairs: Array<{ exchange: string; pair_symbol: string; is_primary: boolean }> = [];

    const EXCHANGE_ORDER: Array<{ key: keyof typeof exchangePairs; name: string; formatPair: (s: string) => string }> = [
      { key: "binance", name: "binance", formatPair: (s) => `${s}USDT` },
      { key: "okx",     name: "okx",     formatPair: (s) => `${s}-USDT` },
      { key: "bybit",   name: "bybit",   formatPair: (s) => `${s}USDT` },
      { key: "bitget",  name: "bitget",  formatPair: (s) => `${s}USDT` },
    ];

    let primarySet = false;
    for (const ex of EXCHANGE_ORDER) {
      if (exchangePairs[ex.key].has(coin.symbol)) {
        pairs.push({
          exchange: ex.name,
          pair_symbol: ex.formatPair(coin.symbol),
          is_primary: !primarySet,
        });
        primarySet = true;
      }
    }

    if (pairs.length === 0) {
      console.warn(`⚠️  SKIP ${coin.symbol} — not on any supported exchange`);
      noExchange++;
      continue;
    }

    // ── Determine chain info ──────────────────────────────────────────────────
    const chainIds = resolveChains(coin.symbol, coin.platform ?? null);
    const isDepositable = chainIds.some((c) => DEPOSITABLE_CHAINS.has(c));

    // ── Build token row ───────────────────────────────────────────────────────
    const urls = meta.urls ?? {};
    const tokenRow = {
      cmc_id:             coin.id,
      symbol:             coin.symbol,
      name:               coin.name,
      logo_url:           meta.logo,
      cmc_rank:           coin.cmc_rank,
      description:        meta.description?.trim().slice(0, 2000) ?? null,
      whitepaper_url:     urls.technical_doc?.[0] ?? null,
      website_url:        urls.website?.[0] ?? null,
      twitter_url:        urls.twitter?.[0] ?? null,
      telegram_url:       urls.telegram?.[0] ?? null,
      reddit_url:         urls.reddit?.[0] ?? null,
      explorer_urls:      urls.explorer?.slice(0, 5) ?? [],
      ath:                null, // CMC free tier doesn't include ATH — leave null
      ath_date:           null,
      atl:                null,
      atl_date:           null,
      circulating_supply: null,
      max_supply:         null,
      chain_ids:          chainIds,
      is_depositable:     isDepositable,
      is_active:          true,
    };

    // ── Upsert token ──────────────────────────────────────────────────────────
    const { data: tokenData, error: tokenError } = await db
      .from("tokens")
      .upsert(tokenRow, { onConflict: "cmc_id" })
      .select("id")
      .single();

    if (tokenError || !tokenData) {
      console.error(`❌ Failed to insert ${coin.symbol}:`, tokenError?.message);
      skipped++;
      continue;
    }

    // ── Insert exchange pairs ─────────────────────────────────────────────────
    const pairRows = pairs.map((p) => ({ ...p, token_id: tokenData.id }));
    const { error: pairError } = await db
      .from("token_exchange_pairs")
      .upsert(pairRows, { onConflict: "token_id,exchange" });

    if (pairError) {
      console.warn(`⚠️  Exchange pairs failed for ${coin.symbol}:`, pairError.message);
    }

    console.log(`✅ ${coin.symbol.padEnd(8)} rank=${String(coin.cmc_rank).padStart(3)} exchanges=[${pairs.map((p) => p.exchange).join(",")}] depositable=${isDepositable}`);
    inserted++;

    // Avoid hammering Supabase
    if (inserted % 50 === 0) await sleep(200);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Import complete
   Inserted:    ${inserted}
   Skipped:     ${skipped} (missing logo/description)
   No exchange: ${noExchange}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("\n💥 Import failed:", err);
  process.exit(1);
});

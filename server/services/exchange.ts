/**
 * Exchange Routing Service
 * Routes futures orders to OKX (primary) with Binance/Bybit fallbacks.
 * Admin can hot-swap keys from /admin/settings without restart.
 */
import { getDb } from "@/server/db/client";
import { redis } from "@/lib/redis/client";

export interface ExchangeOrder {
  exchange: string;
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  positionSide: "long" | "short";
  price: string;
  quantity: string;
  status: string;
  fee: number;
  spread: number;
}

export interface ExchangeKey {
  id: string;
  exchange: "okx" | "binance" | "bybit";
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  isTestnet: boolean;
  priority: number;
}

// Cache keys in Redis for 30s so admin changes propagate fast
const KEYS_CACHE = "exchange:keys:active";

export async function getActiveKeys(): Promise<ExchangeKey[]> {
  const cached = await redis.get<ExchangeKey[]>(KEYS_CACHE).catch(() => null);
  if (cached) return cached;

  const db = getDb();
  const { data } = await db
    .from("exchange_keys")
    .select("id,exchange,api_key,api_secret,passphrase,is_testnet,priority")
    .eq("is_active", true)
    .order("priority", { ascending: true });

  const keys: ExchangeKey[] = (data ?? []).map((r) => ({
    id: r.id,
    exchange: r.exchange as ExchangeKey["exchange"],
    apiKey: r.api_key,
    apiSecret: r.api_secret,
    passphrase: r.passphrase ?? undefined,
    isTestnet: r.is_testnet,
    priority: r.priority,
  }));

  await redis.set(KEYS_CACHE, keys, { ex: 30 }).catch(() => undefined);
  return keys;
}

/** Invalidate key cache — call after admin updates keys */
export async function invalidateKeyCache() {
  await redis.del(KEYS_CACHE).catch(() => undefined);
}

// ── OKX ────────────────────────────────────────────────────────────────────

import crypto from "crypto";

function okxSign(timestamp: string, method: string, path: string, body: string, secret: string): string {
  const msg = `${timestamp}${method}${path}${body}`;
  return crypto.createHmac("sha256", secret).update(msg).digest("base64");
}

async function okxRequest(key: ExchangeKey, method: string, path: string, body?: object): Promise<unknown> {
  const base = key.isTestnet ? "https://www.okx.com" : "https://www.okx.com";
  const timestamp = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const sign = okxSign(timestamp, method.toUpperCase(), path, bodyStr, key.apiSecret);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY":        key.apiKey,
    "OK-ACCESS-SIGN":       sign,
    "OK-ACCESS-TIMESTAMP":  timestamp,
    "OK-ACCESS-PASSPHRASE": key.passphrase ?? "",
    "Content-Type":         "application/json",
    "x-simulated-trading":  key.isTestnet ? "1" : "0",
  };

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: bodyStr || undefined,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`OKX HTTP ${res.status}`);
  const json = await res.json() as { code: string; msg: string; data: unknown[] };
  if (json.code !== "0") throw new Error(`OKX error: ${json.msg}`);
  return json.data[0];
}

export async function okxGetMarkPrice(symbol: string): Promise<string> {
  const instId = `${symbol}-USDT-SWAP`;
  const data = await okxRequest({ } as ExchangeKey, "GET",
    `/api/v5/public/mark-price?instId=${instId}`) as { markPx: string };
  return data.markPx;
}

export async function okxPlaceOrder(key: ExchangeKey, params: {
  symbol: string;
  side: "long" | "short";
  quantity: string;
  orderType: "market" | "limit";
  price?: string;
  tpPrice?: string;
  slPrice?: string;
  leverage: number;
}): Promise<ExchangeOrder> {
  const instId = `${params.symbol}-USDT-SWAP`;

  // Set leverage first
  await okxRequest(key, "POST", "/api/v5/account/set-leverage", {
    instId, lever: String(params.leverage), mgnMode: "cross",
  }).catch(() => undefined); // non-fatal

  const orderSide = params.side === "long" ? "buy" : "sell";
  const body: Record<string, string> = {
    instId,
    tdMode: "cross",
    side: orderSide,
    posSide: params.side,
    ordType: params.orderType === "limit" ? "limit" : "market",
    sz: params.quantity,
  };
  if (params.orderType === "limit" && params.price) body.px = params.price;
  if (params.tpPrice) { body.tpTriggerPx = params.tpPrice; body.tpOrdPx = "-1"; }
  if (params.slPrice) { body.slTriggerPx = params.slPrice; body.slOrdPx = "-1"; }

  const result = await okxRequest(key, "POST", "/api/v5/trade/order", body) as { ordId: string; avgPx: string };
  return {
    exchange: "okx",
    orderId: result.ordId,
    symbol: params.symbol,
    side: orderSide,
    positionSide: params.side,
    price: result.avgPx ?? params.price ?? "0",
    quantity: params.quantity,
    status: "filled",
    fee: 0.05,
    spread: 0,
  };
}

export async function okxClosePosition(key: ExchangeKey, params: {
  symbol: string;
  side: "long" | "short";
  quantity: string;
}): Promise<ExchangeOrder> {
  const instId = `${params.symbol}-USDT-SWAP`;
  const closeSide = params.side === "long" ? "sell" : "buy";
  const result = await okxRequest(key, "POST", "/api/v5/trade/order", {
    instId, tdMode: "cross", side: closeSide, posSide: params.side,
    ordType: "market", sz: params.quantity,
  }) as { ordId: string; avgPx: string };
  return {
    exchange: "okx", orderId: result.ordId,
    symbol: params.symbol, side: closeSide, positionSide: params.side,
    price: result.avgPx ?? "0", quantity: params.quantity, status: "filled",
    fee: 0.05, spread: 0,
  };
}

// ── Binance Futures fallback ────────────────────────────────────────────────

function bnbSign(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function binanceFuturesRequest(key: ExchangeKey, method: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const base = key.isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
  const ts = Date.now().toString();
  const allParams = { ...params, timestamp: ts };
  const qs = new URLSearchParams(allParams).toString();
  const sig = bnbSign(qs, key.apiSecret);
  const url = `${base}${path}?${qs}&signature=${sig}`;
  const res = await fetch(url, {
    method,
    headers: { "X-MBX-APIKEY": key.apiKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(`Binance: ${JSON.stringify(err)}`); }
  return res.json();
}

export async function binancePlaceOrder(key: ExchangeKey, params: {
  symbol: string;
  side: "long" | "short";
  quantity: string;
  orderType: "market" | "limit";
  price?: string;
  leverage: number;
}): Promise<ExchangeOrder> {
  // Set leverage
  await binanceFuturesRequest(key, "POST", "/fapi/v1/leverage", {
    symbol: `${params.symbol}USDT`, leverage: String(params.leverage),
  }).catch(() => undefined);

  const orderParams: Record<string, string> = {
    symbol: `${params.symbol}USDT`,
    side: params.side === "long" ? "BUY" : "SELL",
    type: params.orderType === "limit" ? "LIMIT" : "MARKET",
    quantity: params.quantity,
    positionSide: params.side === "long" ? "LONG" : "SHORT",
  };
  if (params.orderType === "limit" && params.price) {
    orderParams.price = params.price;
    orderParams.timeInForce = "GTC";
  }

  const result = await binanceFuturesRequest(key, "POST", "/fapi/v1/order", orderParams) as { orderId: number; avgPrice: string };
  return {
    exchange: "binance", orderId: String(result.orderId),
    symbol: params.symbol, side: params.side === "long" ? "buy" : "sell",
    positionSide: params.side, price: result.avgPrice ?? params.price ?? "0",
    quantity: params.quantity, status: "filled", fee: 0.05, spread: 0,
  };
}

// ── Bybit fallback ─────────────────────────────────────────────────────────

function bybitSign(params: Record<string, string>, secret: string, timestamp: string): string {
  const paramStr = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  const str = `${timestamp}${paramStr}`;
  return crypto.createHmac("sha256", secret).update(str).digest("hex");
}

async function bybitRequest(key: ExchangeKey, method: string, path: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const base = key.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
  const timestamp = Date.now().toString();
  const params: Record<string, string> = {};
  Object.entries(body).forEach(([k, v]) => { params[k] = String(v); });
  const sign = bybitSign(params, key.apiSecret, timestamp);
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "X-BAPI-API-KEY":       key.apiKey,
      "X-BAPI-SIGN":          sign,
      "X-BAPI-TIMESTAMP":     timestamp,
      "X-BAPI-RECV-WINDOW":   "5000",
      "Content-Type":         "application/json",
    },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Bybit HTTP ${res.status}`);
  const json = await res.json() as { retCode: number; retMsg: string; result: unknown };
  if (json.retCode !== 0) throw new Error(`Bybit: ${json.retMsg}`);
  return json.result;
}

export async function bybitPlaceOrder(key: ExchangeKey, params: {
  symbol: string;
  side: "long" | "short";
  quantity: string;
  orderType: "market" | "limit";
  price?: string;
  leverage: number;
}): Promise<ExchangeOrder> {
  await bybitRequest(key, "POST", "/v5/position/set-leverage", {
    category: "linear", symbol: `${params.symbol}USDT`,
    buyLeverage: String(params.leverage), sellLeverage: String(params.leverage),
  }).catch(() => undefined);

  const result = await bybitRequest(key, "POST", "/v5/order/create", {
    category: "linear",
    symbol: `${params.symbol}USDT`,
    side: params.side === "long" ? "Buy" : "Sell",
    orderType: params.orderType === "limit" ? "Limit" : "Market",
    qty: params.quantity,
    ...(params.orderType === "limit" && params.price ? { price: params.price } : {}),
  }) as { orderId: string; avgPrice: string };

  return {
    exchange: "bybit", orderId: result.orderId,
    symbol: params.symbol, side: params.side === "long" ? "buy" : "sell",
    positionSide: params.side, price: result.avgPrice ?? params.price ?? "0",
    quantity: params.quantity, status: "filled", fee: 0.05, spread: 0,
  };
}

// ── Smart router — tries primary, falls back on error ──────────────────────

export async function routeOrderToExchange(params: {
  symbol: string;
  side: "long" | "short";
  quantity: string;
  orderType: "market" | "limit";
  price?: string;
  tpPrice?: string;
  slPrice?: string;
  leverage: number;
}): Promise<ExchangeOrder> {
  const keys = await getActiveKeys();
  if (keys.length === 0) throw new Error("No active exchange keys configured. Add keys in Admin → Settings.");

  const errors: string[] = [];
  for (const key of keys) {
    try {
      let result: ExchangeOrder;
      if (key.exchange === "okx") {
        result = await okxPlaceOrder(key, params);
      } else if (key.exchange === "binance") {
        result = await binancePlaceOrder(key, params);
      } else {
        result = await bybitPlaceOrder(key, params);
      }
      // Update last_used_at and reset error_count
      const db = getDb();
      await db.from("exchange_keys")
        .update({ last_used_at: new Date().toISOString(), error_count: 0 })
        .eq("id", key.id).catch(() => undefined);
      return result;
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`[${key.exchange}] ${msg}`);
      // Increment error count for monitoring
      const db = getDb();
      await db.from("exchange_keys")
        .update({ error_count: key.priority }) // simplified increment
        .eq("id", key.id).catch(() => undefined);
    }
  }
  throw new Error(`All exchanges failed: ${errors.join("; ")}`);
}

export async function routeCloseToExchange(params: {
  symbol: string;
  side: "long" | "short";
  quantity: string;
  exchange?: string;
  exchangeOrderId?: string;
}): Promise<ExchangeOrder> {
  const keys = await getActiveKeys();
  // Prefer the same exchange that opened the position
  const preferred = params.exchange
    ? keys.find(k => k.exchange === params.exchange) ?? keys[0]
    : keys[0];
  if (!preferred) throw new Error("No active exchange keys");

  if (preferred.exchange === "okx") {
    return okxClosePosition(preferred, params);
  }
  // For Binance/Bybit we open a reverse order
  if (preferred.exchange === "binance") {
    return binancePlaceOrder(preferred, {
      symbol: params.symbol,
      side: params.side === "long" ? "short" : "long", // reverse
      quantity: params.quantity,
      orderType: "market",
      leverage: 1,
    });
  }
  return bybitPlaceOrder(preferred, {
    symbol: params.symbol,
    side: params.side === "long" ? "short" : "long",
    quantity: params.quantity,
    orderType: "market",
    leverage: 1,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPOT TRADING — Binance, Gate.io, Bybit
// ═══════════════════════════════════════════════════════════════════════════

export interface SpotQuote {
  exchange: string;
  symbol: string;         // e.g. "BTC"
  side: "buy" | "sell";
  price: string;          // USD price per unit
  estimatedFill: string;  // amount user receives
  feeRate: number;        // e.g. 0.001
  rawPrice: number;
}

export interface SpotOrderResult {
  exchange: string;
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  executedPrice: string;
  executedQty: string;    // base asset qty filled
  quoteQty: string;       // quote (USDT) qty filled
  fee: string;
  status: "filled" | "partial";
}

// ── Binance Spot ────────────────────────────────────────────────────────────

async function binanceSpotRequest(
  key: ExchangeKey,
  method: string,
  path: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const base = key.isTestnet ? "https://testnet.binance.vision" : "https://api.binance.com";
  const ts = Date.now().toString();
  const allParams = { ...params, timestamp: ts };
  const qs = new URLSearchParams(allParams).toString();
  const sig = bnbSign(qs, key.apiSecret);
  const url = `${base}${path}?${qs}&signature=${sig}`;
  const res = await fetch(url, {
    method,
    headers: { "X-MBX-APIKEY": key.apiKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Binance Spot: ${JSON.stringify(err)}`);
  }
  return res.json();
}

export async function binanceSpotPrice(symbol: string): Promise<number> {
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error("Binance price fetch failed");
  const data = (await res.json()) as { price: string };
  return parseFloat(data.price);
}

export async function binancePlaceSpotOrder(
  key: ExchangeKey,
  params: { symbol: string; side: "buy" | "sell"; quantity: string; orderType: "market" | "limit"; price?: string }
): Promise<SpotOrderResult> {
  const orderParams: Record<string, string> = {
    symbol: `${params.symbol.toUpperCase()}USDT`,
    side: params.side.toUpperCase(),
    type: params.orderType === "limit" ? "LIMIT" : "MARKET",
    ...(params.orderType === "market"
      ? { quoteOrderQty: params.quantity } // market buy: spend `quantity` USDT
      : { quantity: params.quantity, price: params.price!, timeInForce: "IOC" }),
  };
  const result = await binanceSpotRequest(key, "POST", "/api/v3/order", orderParams) as {
    orderId: number; executedQty: string; cummulativeQuoteQty: string; fills?: { price: string }[];
  };
  const avgPrice = result.fills?.length
    ? result.fills[0].price
    : (parseFloat(result.cummulativeQuoteQty) / parseFloat(result.executedQty || "1")).toFixed(8);

  return {
    exchange: "binance",
    orderId: String(result.orderId),
    symbol: params.symbol,
    side: params.side,
    executedPrice: avgPrice,
    executedQty: result.executedQty,
    quoteQty: result.cummulativeQuoteQty,
    fee: (parseFloat(result.cummulativeQuoteQty) * 0.001).toFixed(8),
    status: "filled",
  };
}

// ── Gate.io Spot ────────────────────────────────────────────────────────────

function gateSign(
  method: string, path: string, query: string, body: string,
  secret: string, timestamp: string
): string {
  const bodyHash = crypto.createHash("sha512").update(body).digest("hex");
  const msg = `${method}\n${path}\n${query}\n${bodyHash}\n${timestamp}`;
  return crypto.createHmac("sha512", secret).update(msg).digest("hex");
}

async function gateRequest(
  key: ExchangeKey, method: string, path: string,
  query = "", body = ""
): Promise<unknown> {
  const base = key.isTestnet ? "https://fx-api-testnet.gateio.ws" : "https://api.gateio.ws";
  const ts = Math.floor(Date.now() / 1000).toString();
  const sign = gateSign(method, path, query, body, key.apiSecret, ts);
  const url = `${base}${path}${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      "KEY":       key.apiKey,
      "SIGN":      sign,
      "Timestamp": ts,
      "Content-Type": "application/json",
    },
    body: body || undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gate.io: ${JSON.stringify(err)}`);
  }
  return res.json();
}

export async function gateSpotPrice(symbol: string): Promise<number> {
  const res = await fetch(
    `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${symbol.toUpperCase()}_USDT`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error("Gate.io price fetch failed");
  const data = (await res.json()) as { last: string }[];
  if (!data[0]) throw new Error("Gate.io no ticker data");
  return parseFloat(data[0].last);
}

export async function gatePlaceSpotOrder(
  key: ExchangeKey,
  params: { symbol: string; side: "buy" | "sell"; quantity: string; orderType: "market" | "limit"; price?: string }
): Promise<SpotOrderResult> {
  const pair = `${params.symbol.toUpperCase()}_USDT`;
  const bodyObj = {
    currency_pair: pair,
    type: params.orderType,
    account: "spot",
    side: params.side,
    // For market buy: use `amount` as quote (USDT) amount
    ...(params.orderType === "market" && params.side === "buy"
      ? { amount: params.quantity, time_in_force: "ioc" }
      : { amount: params.quantity, time_in_force: "ioc" }),
    ...(params.orderType === "limit" && params.price ? { price: params.price } : {}),
  };
  const body = JSON.stringify(bodyObj);
  const result = await gateRequest(key, "POST", "/api/v4/spot/orders", "", body) as {
    id: string; fill_price: string; amount: string; filled_amount?: string;
  };
  return {
    exchange: "gateio",
    orderId: result.id,
    symbol: params.symbol,
    side: params.side,
    executedPrice: result.fill_price ?? params.price ?? "0",
    executedQty: result.filled_amount ?? result.amount,
    quoteQty: (parseFloat(result.filled_amount ?? result.amount) * parseFloat(result.fill_price ?? "0")).toFixed(8),
    fee: (parseFloat(result.amount) * 0.002).toFixed(8),
    status: "filled",
  };
}

// ── Bybit Spot ──────────────────────────────────────────────────────────────

export async function bybitSpotPrice(symbol: string): Promise<number> {
  const res = await fetch(
    `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol.toUpperCase()}USDT`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error("Bybit spot price fetch failed");
  const json = (await res.json()) as { result: { list: { lastPrice: string }[] } };
  return parseFloat(json.result?.list?.[0]?.lastPrice ?? "0");
}

export async function bybitPlaceSpotOrder(
  key: ExchangeKey,
  params: { symbol: string; side: "buy" | "sell"; quantity: string; orderType: "market" | "limit"; price?: string }
): Promise<SpotOrderResult> {
  const result = await bybitRequest(key, "POST", "/v5/order/create", {
    category: "spot",
    symbol: `${params.symbol.toUpperCase()}USDT`,
    side: params.side === "buy" ? "Buy" : "Sell",
    orderType: params.orderType === "limit" ? "Limit" : "Market",
    qty: params.quantity,
    marketUnit: "quoteCoin", // market buy: qty = USDT to spend
    ...(params.orderType === "limit" && params.price ? { price: params.price } : {}),
  }) as { orderId: string; avgPrice?: string; cumExecQty?: string; cumExecValue?: string };

  return {
    exchange: "bybit",
    orderId: result.orderId,
    symbol: params.symbol,
    side: params.side,
    executedPrice: result.avgPrice ?? params.price ?? "0",
    executedQty: result.cumExecQty ?? params.quantity,
    quoteQty: result.cumExecValue ?? "0",
    fee: (parseFloat(result.cumExecValue ?? "0") * 0.001).toFixed(8),
    status: "filled",
  };
}

// ── Best spot price across all 3 exchanges (no auth needed) ─────────────────

const SPOT_PRICE_EXCHANGES = [
  { name: "binance", fn: binanceSpotPrice },
  { name: "gateio",  fn: gateSpotPrice    },
  { name: "bybit",   fn: bybitSpotPrice   },
];

export async function getBestSpotPrice(symbol: string): Promise<{ price: number; exchange: string }> {
  // Special cases
  if (symbol === "USDT") return { price: 1, exchange: "internal" };
  if (symbol === "USDC") return { price: 1, exchange: "internal" };

  const results = await Promise.allSettled(
    SPOT_PRICE_EXCHANGES.map(async (e) => ({ exchange: e.name, price: await e.fn(symbol) }))
  );

  // Use Binance first (most reliable), fall back to others
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.price > 0) return r.value;
  }
  throw new Error(`Could not fetch spot price for ${symbol}`);
}

// ── Route a spot order to best available exchange ───────────────────────────

export async function routeSpotOrder(params: {
  symbol: string;
  side: "buy" | "sell";
  quantity: string;           // USDT amount for market buy, base asset qty for sell
  orderType: "market" | "limit";
  price?: string;
}): Promise<SpotOrderResult> {
  const keys = await getActiveKeys();
  if (keys.length === 0) throw new Error("No active exchange keys. Configure them in Admin → Settings.");

  const errors: string[] = [];
  for (const key of keys) {
    try {
      let result: SpotOrderResult;
      if (key.exchange === "binance") {
        result = await binancePlaceSpotOrder(key, params);
      } else if (key.exchange === "bybit") {
        result = await bybitPlaceSpotOrder(key, params);
      } else {
        // Gate.io or OKX — skip OKX for spot (futures-only)
        if (key.exchange === "okx") { errors.push("[okx] spot not supported"); continue; }
        result = await gatePlaceSpotOrder(key, params);
      }
      const db = getDb();
      await db.from("exchange_keys")
        .update({ last_used_at: new Date().toISOString(), error_count: 0 })
        .eq("id", key.id).catch(() => undefined);
      return result;
    } catch (e) {
      errors.push(`[${key.exchange}] ${(e as Error).message}`);
      const db = getDb();
      await db.from("exchange_keys")
        .update({ error_count: key.priority })
        .eq("id", key.id).catch(() => undefined);
    }
  }
  throw new Error(`All spot exchanges failed: ${errors.join("; ")}`);
}

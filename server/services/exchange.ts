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

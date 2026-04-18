import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withSensitiveRateLimit, withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { Notifications } from "@/server/services/notifications";
import { getBestSpotPrice, routeSpotOrder } from "@/server/services/exchange";
import { getKesPerUsd } from "@/server/services/forex";
import { awardXp, getUserLevel } from "@/server/services/gamify";
import { subtract, add } from "@/lib/utils/money";
import Big from "big.js";

const trade = new Hono();

// Safe level fetch — never throws, returns zero discount on failure
async function getActiveLevel(uid: string) {
  try {
    return await getUserLevel(uid);
  } catch {
    return { level: "Bronze", totalXp: 0, xpToNext: 500, feeDiscount: 0 };
  }
}

// ─── Shared helper — get spot price with KES equivalent ──────────────────

async function getPriceWithKes(
  symbol: string
): Promise<{ usdPrice: string; kesPrice: string; kesPerUsd: string }> {
  const [{ price: usdPrice }, kesPerUsd] = await Promise.all([
    getBestSpotPrice(symbol),
    getKesPerUsd(),
  ]);
  const kesPrice = new Big(usdPrice).times(kesPerUsd).toFixed(2);
  return { usdPrice: usdPrice.toString(), kesPrice, kesPerUsd };
}

/* ─── POST /quote — get best price from exchanges ───────────────────────── */

trade.post(
  "/quote",
  authMiddleware,
  withApiRateLimit(),
  zValidator(
    "json",
    z.object({
      tokenIn:  z.string().min(1),
      tokenOut: z.string().min(1),
      amountIn: z.string().regex(/^\d+(\.\d+)?$/),
    })
  ),
  async (c) => {
    const { tokenIn, tokenOut, amountIn } = c.req.valid("json");

    // Determine the base asset (the one that's not USDT/KES)
    const baseAsset = tokenIn === "USDT" || tokenIn === "KES" ? tokenOut : tokenIn;
    const side: "buy" | "sell" = tokenIn === "USDT" || tokenIn === "KES" ? "buy" : "sell";

    try {
      const [{ price: usdPrice, exchange }, kesPerUsd, userLevel] = await Promise.all([
        getBestSpotPrice(baseAsset),
        getKesPerUsd(),
        getActiveLevel(c.get("user").uid),
      ]);

      const kesPrice = new Big(usdPrice).times(kesPerUsd).toFixed(2);
      const BASE_SPREAD = 0.003; // 0.3%
      // Platinum/Diamond get 10% fee discount
      const SPREAD = BASE_SPREAD * (1 - userLevel.feeDiscount);
      const feeRate = side === "buy" ? (1 + SPREAD) : (1 - SPREAD);

      let toAmount: string;
      let fee: string;

      if (side === "buy") {
        // amountIn = USDT → get base asset
        const effectivePrice = new Big(usdPrice).times(feeRate).toFixed(8);
        toAmount = new Big(amountIn).div(effectivePrice).toFixed(8);
        fee = new Big(amountIn).times(SPREAD).toFixed(4);
      } else {
        // amountIn = base asset → get USDT
        const effectivePrice = new Big(usdPrice).times(feeRate).toFixed(8);
        toAmount = new Big(amountIn).times(effectivePrice).toFixed(4);
        fee = new Big(toAmount).times(SPREAD).toFixed(4);
      }

      return c.json({
        success: true,
        data: {
          tokenIn,
          tokenOut,
          amountIn,
          toAmount,
          price: usdPrice.toString(),
          kesPrice,
          kesPerUsd,
          exchange,
          fee: `${fee} ${tokenOut}`,
          spread: `${(SPREAD * 100).toFixed(1)}%`,
          expiresAt: Date.now() + 30_000,
        },
      });
    } catch (e) {
      return c.json(
        { success: false, error: `Could not get price: ${(e as Error).message}`, statusCode: 503 },
        503
      );
    }
  }
);

/* ─── POST /submit — execute spot order on best exchange ────────────────── */

trade.post(
  "/submit",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator(
    "json",
    z.object({
      tokenIn:       z.string().min(1),
      tokenOut:      z.string().min(1),
      amountIn:      z.string().regex(/^\d+(\.\d+)?$/),
      side:          z.enum(["buy", "sell"]),
      orderType:     z.enum(["limit", "market"]).default("market"),
      limitPrice:    z.string().optional(),
      expectedRate:  z.string().optional(), // for convert flow
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { tokenIn, tokenOut, amountIn, side, orderType, limitPrice } = c.req.valid("json");
    const db = getDb();

    // Validate balance
    const inBalance = await getBalance(uid, tokenIn, "trading");
    if (parseFloat(inBalance) < parseFloat(amountIn)) {
      return c.json(
        { success: false, error: "Insufficient trading balance", statusCode: 400 },
        400
      );
    }

    // Get current price for records
    const baseAsset = side === "buy" ? tokenOut : tokenIn;
    let currentPrice = "0";
    let kesPerUsd = "130";
    let feeDiscount = 0;
    try {
      const [p, lvl] = await Promise.all([getPriceWithKes(baseAsset), getActiveLevel(uid)]);
      currentPrice = p.usdPrice;
      kesPerUsd = p.kesPerUsd;
      feeDiscount = lvl.feeDiscount;
    } catch { /* use fallback */ }

    const SPREAD = 0.003 * (1 - feeDiscount);
    const effectivePrice = side === "buy"
      ? new Big(currentPrice).times(1 + SPREAD).toFixed(8)
      : new Big(currentPrice).times(1 - SPREAD).toFixed(8);

    // Calculate how much user gets
    let estimatedOut: string;
    if (side === "buy") {
      estimatedOut = new Big(amountIn).div(effectivePrice).toFixed(8);
    } else {
      estimatedOut = new Big(amountIn).times(effectivePrice).toFixed(4);
    }

    // Hold funds
    const newInBalance = subtract(inBalance, amountIn);
    await upsertBalance(uid, tokenIn, newInBalance, "trading");

    // Insert trade record
    const { data: tradeRecord, error: insertError } = await db
      .from("trades")
      .insert({
        uid,
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in: amountIn,
        amount_out: estimatedOut,
        price: currentPrice,
        side,
        order_type: orderType,
        status: "executing",
        fulfillment_type: "exchange",
      })
      .select()
      .single();

    if (insertError || !tradeRecord) {
      await upsertBalance(uid, tokenIn, inBalance, "trading");
      return c.json(
        { success: false, error: "Failed to create order record", statusCode: 500 },
        500
      );
    }

    // Execute on exchange
    let execResult: { executedPrice: string; executedQty: string; quoteQty: string; exchange: string; orderId: string };
    let actualOut: string;

    try {
      const spot = await routeSpotOrder({
        symbol: baseAsset,
        side,
        quantity: amountIn,
        orderType,
        price: limitPrice,
      });
      execResult = spot;
      actualOut = side === "buy" ? spot.executedQty : spot.quoteQty;
    } catch (e) {
      // Exchange execution failed — refund and mark failed
      await upsertBalance(uid, tokenIn, inBalance, "trading");
      await db.from("trades").update({ status: "failed", note: (e as Error).message }).eq("id", tradeRecord.id);
      return c.json(
        {
          success: false,
          error: `Exchange execution failed: ${(e as Error).message}`,
          statusCode: 502,
        },
        502
      );
    }

    // Credit tokenOut to trading balance
    const outBalance = await getBalance(uid, tokenOut, "trading");
    const newOutBalance = add(outBalance, actualOut);
    await upsertBalance(uid, tokenOut, newOutBalance, "trading");

    // Mark trade completed
    await db.from("trades").update({
      status: "completed",
      amount_out: actualOut,
      price: execResult.executedPrice,
      exchange_order_id: execResult.orderId,
      exchange_name: execResult.exchange,
    }).eq("id", tradeRecord.id);

    // Ledger entries
    await Promise.all([
      createLedgerEntry({
        uid,
        asset: tokenIn,
        amount: `-${amountIn}`,
        type: "trade",
        reference_id: tradeRecord.id,
        note: `Spot ${side} ${baseAsset} @ $${parseFloat(execResult.executedPrice).toFixed(4)}`,
      }),
      createLedgerEntry({
        uid,
        asset: tokenOut,
        amount: actualOut,
        type: "trade",
        reference_id: tradeRecord.id,
        note: `Spot ${side} ${baseAsset} received`,
      }),
    ]);

    // Notify for large trades (>$100)
    const tradeValueUsd = parseFloat(side === "buy" ? amountIn : actualOut);
    if (tradeValueUsd > 100) {
      Notifications.largeTrade(
        uid,
        side,
        actualOut,
        baseAsset,
        tradeValueUsd.toFixed(2),
        tradeRecord.id
      ).catch(() => undefined);
    }

    // Notify trade filled (in-app only for small trades)
    Notifications.tradeFilled(uid, tokenIn, tokenOut, amountIn, actualOut).catch(() => undefined);

    // XP — fire-and-forget
    awardXp(uid, "trade_completed", 10, tradeRecord.id).catch(() => undefined);

    return c.json({
      success: true,
      data: {
        tradeId: tradeRecord.id,
        status: "completed",
        tokenIn,
        tokenOut,
        amountIn,
        amountOut: actualOut,
        executedPrice: execResult.executedPrice,
        exchange: execResult.exchange,
        kesPrice: new Big(execResult.executedPrice).times(kesPerUsd).toFixed(2),
        newBalances: {
          [tokenIn]:  newInBalance,
          [tokenOut]: newOutBalance,
        },
      },
    });
  }
);

/* ─── POST /convert — internal swap with 0.5% spread ───────────────────── */
// Does NOT route to external exchanges.
// User has USDT → BTC: deduct USDT, credit BTC at market price + 0.5% spread.
// Supports any supported pair.

trade.post(
  "/convert",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator(
    "json",
    z.object({
      fromAsset: z.string().min(1).toUpperCase(),
      toAsset:   z.string().min(1).toUpperCase(),
      amount:    z.string().regex(/^\d+(\.\d+)?$/),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { fromAsset, toAsset, amount } = c.req.valid("json");
    const db = getDb();

    // Validate balance
    const fromBal = await getBalance(uid, fromAsset, "funding");
    if (parseFloat(fromBal) < parseFloat(amount)) {
      return c.json(
        { success: false, error: "Insufficient balance", statusCode: 400 },
        400
      );
    }

    // Get prices for both assets (in USD)
    const SPREAD = 0.005; // 0.5%

    async function getUsdPrice(asset: string): Promise<number> {
      if (asset === "USDT" || asset === "USDC") return 1;
      if (asset === "KES") return 1 / parseFloat(await getKesPerUsd());
      const { price } = await getBestSpotPrice(asset);
      return price;
    }

    let fromUsdPrice: number;
    let toUsdPrice: number;
    let kesPerUsd: string;

    try {
      [fromUsdPrice, toUsdPrice, kesPerUsd] = await Promise.all([
        getUsdPrice(fromAsset),
        getUsdPrice(toAsset),
        getKesPerUsd(),
      ]);
    } catch (e) {
      return c.json(
        { success: false, error: `Price fetch failed: ${(e as Error).message}`, statusCode: 503 },
        503
      );
    }

    // Conversion: fromAmount × fromUsdPrice / toUsdPrice × (1 - spread)
    const fromValueUsd = new Big(amount).times(fromUsdPrice);
    const toAmountRaw   = fromValueUsd.div(toUsdPrice);
    const fee           = toAmountRaw.times(SPREAD);
    const toAmount      = toAmountRaw.minus(fee).toFixed(8);
    const rate          = fromValueUsd.div(toAmountRaw).toFixed(8); // USD per toAsset

    // Deduct from + credit to (both in funding wallet)
    const newFromBal = subtract(fromBal, amount);
    await upsertBalance(uid, fromAsset, newFromBal, "funding");

    const toBal = await getBalance(uid, toAsset, "funding");
    const newToBal = add(toBal, toAmount);
    await upsertBalance(uid, toAsset, newToBal, "funding");

    // Record in trades table
    const { data: tradeRecord } = await db
      .from("trades")
      .insert({
        uid,
        token_in: fromAsset,
        token_out: toAsset,
        amount_in: amount,
        amount_out: toAmount,
        price: rate,
        side: "buy",
        order_type: "market",
        status: "completed",
        fulfillment_type: "internal",
        note: `Internal convert @ $${fromUsdPrice.toFixed(4)}→$${toUsdPrice.toFixed(4)}, spread ${(SPREAD * 100).toFixed(1)}%`,
      })
      .select("id")
      .single();

    const tradeId = tradeRecord?.id ?? "";

    // Ledger entries
    await Promise.all([
      createLedgerEntry({
        uid,
        asset: fromAsset,
        amount: `-${amount}`,
        type: "trade",
        reference_id: tradeId,
        note: `Convert ${fromAsset}→${toAsset}`,
      }),
      createLedgerEntry({
        uid,
        asset: toAsset,
        amount: toAmount,
        type: "trade",
        reference_id: tradeId,
        note: `Convert received ${toAsset}`,
      }),
    ]);

    return c.json({
      success: true,
      data: {
        tradeId,
        fromAsset,
        toAsset,
        fromAmount: amount,
        toAmount,
        rate,
        fee: fee.toFixed(8),
        feePct: `${(SPREAD * 100).toFixed(1)}%`,
        fromUsdPrice: fromUsdPrice.toFixed(8),
        toUsdPrice:   toUsdPrice.toFixed(8),
        kesEquiv:     fromValueUsd.times(kesPerUsd).toFixed(2),
      },
    });
  }
);

/* ─── GET /price/:symbol — quick price check ────────────────────────────── */

trade.get(
  "/price/:symbol",
  authMiddleware,
  withApiRateLimit(),
  async (c) => {
    const symbol = c.req.param("symbol").toUpperCase();
    try {
      const [{ price, exchange }, kesPerUsd] = await Promise.all([
        getBestSpotPrice(symbol),
        getKesPerUsd(),
      ]);
      return c.json({
        success: true,
        data: {
          symbol,
          usdPrice: price.toString(),
          kesPrice: new Big(price).times(kesPerUsd).toFixed(2),
          kesPerUsd,
          exchange,
          timestamp: Date.now(),
        },
      });
    } catch (e) {
      return c.json({ success: false, error: (e as Error).message, statusCode: 503 }, 503);
    }
  }
);

/* ─── GET /history ──────────────────────────────────────────────────────── */

trade.get(
  "/history",
  authMiddleware,
  withApiRateLimit(),
  async (c) => {
    const { uid } = c.get("user");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
    const db = getDb();

    const { data: trades } = await db
      .from("trades")
      .select("*")
      .eq("uid", uid)
      .order("created_at", { ascending: false })
      .limit(limit);

    return c.json({ success: true, data: trades ?? [] });
  }
);

export default trade;

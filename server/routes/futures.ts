import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withSensitiveRateLimit, withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { add, subtract, multiply, divide, lt, gt } from "@/lib/utils/money";
import { Notifications } from "@/server/services/notifications";
import { redis } from "@/lib/redis/client";
import type { Context } from "hono";

const futures = new Hono();
futures.use("*", authMiddleware);
futures.use("*", withApiRateLimit());

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Get current Binance mark price for a symbol */
async function getMarkPrice(symbol: string): Promise<string> {
  // Check Redis cache first (updated by WS cron)
  const cached = await redis.get<string>(`binance:ticker:${symbol.toUpperCase()}`).catch(() => null);
  if (cached) return String(cached);

  // Fallback: Binance REST API
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error("Could not fetch mark price");
  const data = (await res.json()) as { price: string };
  return data.price;
}

/** Calculate liquidation price */
function calcLiqPrice(side: "long" | "short", entryPrice: string, leverage: number): string {
  const entry = parseFloat(entryPrice);
  // Simplified: liquidation at ~90% of margin consumed (maintenance margin 10%)
  const maintenanceMarginRate = 0.1;
  if (side === "long") {
    return (entry * (1 - (1 / leverage) + maintenanceMarginRate)).toFixed(8);
  } else {
    return (entry * (1 + (1 / leverage) - maintenanceMarginRate)).toFixed(8);
  }
}

/** Calculate unrealised PnL */
function calcUnrealisedPnl(
  side: "long" | "short",
  entryPrice: string,
  markPrice: string,
  quantity: string
): string {
  const entry = parseFloat(entryPrice);
  const mark  = parseFloat(markPrice);
  const qty   = parseFloat(quantity);
  const pnl   = side === "long" ? (mark - entry) * qty : (entry - mark) * qty;
  return pnl.toFixed(8);
}

/* ─── GET /positions — open + closed positions ───────────────────────────── */

futures.get("/positions", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();
  const status = c.req.query("status") ?? "open";

  const { data, error } = await db
    .from("futures_positions")
    .select("*")
    .eq("uid", uid)
    .eq("status", status)
    .order("opened_at", { ascending: false })
    .limit(50);

  if (error) return c.json({ success: false, error: "Failed to load positions", statusCode: 500 }, 500);

  // Enrich open positions with live mark price + unrealised PnL
  const enriched = await Promise.all((data ?? []).map(async (pos) => {
    if (pos.status !== "open") return { ...pos, unrealisedPnl: pos.realised_pnl };
    try {
      const mark = await getMarkPrice(pos.symbol);
      const unrealisedPnl = calcUnrealisedPnl(
        pos.side as "long" | "short",
        pos.entry_price,
        mark,
        pos.quantity
      );
      const roe = ((parseFloat(unrealisedPnl) / parseFloat(pos.margin)) * 100).toFixed(2);
      return { ...pos, markPrice: mark, unrealisedPnl, roe };
    } catch {
      return { ...pos, unrealisedPnl: "0", roe: "0" };
    }
  }));

  return c.json({ success: true, data: enriched });
});

/* ─── POST /open — open a new futures position ───────────────────────────── */

futures.post(
  "/open",
  withSensitiveRateLimit(),
  zValidator("json", z.object({
    symbol:     z.string().min(2).max(20).toUpperCase(),
    side:       z.enum(["long", "short"]),
    margin:     z.string().regex(/^\d+(\.\d+)?$/, "Invalid margin"),
    leverage:   z.number().int().min(1).max(125),
    takeProfit: z.string().optional(),
    stopLoss:   z.string().optional(),
    orderType:  z.enum(["market", "limit"]).default("market"),
    limitPrice: z.string().optional(),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { symbol, side, margin, leverage, takeProfit, stopLoss, orderType, limitPrice } = c.req.valid("json");
    const db = getDb();

    // Check trading balance
    const tradingBalance = await getBalance(uid, "USDT", "trading");
    if (gt(margin, tradingBalance)) {
      return c.json({ success: false, error: "Insufficient trading balance. Transfer funds from Funding to Trading.", statusCode: 400 }, 400);
    }

    // Get entry price
    let entryPrice: string;
    if (orderType === "limit") {
      if (!limitPrice) return c.json({ success: false, error: "Limit price required for limit orders", statusCode: 400 }, 400);
      entryPrice = limitPrice;
    } else {
      try {
        entryPrice = await getMarkPrice(symbol);
      } catch {
        return c.json({ success: false, error: "Could not fetch current price. Try again.", statusCode: 503 }, 503);
      }
    }

    // Notional = margin × leverage
    const notional = multiply(margin, leverage.toString());
    // Quantity = notional / entryPrice
    const quantity = divide(notional, entryPrice);
    const liqPrice = calcLiqPrice(side, entryPrice, leverage);

    // Deduct margin from trading balance immediately
    const newBalance = subtract(tradingBalance, margin);
    await upsertBalance(uid, "USDT", newBalance, "trading");

    // Open position
    const { data: pos, error } = await db
      .from("futures_positions")
      .insert({
        uid,
        symbol: symbol.endsWith("USDT") ? symbol : `${symbol}USDT`,
        side,
        leverage,
        margin,
        notional,
        quantity,
        entry_price: entryPrice,
        mark_price: entryPrice,
        liquidation_price: liqPrice,
        take_profit: takeProfit ?? null,
        stop_loss: stopLoss ?? null,
        status: orderType === "limit" ? "pending_limit" : "open",
      })
      .select()
      .single();

    if (error || !pos) {
      // Refund on failure
      await upsertBalance(uid, "USDT", tradingBalance, "trading");
      return c.json({ success: false, error: "Failed to open position", statusCode: 500 }, 500);
    }

    await createLedgerEntry({
      uid,
      asset: "USDT",
      amount: `-${margin}`,
      type: "trade",
      reference_id: pos.id,
      note: `Futures margin: ${side} ${leverage}x ${symbol} @ ${parseFloat(entryPrice).toFixed(4)}`,
    });

    return c.json({
      success: true,
      data: {
        positionId: pos.id,
        symbol: pos.symbol,
        side,
        entryPrice,
        notional,
        quantity,
        leverage,
        liquidationPrice: liqPrice,
        margin,
        newTradingBalance: newBalance,
        message: `${side === "long" ? "Long" : "Short"} position opened`,
      },
    });
  }
);

/* ─── POST /close/:positionId — close a position ────────────────────────── */

futures.post(
  "/close/:positionId",
  withSensitiveRateLimit(),
  zValidator("json", z.object({
    closePrice: z.string().optional(), // if not provided, use live mark price
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { positionId } = c.req.param();
    const { closePrice: requestedClosePrice } = c.req.valid("json");
    const db = getDb();

    const { data: pos } = await db
      .from("futures_positions")
      .select("*")
      .eq("id", positionId)
      .eq("uid", uid)
      .eq("status", "open")
      .maybeSingle();

    if (!pos) return c.json({ success: false, error: "Position not found or already closed", statusCode: 404 }, 404);

    // Get close price
    let closePrice: string;
    try {
      closePrice = requestedClosePrice ?? await getMarkPrice(pos.symbol);
    } catch {
      return c.json({ success: false, error: "Could not fetch current price", statusCode: 503 }, 503);
    }

    // Calculate realised PnL
    const realisedPnl = calcUnrealisedPnl(
      pos.side as "long" | "short",
      pos.entry_price,
      closePrice,
      pos.quantity
    );

    // Return margin + PnL to trading balance
    const pnlNum = parseFloat(realisedPnl);
    const returnAmount = (parseFloat(pos.margin) + pnlNum).toFixed(8);
    const currentBalance = await getBalance(uid, "USDT", "trading");
    const newBalance = add(currentBalance, returnAmount);
    await upsertBalance(uid, "USDT", newBalance, "trading");

    // Mark position closed
    await db.from("futures_positions").update({
      status: pnlNum >= 0 ? "closed" : "closed",
      close_price: closePrice,
      close_reason: "manual",
      realised_pnl: realisedPnl,
      closed_at: new Date().toISOString(),
    }).eq("id", positionId);

    await createLedgerEntry({
      uid,
      asset: "USDT",
      amount: returnAmount,
      type: "trade",
      reference_id: positionId,
      note: `Futures close: ${pos.side} ${pos.symbol} PnL ${pnlNum >= 0 ? "+" : ""}${pnlNum.toFixed(4)} USDT`,
    });

    const roe = ((pnlNum / parseFloat(pos.margin)) * 100).toFixed(2);

    return c.json({
      success: true,
      data: {
        positionId,
        closePrice,
        realisedPnl,
        roe: `${roe}%`,
        returned: returnAmount,
        newTradingBalance: newBalance,
        message: `Position closed. PnL: ${pnlNum >= 0 ? "+" : ""}${pnlNum.toFixed(4)} USDT (${roe}%)`,
      },
    });
  }
);

/* ─── PATCH /close/:positionId/tp-sl — update TP/SL ─────────────────────── */

futures.patch(
  "/:positionId/tp-sl",
  zValidator("json", z.object({
    takeProfit: z.string().nullable().optional(),
    stopLoss:   z.string().nullable().optional(),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { positionId } = c.req.param();
    const { takeProfit, stopLoss } = c.req.valid("json");
    const db = getDb();

    const { error } = await db.from("futures_positions")
      .update({ take_profit: takeProfit, stop_loss: stopLoss })
      .eq("id", positionId).eq("uid", uid).eq("status", "open");

    if (error) return c.json({ success: false, error: "Failed to update TP/SL", statusCode: 500 }, 500);
    return c.json({ success: true, data: { message: "TP/SL updated" } });
  }
);

/* ─── GET /summary — account summary ─────────────────────────────────────── */

futures.get("/summary", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();

  const [tradingBalance, { data: openPositions }, { data: closedToday }] = await Promise.all([
    getBalance(uid, "USDT", "trading"),
    db.from("futures_positions").select("margin,realised_pnl,symbol,side,leverage,entry_price,quantity,liquidation_price")
      .eq("uid", uid).eq("status", "open"),
    db.from("futures_positions").select("realised_pnl")
      .eq("uid", uid).eq("status", "closed")
      .gte("closed_at", new Date(Date.now() - 86_400_000).toISOString()),
  ]);

  const totalMarginUsed = (openPositions ?? []).reduce((s, p) => s + parseFloat(p.margin), 0);
  const todayPnl = (closedToday ?? []).reduce((s, p) => s + parseFloat(p.realised_pnl ?? "0"), 0);

  return c.json({
    success: true,
    data: {
      tradingBalance,
      openPositions: openPositions?.length ?? 0,
      totalMarginUsed: totalMarginUsed.toFixed(4),
      availableBalance: (parseFloat(tradingBalance) - totalMarginUsed).toFixed(4),
      todayPnl: todayPnl.toFixed(4),
      positions: openPositions ?? [],
    },
  });
});

export default futures;

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withSensitiveRateLimit, withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { getSwapQuote, verifyTransaction } from "@/server/services/blockchain";
import { Notifications } from "@/server/services/notifications";
import { subtract, add } from "@/lib/utils/money";

const trade = new Hono();

/* ─── POST /quote ───────────────────────────────────────────────────────── */

trade.post(
  "/quote",
  authMiddleware,
  withApiRateLimit(),
  zValidator(
    "json",
    z.object({
      tokenIn: z.string().min(1),
      tokenOut: z.string().min(1),
      amountIn: z.string().regex(/^\d+(\.\d+)?$/),
    })
  ),
  async (c) => {
    const { tokenIn, tokenOut, amountIn } = c.req.valid("json");

    const quote = await getSwapQuote(tokenIn, tokenOut, amountIn);

    return c.json({
      success: true,
      data: {
        ...quote,
        expiresAt: Date.now() + 30_000, // 30 second quote validity
      },
    });
  }
);

/* ─── POST /submit — create pending order for manual fulfillment ─────────── */

trade.post(
  "/submit",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator(
    "json",
    z.object({
      tokenIn: z.string().min(1),
      tokenOut: z.string().min(1),
      amountIn: z.string().regex(/^\d+(\.\d+)?$/),
      side: z.enum(["buy", "sell"]),
      orderType: z.enum(["limit", "market", "tp_sl", "trailing_stop", "trigger", "advanced_limit"]),
      limitPrice: z.string().optional(),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { tokenIn, tokenOut, amountIn, side, orderType } = c.req.valid("json");
    const db = getDb();

    // Check user has sufficient balance
    const balance = await getBalance(uid, tokenIn === "USDT" ? "USDT" : tokenIn, "trading");

    if (parseFloat(balance) < parseFloat(amountIn)) {
      return c.json(
        { success: false, error: "Insufficient trading balance", statusCode: 400 },
        400
      );
    }

    // Get quote for price reference
    const quote = await getSwapQuote(tokenIn, tokenOut, amountIn);

    // Deduct from trading balance (hold funds while order pending)
    await upsertBalance(
      uid,
      tokenIn === "USDT" ? "USDT" : tokenIn,
      subtract(balance, amountIn),
      "trading"
    );

    const { data: tradeRecord, error } = await db
      .from("trades")
      .insert({
        uid,
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in: amountIn,
        price: quote.price,
        side,
        order_type: orderType,
        status: "pending_fulfillment",
        fulfillment_type: "manual",
      })
      .select()
      .single();

    if (error || !tradeRecord) {
      // Refund
      await upsertBalance(uid, tokenIn === "USDT" ? "USDT" : tokenIn, balance, "trading");
      return c.json(
        { success: false, error: "Failed to submit order", statusCode: 500 },
        500
      );
    }

    return c.json({
      success: true,
      data: {
        tradeId: tradeRecord.id,
        status: "pending_fulfillment",
        message: "Order submitted. It will be filled shortly.",
        quote,
      },
    });
  }
);

/* ─── POST /confirm — Bug #5 fix: verify txHash on-chain ─────────────────── */

trade.post(
  "/confirm",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator(
    "json",
    z.object({
      tradeId: z.string().uuid(),
      txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash"),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { tradeId, txHash } = c.req.valid("json");
    const db = getDb();

    const { data: tradeRecord } = await db
      .from("trades")
      .select("*")
      .eq("id", tradeId)
      .eq("uid", uid)
      .single();

    if (!tradeRecord) {
      return c.json(
        { success: false, error: "Trade not found", statusCode: 404 },
        404
      );
    }

    if (tradeRecord.status === "completed") {
      return c.json(
        { success: false, error: "Trade already confirmed", statusCode: 400 },
        400
      );
    }

    // Bug #5 fix: verify receipt on-chain before crediting
    const verification = await verifyTransaction(txHash);

    if (!verification.success) {
      return c.json(
        {
          success: false,
          error: "Transaction not found on chain or failed. Please check the hash and try again.",
          statusCode: 400,
        },
        400
      );
    }

    // Update trade record
    await db
      .from("trades")
      .update({
        status: "completed",
        tx_hash: txHash,
      })
      .eq("id", tradeId);

    // Ledger entries
    await createLedgerEntry({
      uid,
      asset: tradeRecord.token_in,
      amount: `-${tradeRecord.amount_in}`,
      type: "trade",
      reference_id: tradeRecord.id,
    });

    if (tradeRecord.amount_out) {
      await createLedgerEntry({
        uid,
        asset: tradeRecord.token_out,
        amount: tradeRecord.amount_out,
        type: "trade",
        reference_id: tradeRecord.id,
      });

      // Credit tokenOut to trading balance
      const outBalance = await getBalance(uid, tradeRecord.token_out, "trading");
      await upsertBalance(
        uid,
        tradeRecord.token_out,
        add(outBalance, tradeRecord.amount_out),
        "trading"
      );
    }

    return c.json({
      success: true,
      data: { tradeId, txHash, status: "completed" },
    });
  }
);

/* ─── GET /history ──────────────────────────────────────────────────────── */

trade.get("/history", authMiddleware, withApiRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const db = getDb();

  const { data: trades } = await db
    .from("trades")
    .select("*")
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .limit(50);

  return c.json({ success: true, data: trades ?? [] });
});

export default trade;

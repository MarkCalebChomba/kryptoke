import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { Notifications } from "@/server/services/notifications";
import { subtract, add, gt } from "@/lib/utils/money";

const earn = new Hono();
earn.use("*", authMiddleware, withApiRateLimit());

/* ─── GET /products ─────────────────────────────────────────────────────── */

earn.get("/products", async (c) => {
  // Static product list — in production, fetched from Binance Earn API
  return c.json({
    success: true,
    data: [
      { id: "1", asset: "USDT", name: "USDT Simple Earn", apr: "10", lockPeriodDays: null, minSubscription: "1", interestFrequency: "daily", isComingSoon: false },
      { id: "2", asset: "BTC",  name: "BTC Simple Earn",  apr: "2.5", lockPeriodDays: null, minSubscription: "0.001", interestFrequency: "daily", isComingSoon: false },
    ],
  });
});

/* ─── GET /positions ────────────────────────────────────────────────────── */

earn.get("/positions", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();

  const { data } = await db
    .from("earn_positions")
    .select("*")
    .eq("uid", uid)
    .eq("status", "active")
    .order("start_date", { ascending: false });

  return c.json({ success: true, data: data ?? [] });
});

/* ─── POST /subscribe ───────────────────────────────────────────────────── */

earn.post(
  "/subscribe",
  withSensitiveRateLimit(),
  zValidator(
    "json",
    z.object({
      asset: z.string().min(1),
      amount: z.string().regex(/^\d+(\.\d+)?$/),
      product: z.string().min(1),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { asset, amount, product } = c.req.valid("json");
    const db = getDb();

    // Check funding balance
    const balance = await getBalance(uid, asset, "funding");
    if (gt(amount, balance)) {
      return c.json({ success: false, error: "Insufficient funding balance", statusCode: 400 }, 400);
    }

    // APR lookup — in production, fetch from Binance API
    const aprMap: Record<string, string> = { "1": "10", "2": "2.5", "3": "30" };
    const apr = aprMap[product] ?? "5";

    // Deduct from funding, add to earn balance
    await upsertBalance(uid, asset, subtract(balance, amount), "funding");
    const earnBalance = await getBalance(uid, asset, "earn");
    await upsertBalance(uid, asset, add(earnBalance, amount), "earn");

    // Create position record
    const { data: position, error } = await db
      .from("earn_positions")
      .insert({
        uid,
        asset,
        amount,
        product,
        apr,
        status: "active",
        accrued_interest: "0",
      })
      .select()
      .single();

    if (error || !position) {
      // Refund
      await upsertBalance(uid, asset, balance, "funding");
      return c.json({ success: false, error: "Failed to create position", statusCode: 500 }, 500);
    }

    await createLedgerEntry({
      uid, asset,
      amount: `-${amount}`,
      type: "earn",
      reference_id: position.id,
      note: `Earn subscription — ${amount} ${asset} at ${apr}% APR`,
    });

    return c.json({ success: true, data: position }, 201);
  }
);

/* ─── POST /redeem ──────────────────────────────────────────────────────── */

earn.post(
  "/redeem",
  withSensitiveRateLimit(),
  zValidator("json", z.object({ positionId: z.string().uuid() })),
  async (c) => {
    const { uid } = c.get("user");
    const { positionId } = c.req.valid("json");
    const db = getDb();

    const { data: position } = await db
      .from("earn_positions")
      .select("*")
      .eq("id", positionId)
      .eq("uid", uid)
      .eq("status", "active")
      .single();

    if (!position) {
      return c.json({ success: false, error: "Position not found", statusCode: 404 }, 404);
    }

    // Return principal + accrued interest to funding
    const total = add(position.amount, position.accrued_interest);
    const fundingBalance = await getBalance(uid, position.asset, "funding");
    await upsertBalance(uid, position.asset, add(fundingBalance, total), "funding");

    // Deduct from earn balance
    const earnBalance = await getBalance(uid, position.asset, "earn");
    await upsertBalance(uid, position.asset, subtract(earnBalance, position.amount), "earn");

    // Mark redeemed
    await db.from("earn_positions").update({ status: "redeemed", end_date: new Date().toISOString() }).eq("id", positionId);

    await createLedgerEntry({
      uid,
      asset: position.asset,
      amount: total,
      type: "earn",
      reference_id: position.id,
      note: `Earn redemption — ${position.amount} ${position.asset} + ${position.accrued_interest} interest`,
    });

    await Notifications.earnInterest(uid, position.accrued_interest, position.asset);

    return c.json({ success: true, data: { redeemedAmount: total } });
  }
);

/* ─── PATCH /auto ───────────────────────────────────────────────────────── */

earn.patch(
  "/auto",
  zValidator("json", z.object({ enabled: z.boolean() })),
  async (c) => {
    const { uid } = c.get("user");
    const { enabled } = c.req.valid("json");
    const db = getDb();
    await db.from("users").update({ auto_earn: enabled }).eq("uid", uid);
    return c.json({ success: true, data: { autoEarn: enabled } });
  }
);

export default earn;

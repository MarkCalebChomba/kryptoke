import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { redis } from "@/lib/redis/client";
import { add, subtract, lt } from "@/lib/utils/money";
import Big from "big.js";
import { awardXp } from "@/server/services/gamify";

const p2p = new Hono();
p2p.use("*", withApiRateLimit());

/* ─── GET /ads — List active P2P advertisements ─────────────────────────── */
p2p.get("/ads", async (c) => {
  const { type = "sell", asset = "USDT", fiat = "KES", limit = "20", offset = "0" } = c.req.query();
  const db = getDb();

  const { data, count } = await db
    .from("p2p_ads")
    .select("*, users!inner(uid, display_name, avatar_url)", { count: "exact" })
    .eq("type", type)
    .eq("asset", asset)
    .eq("fiat_currency", fiat)
    .eq("is_active", true)
    .gt("available_amount", 0)
    .order("created_at", { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  return c.json({ success: true, data: data ?? [], total: count ?? 0 });
});

/* ─── GET /ads/mine — User's own ads ────────────────────────────────────── */
p2p.get("/ads/mine", authMiddleware, async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();
  const { data } = await db
    .from("p2p_ads")
    .select("*")
    .eq("uid", uid)
    .order("created_at", { ascending: false });

  return c.json({ success: true, data: data ?? [] });
});

/* ─── POST /ads — Create a new ad ───────────────────────────────────────── */
p2p.post(
  "/ads",
  authMiddleware,
  zValidator("json", z.object({
    type:             z.enum(["buy", "sell"]),
    asset:            z.string().default("USDT"),
    fiat_currency:    z.string().default("KES"),
    price_per_unit:   z.number().positive(),
    min_order_kes:    z.number().positive().default(100),
    max_order_kes:    z.number().positive(),
    available_amount: z.number().positive(),
    payment_methods:  z.array(z.string()).min(1).default(["M-Pesa"]),
    terms:            z.string().max(500).optional(),
  })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const body = c.req.valid("json");
    const db   = getDb();

    // For sell ads: verify balance
    if (body.type === "sell") {
      const bal = await getBalance(uid, body.asset, "trading");
      if (lt(bal, body.available_amount.toString())) {
        return c.json({ success: false, error: "Insufficient trading balance" }, 400);
      }
    }

    const { data, error } = await db
      .from("p2p_ads")
      .insert({
        uid,
        type:             body.type,
        asset:            body.asset,
        fiat_currency:    body.fiat_currency,
        price_per_unit:   body.price_per_unit,
        min_order_kes:    body.min_order_kes,
        max_order_kes:    body.max_order_kes,
        available_amount: body.available_amount,
        payment_methods:  body.payment_methods,
        terms:            body.terms ?? null,
      })
      .select()
      .single();

    if (error) return c.json({ success: false, error: error.message }, 400);
    return c.json({ success: true, data });
  }
);

/* ─── DELETE /ads/:id — Cancel/remove an ad ─────────────────────────────── */
p2p.delete("/ads/:id", authMiddleware, async (c) => {
  const uid = c.get("uid") as string;
  const id  = c.req.param("id");
  const db  = getDb();

  await db.from("p2p_ads").update({ is_active: false }).eq("id", id).eq("uid", uid);
  return c.json({ success: true });
});

/* ─── POST /orders — Place a trade order against an ad ──────────────────── */
p2p.post(
  "/orders",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator("json", z.object({
    ad_id:          z.string().uuid(),
    fiat_amount:    z.number().positive(),
    payment_method: z.string(),
  })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const body = c.req.valid("json");
    const db   = getDb();

    const { data: ad } = await db.from("p2p_ads").select("*").eq("id", body.ad_id).eq("is_active", true).single();
    if (!ad) return c.json({ success: false, error: "Ad not found or inactive" }, 404);
    if (ad.uid === uid) return c.json({ success: false, error: "Cannot trade with yourself" }, 400);

    if (body.fiat_amount < ad.min_order_kes || body.fiat_amount > ad.max_order_kes) {
      return c.json({ success: false, error: `Order must be between ${ad.min_order_kes} and ${ad.max_order_kes} KES` }, 400);
    }

    const cryptoAmount = new Big(body.fiat_amount).div(ad.price_per_unit).toFixed(8);
    if (lt(ad.available_amount.toString(), cryptoAmount)) {
      return c.json({ success: false, error: "Insufficient amount available" }, 400);
    }

    const { data: order, error } = await db
      .from("p2p_orders")
      .insert({
        ad_id:         body.ad_id,
        buyer_uid:     ad.type === "sell" ? uid : ad.uid,
        seller_uid:    ad.type === "sell" ? ad.uid : uid,
        asset:         ad.asset,
        fiat_currency: ad.fiat_currency,
        fiat_amount:   body.fiat_amount,
        crypto_amount: cryptoAmount,
        price_per_unit:ad.price_per_unit,
        payment_method:body.payment_method,
        status:        "pending",
        expires_at:    new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) return c.json({ success: false, error: error.message }, 400);
    return c.json({ success: true, data: order });
  }
);

/* ─── GET /orders — User's order history ────────────────────────────────── */
p2p.get("/orders", authMiddleware, async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();

  const { data } = await db
    .from("p2p_orders")
    .select("*")
    .or(`buyer_uid.eq.${uid},seller_uid.eq.${uid}`)
    .order("created_at", { ascending: false })
    .limit(50);

  return c.json({ success: true, data: data ?? [] });
});

/* ─── GET /orders/:id ────────────────────────────────────────────────────── */
p2p.get("/orders/:id", authMiddleware, async (c) => {
  const uid = c.get("uid") as string;
  const id  = c.req.param("id");
  const db  = getDb();

  const { data } = await db
    .from("p2p_orders")
    .select("*")
    .eq("id", id)
    .or(`buyer_uid.eq.${uid},seller_uid.eq.${uid}`)
    .single();

  if (!data) return c.json({ success: false, error: "Order not found" }, 404);
  return c.json({ success: true, data });
});

/* ─── POST /orders/:id/paid — Buyer marks as paid ───────────────────────── */
p2p.post("/orders/:id/paid", authMiddleware, async (c) => {
  const uid = c.get("uid") as string;
  const id  = c.req.param("id");
  const db  = getDb();

  const { data: order } = await db.from("p2p_orders").select("*").eq("id", id).eq("buyer_uid", uid).single();
  if (!order) return c.json({ success: false, error: "Order not found" }, 404);
  if (order.status !== "pending") return c.json({ success: false, error: "Order not in pending state" }, 400);

  await db.from("p2p_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
  return c.json({ success: true, message: "Marked as paid. Awaiting seller confirmation." });
});

/* ─── POST /orders/:id/release — Seller releases crypto ─────────────────── */
p2p.post("/orders/:id/release", authMiddleware, async (c) => {
  const uid = c.get("uid") as string;
  const id  = c.req.param("id");
  const db  = getDb();

  const { data: order } = await db.from("p2p_orders").select("*").eq("id", id).eq("seller_uid", uid).single();
  if (!order) return c.json({ success: false, error: "Order not found" }, 404);
  if (order.status !== "paid") return c.json({ success: false, error: "Order not paid yet" }, 400);

  // Transfer crypto from seller to buyer
  const sellerBal = await getBalance(order.seller_uid, order.asset, "trading");
  if (lt(sellerBal, order.crypto_amount.toString())) {
    return c.json({ success: false, error: "Seller balance insufficient" }, 400);
  }

  await upsertBalance(order.seller_uid, order.asset, subtract(sellerBal, order.crypto_amount.toString()), "trading");
  const buyerBal = await getBalance(order.buyer_uid, order.asset, "trading");
  await upsertBalance(order.buyer_uid, order.asset, add(buyerBal, order.crypto_amount.toString()), "trading");

  await createLedgerEntry({ uid: order.buyer_uid, asset: order.asset, amount: order.crypto_amount.toString(), type: "p2p_buy", note: `P2P buy from order ${id}` });
  await createLedgerEntry({ uid: order.seller_uid, asset: order.asset, amount: `-${order.crypto_amount}`, type: "p2p_sell", note: `P2P sell to order ${id}` });

  await db.from("p2p_orders").update({ status: "released", released_at: new Date().toISOString() }).eq("id", id);

  // Decrement ad available_amount
  const { data: adRow } = await db.from("p2p_ads").select("available_amount").eq("id", order.ad_id).single();
  if (adRow) {
    const newAmt = Math.max(0, parseFloat(adRow.available_amount.toString()) - parseFloat(order.crypto_amount.toString()));
    await db.from("p2p_ads").update({ available_amount: newAmt }).eq("id", order.ad_id);
  }

  // XP — fire-and-forget
  awardXp(order.seller_uid, "p2p_seller", 25, id).catch(() => undefined);
  awardXp(order.buyer_uid,  "p2p_buyer",  15, id).catch(() => undefined);

  return c.json({ success: true, message: "Crypto released to buyer successfully." });
});

/* ─── POST /orders/:id/dispute — Raise a dispute ────────────────────────── */
p2p.post(
  "/orders/:id/dispute",
  authMiddleware,
  zValidator("json", z.object({ reason: z.string().min(10).max(500) })),
  async (c) => {
    const uid = c.get("uid") as string;
    const id  = c.req.param("id");
    const body = c.req.valid("json");
    const db  = getDb();

    const { data: order } = await db.from("p2p_orders").select("*").eq("id", id)
      .or(`buyer_uid.eq.${uid},seller_uid.eq.${uid}`).single();
    if (!order) return c.json({ success: false, error: "Order not found" }, 404);

    await db.from("p2p_orders").update({ status: "disputed", dispute_reason: body.reason }).eq("id", id);
    return c.json({ success: true, message: "Dispute raised. Our team will review within 24 hours." });
  }
);

export default p2p;

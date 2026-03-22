import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getTokenPrice } from "@/server/services/blockchain";
import { redis } from "@/lib/redis/client";

const tokens = new Hono();
tokens.use("*", withApiRateLimit());

/* ─── GET / ─────────────────────────────────────────────────────────────── */

tokens.get("/", async (c) => {
  const db = getDb();
  const { data } = await db
    .from("tokens")
    .select("*")
    .order("whitelisted_at", { ascending: false });

  return c.json({ success: true, data: data ?? [] });
});

/* ─── GET /:address ─────────────────────────────────────────────────────── */

tokens.get("/:address", async (c) => {
  const { address } = c.req.param();
  const key = `token:detail:${address.toLowerCase()}`;

  // Serve metadata from cache — token info never changes, price updates separately
  const cachedMeta = await redis.get<Record<string, unknown>>(key).catch(() => null);
  if (cachedMeta) {
    // Price from WS store on client — just return cached metadata with stale price
    return c.json({ success: true, data: cachedMeta });
  }

  const db = getDb();
  const { data: token } = await db
    .from("tokens")
    .select("*")
    .eq("address", address.toLowerCase())
    .single();

  if (!token) {
    return c.json({ success: false, error: "Token not found", statusCode: 404 }, 404);
  }

  // Price: check Binance WS cache first, fall back to BSC RPC only if needed
  const binancePrice = await redis.get<string>(`binance:ticker:${(token.symbol + "USDT").toUpperCase()}`).catch(() => null);
  const price = binancePrice ?? await getTokenPrice(token.address).catch(() => "0");

  const result = { ...token, price };
  // Cache metadata for 5 minutes — price is live via WS anyway
  await redis.set(key, result, { ex: 5 * 60 }).catch(() => undefined);

  return c.json({ success: true, data: result });
});

/* ─── GET /price/:address ───────────────────────────────────────────────── */

tokens.get("/price/:address", async (c) => {
  const { address } = c.req.param();
  const price = await getTokenPrice(address);
  return c.json({ success: true, data: { address, price } });
});

/* ─── POST /whitelist — Bug #5 fix: requires admin role ──────────────────── */

tokens.post(
  "/whitelist",
  adminMiddleware, // Was: authMiddleware — any user could add tokens
  zValidator(
    "json",
    z.object({
      address: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid BSC address")
        .transform((s) => s.toLowerCase()),
      symbol: z.string().min(1).max(20).toUpperCase(),
      name: z.string().min(1).max(100),
      decimals: z.number().int().min(0).max(18).default(18),
      coingeckoId: z.string().optional(),
      isSeed: z.boolean().default(false),
      iconUrl: z.string().url().optional(),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb();

    const { data: existing } = await db
      .from("tokens")
      .select("address")
      .eq("address", body.address)
      .single();

    if (existing) {
      return c.json(
        { success: false, error: "Token already whitelisted", statusCode: 409 },
        409
      );
    }

    const { data: token, error } = await db
      .from("tokens")
      .insert({
        address: body.address,
        symbol: body.symbol,
        name: body.name,
        decimals: body.decimals,
        coingecko_id: body.coingeckoId ?? null,
        is_new: true,
        is_seed: body.isSeed,
        icon_url: body.iconUrl ?? null,
      })
      .select()
      .single();

    if (error || !token) {
      return c.json(
        { success: false, error: "Failed to whitelist token", statusCode: 500 },
        500
      );
    }

    return c.json({ success: true, data: token }, 201);
  }
);

/* ─── DELETE /whitelist/:address — admin only ───────────────────────────── */

tokens.delete(
  "/whitelist/:address",
  adminMiddleware,
  async (c) => {
    const { address } = c.req.param();
    const db = getDb();

    const { error } = await db
      .from("tokens")
      .delete()
      .eq("address", address.toLowerCase());

    if (error) {
      return c.json(
        { success: false, error: "Failed to remove token", statusCode: 500 },
        500
      );
    }

    return c.json({ success: true, data: { message: "Token removed from whitelist" } });
  }
);

export default tokens;

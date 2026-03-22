import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";

const notifications = new Hono();
notifications.use("*", authMiddleware, withApiRateLimit());

/* ─── GET / ─────────────────────────────────────────────────────────────── */

notifications.get("/", async (c) => {
  const { uid } = c.get("user");
  const page = parseInt(c.req.query("page") ?? "1");
  const pageSize = 20;

  const db = getDb();
  const { data, count } = await db
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  return c.json({
    success: true,
    data: {
      items: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
      hasMore: ((count ?? 0)) > page * pageSize,
    },
  });
});

/* ─── PATCH /:id/read ───────────────────────────────────────────────────── */

notifications.patch("/:id/read", async (c) => {
  const { uid } = c.get("user");
  const { id } = c.req.param();
  const db = getDb();

  await db
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("uid", uid);

  return c.json({ success: true, data: { message: "Marked as read" } });
});

/* ─── PATCH /read-all ───────────────────────────────────────────────────── */

notifications.patch("/read-all", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();

  await db
    .from("notifications")
    .update({ read: true })
    .eq("uid", uid)
    .eq("read", false);

  return c.json({ success: true, data: { message: "All notifications marked as read" } });
});

/* ─── POST /alerts ──────────────────────────────────────────────────────── */

notifications.post(
  "/alerts",
  zValidator(
    "json",
    z.object({
      tokenAddress: z.string().min(1),
      tokenSymbol: z.string().min(1),
      condition: z.enum(["above", "below"]),
      price: z.string().regex(/^\d+(\.\d+)?$/),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const body = c.req.valid("json");
    const db = getDb();

    const { data: alert, error } = await db
      .from("alerts")
      .insert({
        uid,
        token_address: body.tokenAddress,
        token_symbol: body.tokenSymbol,
        condition: body.condition,
        price: body.price,
        triggered: false,
      })
      .select()
      .single();

    if (error || !alert) {
      return c.json(
        { success: false, error: "Failed to create alert", statusCode: 500 },
        500
      );
    }

    return c.json({ success: true, data: alert }, 201);
  }
);

/* ─── GET /alerts ───────────────────────────────────────────────────────── */

notifications.get("/alerts", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();

  const { data } = await db
    .from("alerts")
    .select("*")
    .eq("uid", uid)
    .eq("triggered", false)
    .order("created_at", { ascending: false });

  return c.json({ success: true, data: data ?? [] });
});

/* ─── DELETE /alerts/:id ────────────────────────────────────────────────── */

notifications.delete("/alerts/:id", async (c) => {
  const { uid } = c.get("user");
  const { id } = c.req.param();
  const db = getDb();

  await db.from("alerts").delete().eq("id", id).eq("uid", uid);

  return c.json({ success: true, data: { message: "Alert deleted" } });
});

export default notifications;

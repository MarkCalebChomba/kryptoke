import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { sendEmail, sendSms } from "@/server/services/notifications";

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

/* ─── POST /admin/send — manually send email or SMS to a user (admin only) */

notifications.post(
  "/admin/send",
  authMiddleware,
  adminMiddleware,
  zValidator(
    "json",
    z.object({
      uid: z.string().uuid("Invalid uid"),
      channel: z.enum(["email", "sms", "both"]),
      subject: z.string().min(1).max(100).optional(),
      message: z.string().min(1).max(500),
    })
  ),
  async (c) => {
    const { uid, channel, subject, message } = c.req.valid("json");
    const db = getDb();

    // Look up user's contact details
    const { data: user } = await db
      .from("users")
      .select("email, phone")
      .eq("uid", uid)
      .single();

    if (!user) {
      return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);
    }

    const results: { email?: string; sms?: string } = {};

    if ((channel === "email" || channel === "both") && user.email) {
      await sendEmail(
        user.email,
        subject ?? "Message from KryptoKe Support",
        `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;
                      background:#080C14;color:#F0F4FF;border-radius:16px;">
            <div style="margin-bottom:24px;">
              <span style="font-size:22px;font-weight:800;color:#00E5B4;">KryptoKe</span>
              <span style="color:#8A9CC0;font-size:14px;margin-left:8px;">Support</span>
            </div>
            <p style="color:#F0F4FF;font-size:15px;line-height:1.6;">${message}</p>
            <hr style="border:none;border-top:1px solid #1C2840;margin:24px 0;" />
            <p style="color:#4A5B7A;font-size:12px;">
              This message was sent by the KryptoKe support team.
              Reply to support@kryptoke.com if you have questions.
            </p>
          </div>
        `
      );
      results.email = "sent";
    }

    if ((channel === "sms" || channel === "both") && user.phone) {
      await sendSms(user.phone, `KryptoKe Support: ${message}`);
      results.sms = "sent";
    } else if (channel === "sms" && !user.phone) {
      results.sms = "skipped — no phone on record";
    }

    return c.json({ success: true, data: results });
  }
);

export default notifications;

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { findUserByUid } from "@/server/db/users";
import { verifyJwt } from "@/server/services/jwt";

const feedback = new Hono();

/* ─── POST /feedback ────────────────────────────────────────────────────── */

feedback.post(
  "/feedback",
  authMiddleware,
  withApiRateLimit(),
  zValidator("json", z.object({ message: z.string().min(10).max(2000) })),
  async (c) => {
    const { uid, email } = c.get("user");
    const { message } = c.req.valid("json");
    const db = getDb();

    await db.from("feedback").insert({ uid, user_email: email, message });

    return c.json({ success: true, data: { message: "Feedback submitted. Thank you." } });
  }
);

/* ─── POST /metrics/web-vitals ──────────────────────────────────────────── */

feedback.post(
  "/metrics/web-vitals",
  withApiRateLimit(),
  zValidator(
    "json",
    z.object({
      metric: z.string().min(1),
      value: z.number(),
      route: z.string().min(1),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb();

    // Optionally attach uid if authenticated
    const authHeader = c.req.header("Authorization");
    let uid: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        
        const payload = await verifyJwt(authHeader.slice(7));
        uid = payload.uid;
      } catch {
        // Not authenticated — that's fine for web vitals
      }
    }

    await db.from("web_vitals").insert({
      metric: body.metric,
      value: body.value,
      route: body.route,
      uid,
    });

    return c.json({ success: true, data: {} });
  }
);

export default feedback;

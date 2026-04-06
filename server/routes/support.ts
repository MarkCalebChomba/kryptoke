import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { adminMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";

const support = new Hono();

/* ─── POST /tickets — user raises a ticket ──────────────────────────────── */

support.post(
  "/tickets",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator("json", z.object({
    type:         z.enum(["deposit", "withdrawal", "trade", "other"]),
    reference_id: z.string().uuid().optional(),
    subject:      z.string().min(5).max(200),
    description:  z.string().min(10).max(2000),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const body = c.req.valid("json");
    const db = getDb();

    // Rate limit: max 5 open tickets per user
    const { count } = await db
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("uid", uid)
      .in("status", ["open", "in_review"]);

    if ((count ?? 0) >= 5) {
      return c.json({ success: false, error: "Too many open tickets. Please wait for existing tickets to be resolved.", statusCode: 429 }, 429);
    }

    const { data: ticket, error } = await db
      .from("support_tickets")
      .insert({
        uid,
        type: body.type,
        reference_id: body.reference_id ?? null,
        subject: body.subject,
        description: body.description,
      })
      .select()
      .single();

    if (error || !ticket) {
      return c.json({ success: false, error: "Failed to create ticket", statusCode: 500 }, 500);
    }

    return c.json({ success: true, data: ticket }, 201);
  }
);

/* ─── GET /tickets — user's own tickets ─────────────────────────────────── */

support.get("/tickets", authMiddleware, withApiRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const db = getDb();

  const { data } = await db
    .from("support_tickets")
    .select("id, type, reference_id, subject, status, priority, admin_notes, created_at, updated_at")
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .limit(50);

  return c.json({ success: true, data: data ?? [] });
});

/* ─── GET /tickets/:id — single ticket ──────────────────────────────────── */

support.get("/tickets/:id", authMiddleware, withApiRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const { id } = c.req.param();
  const db = getDb();

  const { data, error } = await db
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .eq("uid", uid)
    .single();

  if (error || !data) return c.json({ success: false, error: "Ticket not found", statusCode: 404 }, 404);
  return c.json({ success: true, data });
});

/* ─── ADMIN: GET /admin/tickets — all tickets ───────────────────────────── */

support.get("/admin/tickets", adminMiddleware, withApiRateLimit(), async (c) => {
  const db = getDb();
  const status = c.req.query("status") ?? "open";
  const page = parseInt(c.req.query("page") ?? "1");
  const pageSize = 30;

  const { data, count } = await db
    .from("support_tickets")
    .select(`
      id, type, reference_id, subject, status, priority,
      admin_notes, created_at, updated_at,
      users!uid ( email, display_name )
    `, { count: "exact" })
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  return c.json({ success: true, data: data ?? [], meta: { total: count ?? 0, page, pageSize } });
});

/* ─── ADMIN: PATCH /admin/tickets/:id — update status/notes ─────────────── */

support.patch(
  "/admin/tickets/:id",
  adminMiddleware,
  zValidator("json", z.object({
    status:      z.enum(["open", "in_review", "resolved", "closed"]).optional(),
    priority:    z.enum(["low", "normal", "high", "urgent"]).optional(),
    admin_notes: z.string().max(2000).optional(),
  })),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const db = getDb();

    const updates: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
    if (body.status === "resolved" || body.status === "closed") {
      updates.resolved_at = new Date().toISOString();
    }

    const { data, error } = await db
      .from("support_tickets")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) return c.json({ success: false, error: "Ticket not found", statusCode: 404 }, 404);
    return c.json({ success: true, data });
  }
);

export default support;

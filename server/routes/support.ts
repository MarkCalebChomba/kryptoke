import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { adminMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";

const support = new Hono();

/* ─── Helpers ────────────────────────────────────────────────────────────── */

interface ClaudeMessage { role: "user" | "assistant"; content: string; }

/**
 * Call Claude claude-sonnet-4-20250514 with streaming disabled.
 * Uses ANTHROPIC_API_KEY from env — set this in Vercel.
 * Returns the text response, or throws on API error.
 */
async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  maxTokens = 600
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");

  return text.trim();
}

/**
 * Build a KryptoKe-specific system prompt with the user's live context.
 */
async function buildSystemPrompt(uid: string): Promise<string> {
  const db = getDb();

  // Fetch user + recent tickets for context
  const [{ data: user }, { data: tickets }] = await Promise.all([
    db.from("users").select("email, display_name, kyc_status, country_code, phone").eq("uid", uid).single(),
    db.from("support_tickets")
      .select("type, subject, status, created_at")
      .eq("uid", uid)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const userName = user?.display_name ?? user?.email?.split("@")[0] ?? "the user";
  const kycStatus = user?.kyc_status ?? "unknown";
  const country = user?.country_code ?? "KE";
  const recentTickets = (tickets ?? [])
    .map((t) => `- ${t.type}: "${t.subject}" (${t.status})`)
    .join("\n") || "None";

  return `You are KryptoKe Support AI, the helpful assistant for KryptoKe — Kenya's crypto exchange.

User context:
- Name: ${userName}
- KYC status: ${kycStatus}
- Country: ${country}
- Recent support tickets:\n${recentTickets}

Your job:
1. Answer questions about KryptoKe features: M-Pesa deposits/withdrawals, crypto trading, P2P, wallet, security.
2. Guide users through common issues: stuck deposits, failed withdrawals, OTP problems, KYC submission.
3. For issues you can't resolve, help the user raise a support ticket with the right details.
4. Keep responses SHORT — 2–4 sentences max unless a step-by-step guide is needed.
5. Be warm, direct, and use plain language. Avoid jargon. This is a Kenyan audience.
6. Never make up transaction details, balances, or exchange rates. Say "I don't have access to live transaction data — please raise a ticket for this."
7. Never ask for passwords, PINs, or seed phrases.
8. If the user seems frustrated, acknowledge it briefly before helping.

Platform facts:
- M-Pesa deposits: STK push, minimum KSh 10, credited as USDT at live rate
- M-Pesa withdrawals: B2C, processed within 5 minutes during business hours
- Crypto supported: BTC, ETH, USDT, BNB, SOL, XRP, TRX, DOGE and 40+ more
- Support email: support@kryptoke.com
- P2P trading: escrow-protected, KYC-verified merchants only`;
}

/* ─── POST /chat — conversational AI support ────────────────────────────── */

support.post(
  "/chat",
  authMiddleware,
  withApiRateLimit(),
  zValidator(
    "json",
    z.object({
      message: z.string().min(1).max(1000),
      history: z
        .array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(2000),
        }))
        .max(20)
        .default([]),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { message, history } = c.req.valid("json");

    let systemPrompt: string;
    try {
      systemPrompt = await buildSystemPrompt(uid);
    } catch {
      systemPrompt = "You are KryptoKe Support AI. Help users with questions about the KryptoKe crypto exchange. Keep responses short and helpful.";
    }

    // Append the new user message to history
    const messages: ClaudeMessage[] = [
      ...history,
      { role: "user", content: message },
    ];

    try {
      const reply = await callClaude(systemPrompt, messages, 600);
      return c.json({ success: true, data: { reply } });
    } catch (err) {
      console.error("[SupportAI] Claude call failed:", err);
      return c.json({
        success: true,
        data: {
          reply:
            "I'm having trouble connecting right now. For urgent issues, email support@kryptoke.com or raise a ticket in the app.",
        },
      });
    }
  }
);

/* ─── POST /ai-suggest — AI drafts a ticket description ─────────────────── */

support.post(
  "/ai-suggest",
  authMiddleware,
  withApiRateLimit(),
  zValidator(
    "json",
    z.object({
      type: z.enum(["deposit", "withdrawal", "trade", "other"]),
      brief: z.string().min(10).max(500),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { type, brief } = c.req.valid("json");

    const systemPrompt = `You are a support ticket assistant for KryptoKe, a Kenyan crypto exchange.
The user will describe a problem in a few words. Your job is to write a clear, structured support ticket description.
Format: 2–3 sentences. Include what the user tried, what happened, and what they expected.
Do not make up specifics (amounts, dates) the user did not provide. Write in first person as the user.`;

    const messages: ClaudeMessage[] = [
      {
        role: "user",
        content: `Issue type: ${type}\nUser description: ${brief}\n\nWrite a clear support ticket description for me.`,
      },
    ];

    try {
      const suggestion = await callClaude(systemPrompt, messages, 300);
      return c.json({ success: true, data: { suggestion } });
    } catch {
      return c.json({ success: true, data: { suggestion: brief } });
    }
  }
);

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

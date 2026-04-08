import { Hono } from "hono";
import { adminMiddleware } from "@/server/middleware/auth";
import { getDb } from "@/server/db/client";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const admin = new Hono();

// All admin routes require admin role
admin.use("*", adminMiddleware);

/* ─── GET /dashboard ────────────────────────────────────────────────────── */

admin.get("/dashboard", async (c) => {
  const db = getDb();
  const now = new Date();
  const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    { count: totalUsers },
    { count: totalUsersLastWeek },
    { data: depositsToday },
    { data: withdrawalsToday },
    { count: pendingOrders },
    { data: revenueToday },
    { count: anomalyCount },
  ] = await Promise.all([
    db.from("users").select("*", { count: "exact", head: true }),
    db.from("users").select("*", { count: "exact", head: true }).lt("created_at", weekAgo),
    db.from("deposits").select("amount_kes, usdt_credited").eq("status", "completed").gte("created_at", todayStart),
    db.from("withdrawals").select("amount").eq("status", "completed").gte("created_at", todayStart),
    db.from("trades").select("*", { count: "exact", head: true }).eq("status", "pending_fulfillment"),
    db.from("ledger_entries").select("amount").eq("type", "fee").gte("created_at", todayStart),
    db.from("anomalies").select("*", { count: "exact", head: true }).eq("resolved", false).gte("created_at", todayStart),
  ]);

  const depositsTodayKes = (depositsToday ?? [])
    .reduce((s, d) => s + parseFloat(d.amount_kes ?? "0"), 0)
    .toFixed(2);

  const depositsTodayUsdt = (depositsToday ?? [])
    .reduce((s, d) => s + parseFloat(d.usdt_credited ?? "0"), 0)
    .toFixed(4);

  const withdrawalsTodayKes = (withdrawalsToday ?? [])
    .reduce((s, w) => s + parseFloat(w.amount ?? "0"), 0)
    .toFixed(2);

  const revenueToday_val = (revenueToday ?? [])
    .reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0)
    .toFixed(4);

  const userGrowthPct = totalUsersLastWeek && totalUsers
    ? (((totalUsers - totalUsersLastWeek) / totalUsersLastWeek) * 100).toFixed(1)
    : "0";

  return c.json({
    success: true,
    data: {
      totalUsers: totalUsers ?? 0,
      totalUsersChange: parseFloat(userGrowthPct),
      activeToday: 0, // requires session tracking
      depositsTodayKes,
      depositsTodayUsdt,
      withdrawalsTodayKes,
      pendingOrders: pendingOrders ?? 0,
      revenueToday: revenueToday_val,
      anomalyCount: anomalyCount ?? 0,
    },
  });
});

/* ─── GET /orders/pending ───────────────────────────────────────────────── */

admin.get("/orders/pending", async (c) => {
  const db = getDb();
  const { data } = await db
    .from("trades")
    .select(`
      id, uid, token_in, token_out, amount_in, amount_out, price, side, order_type, status, created_at,
      users!inner(email, phone, deposit_address)
    `)
    .eq("status", "pending_fulfillment")
    .order("created_at", { ascending: true });

  return c.json({ success: true, data: data ?? [] });
});

/* ─── POST /orders/:id/fulfill ──────────────────────────────────────────── */

admin.post(
  "/orders/:id/fulfill",
  zValidator("json", z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })),
  async (c) => {
    const { id } = c.req.param();
    const { txHash } = c.req.valid("json");
    const db = getDb();

    const { data: trade } = await db
      .from("trades")
      .select("*")
      .eq("id", id)
      .eq("status", "pending_fulfillment")
      .single();

    if (!trade) {
      return c.json({ success: false, error: "Order not found or already fulfilled", statusCode: 404 }, 404);
    }

    // Verify tx on-chain
    const { verifyTransaction } = await import("@/server/services/blockchain");
    const verification = await verifyTransaction(txHash);

    if (!verification.success) {
      return c.json({
        success: false,
        error: "Transaction not confirmed on chain. Please verify the hash.",
        statusCode: 400,
      }, 400);
    }

    // Update trade
    await db.from("trades").update({ status: "completed", tx_hash: txHash }).eq("id", id);

    // Credit user trading balance
    const { getBalance, upsertBalance, createLedgerEntry } = await import("@/server/db/balances");
    if (trade.amount_out) {
      const balance = await getBalance(trade.uid, trade.token_out, "trading");
      const { add } = await import("@/lib/utils/money");
      await upsertBalance(trade.uid, trade.token_out, add(balance, trade.amount_out), "trading");
      await createLedgerEntry({
        uid: trade.uid,
        asset: trade.token_out,
        amount: trade.amount_out,
        type: "trade",
        reference_id: trade.id,
        note: `Admin fulfilled — txHash: ${txHash}`,
      });
    }

    // Notify user
    const { Notifications } = await import("@/server/services/notifications");
    const tokenSymbol = trade.token_out.replace(/0x[0-9a-fA-F]{40}/i, "TOKEN");
    await Notifications.orderFilled(trade.uid, tokenSymbol, trade.side, trade.amount_in, trade.id);

    return c.json({ success: true, data: { tradeId: id, txHash, status: "completed" } });
  }
);

/* ─── GET /users ────────────────────────────────────────────────────────── */

admin.get("/users", async (c) => {
  const db = getDb();
  const page = parseInt(c.req.query("page") ?? "1");
  const search = c.req.query("search") ?? "";
  const pageSize = 25;

  let query = db
    .from("users")
    .select("uid, email, phone, deposit_address, kyc_status, created_at, last_active_at", { count: "exact" });

  if (search) {
    query = query.or(`email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  return c.json({
    success: true,
    data: {
      items: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
      hasMore: (count ?? 0) > page * pageSize,
    },
  });
});

/* ─── GET /users/:uid ───────────────────────────────────────────────────── */

admin.get("/users/:uid", async (c) => {
  const { uid } = c.req.param();
  const db = getDb();

  const [
    { data: user },
    { data: balances },
    { data: deposits },
    { data: withdrawals },
    { data: trades },
  ] = await Promise.all([
    db.from("users").select("*").eq("uid", uid).single(),
    db.from("balances").select("*").eq("uid", uid),
    db.from("deposits").select("*").eq("uid", uid).order("created_at", { ascending: false }).limit(20),
    db.from("withdrawals").select("*").eq("uid", uid).order("created_at", { ascending: false }).limit(20),
    db.from("trades").select("*").eq("uid", uid).order("created_at", { ascending: false }).limit(20),
  ]);

  if (!user) return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);

  return c.json({ success: true, data: { user, balances, deposits, withdrawals, trades } });
});

/* ─── PATCH /users/:uid/balance — manual adjustment with audit log ──────── */

admin.patch(
  "/users/:uid/balance",
  zValidator(
    "json",
    z.object({
      asset: z.string().min(1),
      amount: z.string(),
      reason: z.string().min(5, "Reason must be at least 5 characters"),
    })
  ),
  async (c) => {
    const { uid } = c.req.param();
    const { asset, amount, reason } = c.req.valid("json");
    const adminUser = c.get("user");
    const db = getDb();

    const { getBalance, upsertBalance, createLedgerEntry } = await import("@/server/db/balances");
    const { add } = await import("@/lib/utils/money");

    const current = await getBalance(uid, asset, "funding");
    const newBalance = add(current, amount);

    if (parseFloat(newBalance) < 0) {
      return c.json({ success: false, error: "Balance cannot go below zero", statusCode: 400 }, 400);
    }

    await upsertBalance(uid, asset, newBalance, "funding");
    await createLedgerEntry({
      uid,
      asset,
      amount,
      type: "admin_adjustment",
      note: `Admin adjustment by ${adminUser.email}. Reason: ${reason}`,
    });

    return c.json({
      success: true,
      data: { uid, asset, previousBalance: current, newBalance, reason },
    });
  }
);

/* ─── GET /transactions ─────────────────────────────────────────────────── */

admin.get("/transactions", async (c) => {
  const db = getDb();
  const page = parseInt(c.req.query("page") ?? "1");
  const type = c.req.query("type");
  const pageSize = 50;

  let query = db
    .from("ledger_entries")
    .select("*, users!inner(email)", { count: "exact" });

  if (type) query = query.eq("type", type);

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  return c.json({
    success: true,
    data: { items: data ?? [], total: count ?? 0, page, pageSize },
  });
});

/* ─── GET /system/health ────────────────────────────────────────────────── */

admin.get("/system/health", async (c) => {
  const { redis } = await import("@/lib/redis/client");

  const checks = await Promise.allSettled([
    // DB check
    (async () => {
      const start = Date.now();
      const db = getDb();
      await db.from("system_config").select("key").limit(1);
      return { name: "Supabase DB", responseTimeMs: Date.now() - start };
    })(),
    // Redis check
    (async () => {
      const start = Date.now();
      await redis.ping();
      return { name: "Upstash Redis", responseTimeMs: Date.now() - start };
    })(),
    // Binance check
    (async () => {
      const start = Date.now();
      const res = await fetch("https://api.binance.com/api/v3/ping", { signal: AbortSignal.timeout(5000) });
      return { name: "Binance API", responseTimeMs: Date.now() - start, ok: res.ok };
    })(),
    // M-Pesa check (OAuth token cache presence)
    (async () => {
      const cached = await redis.get("mpesa:oauth_token");
      return { name: "Safaricom M-Pesa", cached: !!cached };
    })(),
  ]);

  const services = checks.map((r, i) => {
    const names = ["Supabase DB", "Upstash Redis", "Binance API", "Safaricom M-Pesa"];
    return {
      name: names[i],
      status: r.status === "fulfilled" ? "up" : "down",
      ...(r.status === "fulfilled" ? r.value : { error: (r.reason as Error).message }),
    };
  });

  // Hot wallet balance
  const hotWalletAddress = process.env.HOT_WALLET_ADDRESS;
  let hotWalletStatus = null;
  if (hotWalletAddress) {
    const { getBnbBalance, getTokenBalance, TOKENS } = await import("@/server/services/blockchain");
    const [bnb, usdt] = await Promise.all([
      getBnbBalance(hotWalletAddress).catch(() => "0"),
      getTokenBalance(hotWalletAddress, TOKENS.USDT).catch(() => "0"),
    ]);
    hotWalletStatus = { address: hotWalletAddress, bnb, usdt };
  }

  // Recent anomalies
  const db = getDb();
  const { data: anomalies } = await db
    .from("anomalies")
    .select("id, type, description, severity, created_at")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(10);

  // Balance reconciliation
  const { data: discrepancies } = await db.rpc("reconcile_balances");

  return c.json({
    success: true,
    data: {
      services,
      hotWallet: hotWalletStatus,
      anomalies: anomalies ?? [],
      balanceDiscrepancies: discrepancies ?? [],
      timestamp: new Date().toISOString(),
    },
  });
});

/* ─── GET /metrics ──────────────────────────────────────────────────────── */

admin.get("/metrics", async (c) => {
  const db = getDb();
  const since = new Date(Date.now() - 60 * 60_000).toISOString();

  const { data: metrics } = await db
    .from("api_metrics")
    .select("route, duration_ms, status_code")
    .gte("created_at", since);

  if (!metrics) return c.json({ success: true, data: [] });

  const byRoute = new Map<string, number[]>();
  for (const m of metrics) {
    const arr = byRoute.get(m.route) ?? [];
    arr.push(m.duration_ms);
    byRoute.set(m.route, arr);
  }

  const summary = Array.from(byRoute.entries()).map(([route, durations]) => {
    const sorted = [...durations].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    return { route, count: durations.length, p50, p95, p99 };
  }).sort((a, b) => b.count - a.count);

  return c.json({ success: true, data: summary });
});

/* ─── GET /feedback ─────────────────────────────────────────────────────── */

admin.get("/feedback", async (c) => {
  const db = getDb();
  const { data, count } = await db
    .from("feedback")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(50);

  return c.json({ success: true, data: { items: data ?? [], total: count ?? 0 } });
});

/* ─── PATCH /feedback/:id ───────────────────────────────────────────────── */

admin.patch(
  "/feedback/:id",
  zValidator("json", z.object({ status: z.enum(["read", "resolved"]) })),
  async (c) => {
    const { id } = c.req.param();
    const { status } = c.req.valid("json");
    const db = getDb();
    await db.from("feedback").update({ status }).eq("id", id);
    return c.json({ success: true, data: { id, status } });
  }
);

/* ─── POST /announcements ───────────────────────────────────────────────── */

admin.post(
  "/announcements",
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).max(100),
      body: z.string().min(1).max(500),
      type: z.enum(["info", "warning", "promotion"]),
      published: z.boolean().default(false),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb();
    const { data } = await db.from("announcements").insert(body).select().single();
    return c.json({ success: true, data }, 201);
  }
);

/* ─── GET /announcements/published ─────────────────────────────────────── */

admin.get("/announcements/published", async (c) => {
  const db = getDb();
  const { data } = await db
    .from("announcements")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(10);

  return c.json({ success: true, data: data ?? [] });
});

/* ─── POST /events ──────────────────────────────────────────────────────── */

admin.post(
  "/events",
  zValidator(
    "json",
    z.object({
      title: z.string().min(1),
      type: z.enum(["SPOT", "FUTURES", "VESTING", "MAINTENANCE", "LISTING"]),
      date: z.string().datetime(),
      badgeColor: z.string().default("#00E5B4"),
      published: z.boolean().default(false),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb();
    const { data } = await db
      .from("events")
      .insert({ ...body, badge_color: body.badgeColor })
      .select()
      .single();
    return c.json({ success: true, data }, 201);
  }
);


/* ─── GET /events — list all events ─────────────────────────────────────── */

admin.get("/events/published", async (c) => {
  const db = getDb();
  const { data } = await db.from("events").select("*").order("date", { ascending: true });
  return c.json({ success: true, data: data ?? [] });
});

/* ─── PATCH /events/:id — update event ──────────────────────────────────── */

admin.patch(
  "/events/:id",
  zValidator("json", z.object({
    title: z.string().min(1).optional(),
    type: z.enum(["SPOT", "FUTURES", "VESTING", "MAINTENANCE", "LISTING"]).optional(),
    date: z.string().datetime().optional(),
    badgeColor: z.string().optional(),
    published: z.boolean().optional(),
  })),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const db = getDb();
    const update: Record<string, unknown> = {};
    if (body.title !== undefined)      update.title = body.title;
    if (body.type !== undefined)       update.type = body.type;
    if (body.date !== undefined)       update.date = body.date;
    if (body.badgeColor !== undefined) update.badge_color = body.badgeColor;
    if (body.published !== undefined)  update.published = body.published;
    const { data } = await db.from("events").update(update).eq("id", id).select().single();
    return c.json({ success: true, data });
  }
);



/* ─── GET /alerts/anomalies ─────────────────────────────────────────────── */

admin.get("/alerts/anomalies", async (c) => {
  const db = getDb();
  const { data } = await db
    .from("anomalies")
    .select("*")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(50);

  return c.json({ success: true, data: data ?? [] });
});

/* ─── GET /system/config ────────────────────────────────────────────────── */

admin.get("/system/config", async (c) => {
  const db = getDb();
  const { data } = await db.from("system_config").select("*");
  const config = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return c.json({ success: true, data: config });
});

/* ─── PATCH /system/config ──────────────────────────────────────────────── */

admin.patch(
  "/system/config",
  zValidator("json", z.record(z.string())),
  async (c) => {
    const updates = c.req.valid("json");
    const db = getDb();

    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        db
          .from("system_config")
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
      )
    );

    const { redis, CacheKeys } = await import("@/lib/redis/client");
    await redis.del(CacheKeys.systemConfig());

    return c.json({ success: true, data: { updated: Object.keys(updates) } });
  }
);

/* ═══════════════════════════════════════════════════════════════════════════
   CHAIN MANAGEMENT
   Admins can add/enable/disable EVM chains from the frontend without a deploy.
   Chains are stored in system_config under key "chains_config" as JSON.
   On startup, blockchain.ts merges these with the hardcoded CHAINS defaults.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── GET /chains — list all registered chains ───────────────────────────── */

admin.get("/chains", async (c) => {
  const { CHAINS, ACTIVE_DEPOSIT_CHAIN_IDS } = await import("@/server/services/blockchain");
  const db = getDb();

  // Load any admin-added chains from DB
  const { data: configRow } = await db
    .from("system_config")
    .select("value")
    .eq("key", "chains_config")
    .single();

  const dbChains: Record<string, unknown>[] = configRow?.value
    ? JSON.parse(configRow.value as string)
    : [];

  // Merge hardcoded + DB chains
  const all = [
    ...Object.values(CHAINS).map((chain) => ({
      ...chain,
      active: ACTIVE_DEPOSIT_CHAIN_IDS.has(chain.id),
      source: "hardcoded",
    })),
    ...dbChains.map((c) => ({ ...c, source: "admin" })),
  ];

  return c.json({ success: true, data: all });
});

/* ─── POST /chains — add a new EVM chain ─────────────────────────────────── */

admin.post(
  "/chains",
  zValidator(
    "json",
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(100),
      nativeSymbol: z.string().min(1).max(10),
      rpcUrl: z.string().url("Must be a valid RPC URL"),
      explorerUrl: z.string().url("Must be a valid explorer URL"),
      explorerTxPath: z.string().default("/tx/"),
      usdtAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().default(null),
      usdcAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().default(null),
      confirmationsRequired: z.number().int().min(1).default(1),
      arrivalTime: z.string().default("~1 minute"),
      approxFee: z.string().default("~$0.10"),
      recommended: z.boolean().default(false),
      warning: z.string().nullable().default(null),
      active: z.boolean().default(true),
    })
  ),
  async (c) => {
    const newChain = c.req.valid("json");
    const db = getDb();

    // Load existing custom chains
    const { data: configRow } = await db
      .from("system_config")
      .select("value")
      .eq("key", "chains_config")
      .single();

    const existing: typeof newChain[] = configRow?.value
      ? JSON.parse(configRow.value as string)
      : [];

    // Check for duplicate chain ID
    const { CHAINS } = await import("@/server/services/blockchain");
    if (CHAINS[newChain.id]) {
      return c.json({
        success: false,
        error: `Chain ${newChain.id} (${CHAINS[newChain.id]!.name}) is already hardcoded. Toggle it active/inactive instead.`,
        statusCode: 409,
      }, 409);
    }

    if (existing.some((e) => e.id === newChain.id)) {
      return c.json({
        success: false,
        error: `Chain ID ${newChain.id} already exists`,
        statusCode: 409,
      }, 409);
    }

    const updated = [...existing, newChain];
    await db.from("system_config").upsert({
      key: "chains_config",
      value: JSON.stringify(updated),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    return c.json({ success: true, data: newChain }, 201);
  }
);

/* ─── PATCH /chains/:id — toggle active / update fields ─────────────────── */

admin.patch(
  "/chains/:id",
  zValidator(
    "json",
    z.object({
      active: z.boolean().optional(),
      recommended: z.boolean().optional(),
      rpcUrl: z.string().url().optional(),
      warning: z.string().nullable().optional(),
    })
  ),
  async (c) => {
    const chainId = parseInt(c.req.param("id"));
    const updates = c.req.valid("json");
    const db = getDb();

    // Hardcoded chains: store override in active_chain_overrides
    const { CHAINS, ACTIVE_DEPOSIT_CHAIN_IDS } = await import("@/server/services/blockchain");
    if (CHAINS[chainId]) {
      const { data: overridesRow } = await db
        .from("system_config")
        .select("value")
        .eq("key", "active_chain_overrides")
        .single();

      const overrides: Record<string, boolean> = overridesRow?.value
        ? JSON.parse(overridesRow.value as string)
        : {};

      if (typeof updates.active === "boolean") {
        overrides[String(chainId)] = updates.active;
      }

      await db.from("system_config").upsert({
        key: "active_chain_overrides",
        value: JSON.stringify(overrides),
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

      return c.json({ success: true, data: { chainId, updates } });
    }

    // Admin-added chains: update in chains_config
    const { data: configRow } = await db
      .from("system_config")
      .select("value")
      .eq("key", "chains_config")
      .single();

    const chains: Record<string, unknown>[] = configRow?.value
      ? JSON.parse(configRow.value as string)
      : [];

    const idx = chains.findIndex((ch) => (ch as { id: number }).id === chainId);
    if (idx === -1) {
      return c.json({ success: false, error: "Chain not found", statusCode: 404 }, 404);
    }

    chains[idx] = { ...chains[idx], ...updates };
    await db.from("system_config").upsert({
      key: "chains_config",
      value: JSON.stringify(chains),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    return c.json({ success: true, data: chains[idx] });
  }
);

/* ─── DELETE /chains/:id — remove admin-added chain only ────────────────── */

admin.delete("/chains/:id", async (c) => {
  const chainId = parseInt(c.req.param("id"));
  const db = getDb();

  const { CHAINS } = await import("@/server/services/blockchain");
  if (CHAINS[chainId]) {
    return c.json({
      success: false,
      error: "Cannot delete a hardcoded chain. Use PATCH to disable it instead.",
      statusCode: 400,
    }, 400);
  }

  const { data: configRow } = await db
    .from("system_config")
    .select("value")
    .eq("key", "chains_config")
    .single();

  const chains: Record<string, unknown>[] = configRow?.value
    ? JSON.parse(configRow.value as string)
    : [];

  const filtered = chains.filter((ch) => (ch as { id: number }).id !== chainId);
  await db.from("system_config").upsert({
    key: "chains_config",
    value: JSON.stringify(filtered),
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });

  return c.json({ success: true, data: { deleted: chainId } });
});

/* ═══════════════════════════════════════════════════════════════════════════
   COIN / TOKEN MANAGEMENT
   Full CRUD for the tokens table from the admin frontend.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── GET /coins — list all tokens ──────────────────────────────────────── */

admin.get("/coins", async (c) => {
  const db = getDb();
  const { data, count } = await db
    .from("tokens")
    .select("*", { count: "exact" })
    .order("whitelisted_at", { ascending: false });

  return c.json({ success: true, data: { items: data ?? [], total: count ?? 0 } });
});

/* ─── POST /coins — add a new coin/token ─────────────────────────────────── */

admin.post(
  "/coins",
  zValidator(
    "json",
    z.object({
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM address").transform((s) => s.toLowerCase()),
      symbol: z.string().min(1).max(20).toUpperCase(),
      name: z.string().min(1).max(100),
      decimals: z.number().int().min(0).max(18).default(18),
      coingeckoId: z.string().optional().nullable(),
      iconUrl: z.string().url().optional().nullable(),
      isSeed: z.boolean().default(false),
      isNew: z.boolean().default(true),
      chainIds: z.array(z.number()).default([56]),
      addresses: z.record(z.string()).default({}), // { "56": "0x...", "1": "0x..." }
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb();

    // Check duplicate
    const { data: existing } = await db
      .from("tokens")
      .select("address")
      .eq("address", body.address)
      .single();

    if (existing) {
      return c.json({ success: false, error: "Token already exists", statusCode: 409 }, 409);
    }

    // Auto-fetch contract info from blockchain if possible
    let autoName = body.name;
    let autoSymbol = body.symbol;
    let autoDecimals = body.decimals;

    try {
      const { getContractInfo } = await import("@/server/services/blockchain");
      const info = await getContractInfo(body.address, body.chainIds[0] ?? 56);
      if (info) {
        autoName = body.name || info.name;
        autoSymbol = body.symbol || info.symbol;
        autoDecimals = info.decimals;
      }
    } catch {
      // Use provided values if auto-fetch fails
    }

    const { data: token, error } = await db
      .from("tokens")
      .insert({
        address: body.address,
        symbol: autoSymbol,
        name: autoName,
        decimals: autoDecimals,
        coingecko_id: body.coingeckoId ?? null,
        icon_url: body.iconUrl ?? null,
        is_new: body.isNew,
        is_seed: body.isSeed,
        chain_ids: body.chainIds,
        addresses: body.addresses,
      })
      .select()
      .single();

    if (error || !token) {
      return c.json({ success: false, error: error?.message ?? "Failed to add token", statusCode: 500 }, 500);
    }

    return c.json({ success: true, data: token }, 201);
  }
);

/* ─── PATCH /coins/:address — edit token metadata ────────────────────────── */

admin.patch(
  "/coins/:address",
  zValidator(
    "json",
    z.object({
      symbol: z.string().min(1).max(20).optional(),
      name: z.string().min(1).max(100).optional(),
      iconUrl: z.string().url().nullable().optional(),
      coingeckoId: z.string().nullable().optional(),
      isSeed: z.boolean().optional(),
      isNew: z.boolean().optional(),
      chainIds: z.array(z.number()).optional(),
      addresses: z.record(z.string()).optional(),
    })
  ),
  async (c) => {
    const { address } = c.req.param();
    const body = c.req.valid("json");
    const db = getDb();

    const updateData: Record<string, unknown> = {};
    if (body.symbol !== undefined)     updateData.symbol = body.symbol.toUpperCase();
    if (body.name !== undefined)       updateData.name = body.name;
    if (body.iconUrl !== undefined)    updateData.icon_url = body.iconUrl;
    if (body.coingeckoId !== undefined) updateData.coingecko_id = body.coingeckoId;
    if (body.isSeed !== undefined)     updateData.is_seed = body.isSeed;
    if (body.isNew !== undefined)      updateData.is_new = body.isNew;
    if (body.chainIds !== undefined)   updateData.chain_ids = body.chainIds;
    if (body.addresses !== undefined)  updateData.addresses = body.addresses;

    const { data: token, error } = await db
      .from("tokens")
      .update(updateData)
      .eq("address", address.toLowerCase())
      .select()
      .single();

    if (error || !token) {
      return c.json({ success: false, error: "Token not found or update failed", statusCode: 404 }, 404);
    }

    return c.json({ success: true, data: token });
  }
);

/* ─── DELETE /coins/:address — remove a token ───────────────────────────── */

admin.delete("/coins/:address", async (c) => {
  const { address } = c.req.param();
  const db = getDb();

  const { error } = await db
    .from("tokens")
    .delete()
    .eq("address", address.toLowerCase());

  if (error) {
    return c.json({ success: false, error: "Failed to remove token", statusCode: 500 }, 500);
  }

  return c.json({ success: true, data: { deleted: address } });
});

/* ─── POST /coins/:address/verify — re-fetch metadata from chain ─────────── */

admin.post("/coins/:address/verify", async (c) => {
  const { address } = c.req.param();
  const chainId = parseInt(c.req.query("chainId") ?? "56");

  try {
    const { getContractInfo } = await import("@/server/services/blockchain");
    const info = await getContractInfo(address, chainId);

    if (!info) {
      return c.json({ success: false, error: "Could not fetch contract info from chain", statusCode: 404 }, 404);
    }

    return c.json({ success: true, data: info });
  } catch (err) {
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : "Verification failed",
      statusCode: 500,
    }, 500);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   CHAIN FEE MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── GET /chain-fees — list all chain fee configs ────────────────────────── */

admin.get("/chain-fees", async (c) => {
  const db = getDb();
  const { data } = await db.from("chain_fees").select("*").order("chain_id");
  return c.json({ success: true, data: data ?? [] });
});

/* ─── PATCH /chain-fees/:chainId — update fee for a chain ────────────────── */

admin.patch(
  "/chain-fees/:chainId",
  zValidator("json", z.object({
    withdraw_flat:    z.number().min(0).optional(),
    withdraw_pct:     z.number().min(0).max(1).optional(),
    min_withdraw:     z.number().min(0).optional(),
    max_withdraw:     z.number().min(0).nullable().optional(),
    deposit_enabled:  z.boolean().optional(),
    withdraw_enabled: z.boolean().optional(),
    // Accept camelCase from frontend
    withdrawFlat:     z.number().min(0).optional(),
    withdrawPct:      z.number().min(0).max(1).optional(),
  })),
  async (c) => {
    const { chainId } = c.req.param();
    const body = c.req.valid("json");
    // Normalise to snake_case
    const updates = {
      withdraw_flat:    body.withdraw_flat    ?? body.withdrawFlat,
      withdraw_pct:     body.withdraw_pct     ?? body.withdrawPct,
      min_withdraw:     body.min_withdraw,
      max_withdraw:     body.max_withdraw,
      deposit_enabled:  body.deposit_enabled,
      withdraw_enabled: body.withdraw_enabled,
    };
    // Remove undefined
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const db = getDb();
    const { error } = await db
      .from("chain_fees")
      .upsert({ chain_id: chainId, chain_name: chainId, ...clean, updated_at: new Date().toISOString() }, { onConflict: "chain_id" });
    if (error) return c.json({ success: false, error: error.message, statusCode: 500 }, 500);
    return c.json({ success: true });
  }
);

/* ─── GET /native-fees — native coin fee config from system_config ─────── */

admin.get("/native-fees", async (c) => {
  const db = getDb();
  const { data } = await db.from("system_config").select("key, value").like("key", "fee_native_%");
  const fees: Record<string, string> = {};
  for (const row of data ?? []) {
    const chain = (row.key as string).replace("fee_native_", "");
    fees[chain] = row.value as string;
  }
  return c.json({ success: true, data: fees });
});

/* ─── PATCH /native-fees/:chain — update native coin fee ─────────────────── */

admin.patch(
  "/native-fees/:chain",
  zValidator("json", z.object({ fee: z.string().regex(/^\d+(\.\d+)?$/) })),
  async (c) => {
    const chain = c.req.param("chain").toUpperCase();
    const { fee } = c.req.valid("json");
    const db = getDb();
    await db.from("system_config")
      .upsert({ key: `fee_native_${chain}`, value: fee }, { onConflict: "key" });
    return c.json({ success: true });
  }
);

/* ═══════════════════════════════════════════════════════════════════════════
   PER-TOKEN PER-CHAIN FREEZE
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── GET /freezes — list all freeze records ─────────────────────────────── */

admin.get("/freezes", async (c) => {
  const db = getDb();
  const { data } = await db
    .from("token_chain_freeze")
    .select("*")
    .order("token_symbol")
    .order("chain_id");
  return c.json({ success: true, data: data ?? [] });
});

/* ─── GET /freezes/:token/:chain — get freeze status for token+chain ───── */

admin.get("/freezes/:token/:chain", async (c) => {
  const { token, chain } = c.req.param();
  const db = getDb();
  const { data } = await db
    .from("token_chain_freeze")
    .select("*")
    .eq("token_symbol", token.toUpperCase())
    .eq("chain_id", chain)
    .maybeSingle();
  return c.json({ success: true, data: data ?? { deposit_frozen: false, withdraw_frozen: false } });
});

/* ─── PUT /freezes/:token/:chain — set freeze status ─────────────────────── */

admin.put(
  "/freezes/:token/:chain",
  zValidator("json", z.object({
    deposit_frozen:  z.boolean(),
    withdraw_frozen: z.boolean(),
    freeze_reason:   z.string().max(500).optional(),
  })),
  async (c) => {
    const { token, chain } = c.req.param();
    const body = c.req.valid("json");
    const adminUser = c.get("user") as { uid: string };
    const db = getDb();

    const { error } = await db.from("token_chain_freeze").upsert(
      {
        token_symbol:    token.toUpperCase(),
        chain_id:        chain,
        deposit_frozen:  body.deposit_frozen,
        withdraw_frozen: body.withdraw_frozen,
        freeze_reason:   body.freeze_reason ?? null,
        frozen_by:       adminUser.uid,
        frozen_at:       (body.deposit_frozen || body.withdraw_frozen) ? new Date().toISOString() : null,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: "token_symbol,chain_id" }
    );

    if (error) return c.json({ success: false, error: error.message, statusCode: 500 }, 500);
    return c.json({ success: true });
  }
);

/* ═══════════════════════════════════════════════════════════════════════════
   WITHDRAWAL QUEUE ADMIN APPROVAL
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── GET /token-freeze/:symbol — alias used by admin coins page ──────────── */

admin.get("/token-freeze/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const db = getDb();
  // Return all freeze records for this token, merged with chain list
  const [{ data: fees }, { data: freezes }] = await Promise.all([
    db.from("chain_fees").select("chain_id, chain_name").order("chain_id"),
    db.from("token_chain_freeze").select("chain_id, deposit_frozen, withdraw_frozen").eq("token_symbol", symbol),
  ]);
  const freezeMap = new Map((freezes ?? []).map((f) => [f.chain_id, f]));
  const result = (fees ?? []).map((c) => ({
    chain_id: c.chain_id,
    chain_name: c.chain_name,
    deposit_frozen:  freezeMap.get(c.chain_id)?.deposit_frozen  ?? false,
    withdraw_frozen: freezeMap.get(c.chain_id)?.withdraw_frozen ?? false,
  }));
  return c.json({ success: true, data: result });
});

/* ─── PATCH /token-freeze — set freeze for token+chain (alias) ───────────── */

admin.patch(
  "/token-freeze",
  zValidator("json", z.object({
    tokenSymbol:    z.string().min(1).max(20),
    chainId:        z.string().min(1).max(20),
    depositFrozen:  z.boolean(),
    withdrawFrozen: z.boolean(),
  })),
  async (c) => {
    const { tokenSymbol, chainId, depositFrozen, withdrawFrozen } = c.req.valid("json");
    const adminUser = c.get("user");
    const db = getDb();
    const { error } = await db.from("token_chain_freeze").upsert({
      token_symbol:    tokenSymbol.toUpperCase(),
      chain_id:        chainId,
      deposit_frozen:  depositFrozen,
      withdraw_frozen: withdrawFrozen,
      frozen_by:       adminUser.uid,
      frozen_at:       (depositFrozen || withdrawFrozen) ? new Date().toISOString() : null,
      updated_at:      new Date().toISOString(),
    }, { onConflict: "token_symbol,chain_id" });
    if (error) return c.json({ success: false, error: error.message, statusCode: 500 }, 500);
    return c.json({ success: true });
  }
);

/* ─── GET /withdrawal-queue — list awaiting_admin withdrawals ────────────── */

admin.get("/withdrawal-queue", async (c) => {
  const db = getDb();
  const statusParam = c.req.query("status") ?? "";
  const page = Math.max(parseInt(c.req.query("page") ?? "1"), 1);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 100);

  let query = db
    .from("withdrawal_queue")
    .select("*, users!withdrawal_queue_uid_fkey(email, display_name, phone)", { count: "exact" });

  if (statusParam) {
    query = query.eq("status", statusParam);
  }

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  return c.json({ success: true, data: { items: data ?? [], total: count ?? 0 } });
});

/* ─── POST /withdrawal-queue/:id/approve — approve a large withdrawal ────── */

admin.post(
  "/withdrawal-queue/:id/approve",
  zValidator("json", z.object({ notes: z.string().max(500).optional() })),
  async (c) => {
    const { id } = c.req.param();
    const { notes } = c.req.valid("json");
    const adminUser = c.get("user") as { uid: string };
    const db = getDb();

    const { data: entry } = await db
      .from("withdrawal_queue")
      .select("*")
      .eq("id", id)
      .eq("status", "awaiting_admin")
      .maybeSingle();

    if (!entry) return c.json({ success: false, error: "Withdrawal not found or not pending approval", statusCode: 404 }, 404);

    // Move to queued — the cron will broadcast it
    const { error } = await db.from("withdrawal_queue").update({
      status: "queued",
      admin_uid: adminUser.uid,
      admin_notes: notes ?? "Approved",
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) return c.json({ success: false, error: error.message, statusCode: 500 }, 500);

    // Log in withdrawal_approvals
    await db.from("withdrawal_approvals").insert({
      withdrawal_id: id,
      admin_uid: adminUser.uid,
      action: "approved",
      notes: notes ?? null,
    });

    return c.json({ success: true, data: { message: "Withdrawal approved and queued for broadcast." } });
  }
);

/* ─── POST /withdrawal-queue/:id/reject — reject a large withdrawal ──────── */

admin.post(
  "/withdrawal-queue/:id/reject",
  zValidator("json", z.object({ notes: z.string().min(1).max(500) })),
  async (c) => {
    const { id } = c.req.param();
    const { notes } = c.req.valid("json");
    const adminUser = c.get("user") as { uid: string };
    const db = getDb();

    const { data: entry } = await db
      .from("withdrawal_queue")
      .select("*")
      .eq("id", id)
      .eq("status", "awaiting_admin")
      .maybeSingle();

    if (!entry) return c.json({ success: false, error: "Withdrawal not found or not pending approval", statusCode: 404 }, 404);

    // Refund user
    const { getBalance, upsertBalance, createLedgerEntry } = await import("@/server/db/balances");
    const current = await getBalance(entry.uid, entry.asset_symbol, "funding");
    const refundTotal = (
      parseFloat(entry.gross_amount) + parseFloat(entry.fee_amount)
    ).toFixed(18);
    await upsertBalance(entry.uid, entry.asset_symbol, (parseFloat(current) + parseFloat(refundTotal)).toFixed(18), "funding");
    await createLedgerEntry({
      uid: entry.uid,
      asset: entry.asset_symbol,
      amount: refundTotal,
      type: "refund",
      reference_id: id,
      note: `Withdrawal rejected by admin: ${notes}`,
    });

    await db.from("withdrawal_queue").update({
      status: "rejected",
      admin_uid: adminUser.uid,
      admin_notes: notes,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    await db.from("withdrawal_approvals").insert({
      withdrawal_id: id,
      admin_uid: adminUser.uid,
      action: "rejected",
      notes,
    });

    // Notify user
    const { Notifications } = await import("@/server/services/notifications");
    await Notifications.send(entry.uid, {
      type: "security_alert",
      title: "Withdrawal rejected",
      body: `Your withdrawal of ${entry.gross_amount} ${entry.asset_symbol} was rejected. Reason: ${notes}. Your balance has been refunded.`,
    });

    return c.json({ success: true, data: { message: "Withdrawal rejected and balance refunded." } });
  }
);

/* ─── GET /rate-offsets — get KES spread config ──────────────────────────── */

admin.get("/rate-offsets", async (c) => {
  const db = getDb();
  const { data } = await db
    .from("system_config")
    .select("key, value")
    .in("key", ["kes_deposit_spread", "kes_withdraw_spread", "large_withdrawal_threshold_usd", "admin_notification_email"]);
  const result: Record<string, string> = {};
  for (const row of data ?? []) result[row.key as string] = row.value as string;
  return c.json({ success: true, data: result });
});

/* ─── PATCH /rate-offsets — update KES spread config ────────────────────── */

admin.patch(
  "/rate-offsets",
  zValidator("json", z.object({
    kes_deposit_spread:             z.string().regex(/^\d+(\.\d+)?$/).optional(),
    kes_withdraw_spread:            z.string().regex(/^\d+(\.\d+)?$/).optional(),
    large_withdrawal_threshold_usd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    admin_notification_email:       z.string().email().optional(),
  })),
  async (c) => {
    const updates = c.req.valid("json");
    const db = getDb();
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        await db.from("system_config").upsert({ key, value }, { onConflict: "key" });
      }
    }
    return c.json({ success: true });
  }
);

/* ─── POST /users/:uid/suspend — suspend an account ─────────────────────── */

admin.post(
  "/users/:uid/suspend",
  zValidator("json", z.object({
    durationHours: z.number().int().min(1).max(8760), // 1h to 1 year
    reason: z.string().min(5).max(500),
    fundPassword: z.string().length(6).regex(/^\d+$/), // admin must confirm with fund password
  })),
  async (c) => {
    const { uid } = c.req.param();
    const { durationHours, reason, fundPassword } = c.req.valid("json");
    const adminUser = c.get("user");
    const db = getDb();

    // Verify admin's fund password
    const bcrypt = await import("bcryptjs");
    const { findUserByUid: findUser } = await import("@/server/db/users");
    const adminRow = await findUser(adminUser.uid);
    if (!adminRow?.asset_pin_hash) {
      return c.json({ success: false, error: "Set a fund password first before performing sensitive admin actions", statusCode: 400 }, 400);
    }
    const pinValid = await bcrypt.compare(fundPassword, adminRow.asset_pin_hash);
    if (!pinValid) {
      return c.json({ success: false, error: "Incorrect fund password", statusCode: 403 }, 403);
    }

    const suspendedUntil = new Date(Date.now() + durationHours * 3_600_000).toISOString();

    const { error } = await db
      .from("users")
      .update({ suspended_until: suspendedUntil, suspension_reason: reason })
      .eq("uid", uid);

    if (error) return c.json({ success: false, error: error.message, statusCode: 500 }, 500);

    // Clear Redis suspension cache so the new suspension takes effect immediately
    const { redis } = await import("@/lib/redis/client");
    await redis.set(`suspended:${uid}`, { until: suspendedUntil, reason }, { ex: 60 });

    // Log it
    await db.from("ledger_entries").insert({
      uid,
      asset: "USDT",
      amount: "0",
      type: "admin_adjustment",
      note: `Account suspended by ${adminUser.email} for ${durationHours}h. Reason: ${reason}`,
    }).catch(() => undefined);

    return c.json({ success: true, data: { uid, suspendedUntil, reason } });
  }
);

/* ─── POST /users/:uid/unsuspend — lift suspension ───────────────────────── */

admin.post("/users/:uid/unsuspend", async (c) => {
  const { uid } = c.req.param();
  const db = getDb();

  await db.from("users").update({ suspended_until: null, suspension_reason: null }).eq("uid", uid);

  const { redis } = await import("@/lib/redis/client");
  await redis.del(`suspended:${uid}`);

  return c.json({ success: true, data: { uid, unsuspended: true } });
});

/* ─── POST /transactions/:id/revoke — reverse a ledger entry ─────────────── */

admin.post(
  "/transactions/:id/revoke",
  zValidator("json", z.object({
    reason: z.string().min(10).max(500),
    fundPassword: z.string().length(6).regex(/^\d+$/),
  })),
  async (c) => {
    const { id } = c.req.param();
    const { reason, fundPassword } = c.req.valid("json");
    const adminUser = c.get("user");
    const db = getDb();

    // Verify admin fund password
    const bcrypt = await import("bcryptjs");
    const { findUserByUid: findUser } = await import("@/server/db/users");
    const adminRow = await findUser(adminUser.uid);
    if (!adminRow?.asset_pin_hash) {
      return c.json({ success: false, error: "Set a fund password before performing sensitive admin actions", statusCode: 400 }, 400);
    }
    const pinValid = await bcrypt.compare(fundPassword, adminRow.asset_pin_hash);
    if (!pinValid) {
      return c.json({ success: false, error: "Incorrect fund password", statusCode: 403 }, 403);
    }

    // Fetch the original ledger entry
    const { data: entry, error: fetchErr } = await db
      .from("ledger_entries")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !entry) {
      return c.json({ success: false, error: "Transaction not found", statusCode: 404 }, 404);
    }

    // Prevent double-revocation
    const { data: existing } = await db
      .from("transaction_revocations")
      .select("id")
      .eq("ledger_entry_id", id)
      .maybeSingle();

    if (existing) {
      return c.json({ success: false, error: "This transaction has already been revoked", statusCode: 409 }, 409);
    }

    const amount = parseFloat(entry.amount);
    const reversalAmount = (-amount).toFixed(8);

    // Get current balance before reversal
    const { getBalance, upsertBalance, createLedgerEntry } = await import("@/server/db/balances");
    const { add } = await import("@/lib/utils/money");
    const account = (entry.account as string) ?? "funding";
    const currentBalance = await getBalance(entry.uid, entry.asset, account as "funding" | "trading" | "earn");

    const newBalance = add(currentBalance, reversalAmount);
    if (parseFloat(newBalance) < 0) {
      return c.json({
        success: false,
        error: `Cannot revoke: would take balance below zero (current: ${currentBalance} ${entry.asset}, reversal: ${reversalAmount})`,
        statusCode: 400,
      }, 400);
    }

    // Apply reversal
    await upsertBalance(entry.uid, entry.asset, newBalance, account as "funding" | "trading" | "earn");

    // Create reversal ledger entry
    await createLedgerEntry({
      uid: entry.uid,
      asset: entry.asset,
      amount: reversalAmount,
      type: "admin_adjustment",
      reference_id: entry.id,
      note: `REVOKED by ${adminUser.email}: ${reason}. Original: ${entry.note ?? "(no note)"}`,
    });

    // Record revocation for audit
    await db.from("transaction_revocations").insert({
      ledger_entry_id: id,
      uid: entry.uid,
      admin_uid: adminUser.uid,
      reason,
      amount_reversed: reversalAmount,
      asset: entry.asset,
    });

    // If the original entry has a reference_id (deposit/withdrawal), mark it as revoked
    if (entry.reference_id) {
      await db.from("deposits").update({ status: "failed" }).eq("id", entry.reference_id).catch(() => undefined);
      await db.from("withdrawals").update({ status: "failed" }).eq("id", entry.reference_id).catch(() => undefined);
    }

    // Invalidate wallet cache
    const { redis } = await import("@/lib/redis/client");
    await redis.del(`wallet:info:${entry.uid}`);

    return c.json({
      success: true,
      data: {
        ledgerEntryId: id,
        uid: entry.uid,
        asset: entry.asset,
        originalAmount: entry.amount,
        reversalAmount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        reason,
      },
    });
  }
);

/* ─── PATCH /users/:uid/balance — manual adjustment (requires fund password) */
// Override with fund password requirement (replaces the existing route above)


/* ─── GET /compliance — AML risk score list ──────────────────────────────── */

admin.get("/compliance", async (c) => {
  const db = getDb();
  const status = c.req.query("status") ?? "all";
  const search = c.req.query("search") ?? "";
  const page   = parseInt(c.req.query("page") ?? "1");
  const limit  = 50;
  const offset = (page - 1) * limit;

  let query = db
    .from("aml_risk_scores")
    .select("uid, score, status, signals, scored_at, manual_override, override_reason", { count: "exact" })
    .order("score", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== "all") query = (query as ReturnType<typeof query.eq>).eq("status", status);

  const { data: scores, count } = await query;

  // Enrich with user email/display_name
  const uids = (scores ?? []).map((s: unknown) => (s as { uid: string }).uid);
  const { data: users } = uids.length > 0
    ? await db.from("users").select("uid, email, display_name").in("uid", uids)
    : { data: [] };

  const userMap = new Map((users ?? []).map((u) => [u.uid, u]));

  const items = (scores ?? [])
    .map((s: unknown) => {
      const score = s as { uid: string; score: number; status: string; signals: unknown; scored_at: string; manual_override: number | null; override_reason: string | null };
      const user = userMap.get(score.uid);
      return { ...score, email: user?.email ?? score.uid, display_name: user?.display_name ?? null };
    })
    .filter((r) => !search || r.email.includes(search) || r.uid.includes(search));

  return c.json({ success: true, data: { items, total: count ?? 0 } });
});

/* ─── GET /compliance/:uid/actions — action history ─────────────────────── */

admin.get("/compliance/:uid/actions", async (c) => {
  const db = getDb();
  const { uid } = c.req.param();
  const { data: items } = await db
    .from("compliance_actions")
    .select("id, action, reason, score_at_action, performed_by, created_at")
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .limit(50);
  return c.json({ success: true, data: { items: items ?? [] } });
});

/* ─── POST /compliance/:uid/override — manual score override ─────────────── */

admin.post("/compliance/:uid/override",
  zValidator("json", z.object({ score: z.number().min(0).max(100), reason: z.string().min(3) })),
  async (c) => {
    const db = getDb();
    const { uid } = c.req.param();
    const { score, reason } = c.req.valid("json");
    const adminUser = c.get("user");

    await db.from("aml_risk_scores").upsert({
      uid, score,
      manual_override: score,
      override_by_uid: adminUser.uid,
      override_reason: reason,
      scored_at: new Date().toISOString(),
    }, { onConflict: "uid" });

    await db.from("compliance_actions").insert({
      uid,
      action: "manual_override",
      reason: `Score manually set to ${score}: ${reason}`,
      score_at_action: score,
      performed_by: adminUser.uid,
    });

    return c.json({ success: true });
  }
);

/* ─── POST /compliance/:uid/clear — reset score to 0 ────────────────────── */

admin.post("/compliance/:uid/clear", async (c) => {
  const db = getDb();
  const { uid } = c.req.param();
  const adminUser = c.get("user");

  await db.from("aml_risk_scores").upsert({
    uid, score: 0, signals: [] as never, status: "normal",
    manual_override: null, override_by_uid: null, override_reason: null,
    scored_at: new Date().toISOString(),
  }, { onConflict: "uid" });

  await db.from("compliance_actions").insert({
    uid, action: "score_cleared", reason: "Score manually cleared by admin",
    score_at_action: 0, performed_by: adminUser.uid,
  });

  return c.json({ success: true });
});

/* ─── POST /compliance/:uid/suspend — manual suspend ────────────────────── */

admin.post("/compliance/:uid/suspend",
  zValidator("json", z.object({ reason: z.string().min(3) })),
  async (c) => {
    const db = getDb();
    const { uid } = c.req.param();
    const { reason } = c.req.valid("json");
    const adminUser = c.get("user");

    const suspendUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.from("users").update({ suspended_until: suspendUntil, suspension_reason: reason }).eq("uid", uid);

    await db.from("compliance_actions" as never).insert({
      uid, action: "manual_suspend", reason,
      score_at_action: null, performed_by: adminUser.uid,
    });

    try {
      const { redis } = await import("@/lib/redis/client");
      await redis.del(`suspended:${uid}`);
    } catch { /* non-fatal */ }

    return c.json({ success: true });
  }
);

export default admin;

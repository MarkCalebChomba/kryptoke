import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { add, subtract, lt } from "@/lib/utils/money";
import { redis } from "@/lib/redis/client";
import Big from "big.js";

const account = new Hono();
account.use("*", authMiddleware, withApiRateLimit());

/* ══════════════════════════════════════════════════════════════════════════
   ACCOUNT / SECURITY STATUS
══════════════════════════════════════════════════════════════════════════ */

account.get("/security-status", async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();

  const [userRes, kycRes] = await Promise.all([
    db.from("users").select("totp_enabled, phone, anti_phishing_code, whitelist_enabled, kyc_status, asset_pin_hash").eq("uid", uid).single(),
    db.from("kyc_submissions").select("status").eq("uid", uid).order("created_at", { ascending: false }).limit(1),
  ]);

  const u = userRes.data;
  const k = kycRes.data?.[0];
  return c.json({
    success: true,
    data: {
      hasTotp:          u?.totp_enabled ?? false,
      hasPhone:         !!(u?.phone),
      antiPhishingCode: u?.anti_phishing_code ?? null,
      whitelistEnabled: u?.whitelist_enabled ?? false,
      kycLevel:         u?.kyc_status === "verified" ? 2 : u?.kyc_status === "submitted" ? 1 : 0,
      fundPasswordSet:  !!(u?.asset_pin_hash),
    },
  });
});

account.get("/kyc-status", async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();

  const { data: user } = await db.from("users").select("kyc_status").eq("uid", uid).single();
  const { data: kyc }  = await db.from("kyc_submissions").select("status, reject_reason").eq("uid", uid)
    .order("created_at", { ascending: false }).limit(1);

  const kycRow = kyc?.[0];
  const status = kycRow?.status === "approved" ? "approved"
    : kycRow?.status === "rejected" ? "rejected"
    : kycRow ? "pending"
    : "none";

  return c.json({
    success: true,
    data: {
      level:        user?.kyc_status === "verified" ? 2 : 0,
      status,
      rejectReason: kycRow?.reject_reason ?? null,
    },
  });
});

/* ── KYC submission ─────────────────────────────────────────────────────── */
account.post("/kyc/submit",
  zValidator("json", z.object({
    fullName:  z.string().min(2),
    dob:       z.string().length(10),
    idNumber:  z.string().optional(),
  })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const body = c.req.valid("json");
    const db   = getDb();

    // Check for existing pending submission
    const { data: existing } = await db.from("kyc_submissions").select("id, status").eq("uid", uid)
      .order("created_at", { ascending: false }).limit(1).single();

    if (existing?.status === "approved") {
      return c.json({ success: false, error: "Already verified" }, 400);
    }

    await db.from("kyc_submissions").insert({
      uid,
      status:       "pending",
      full_name:    body.fullName,
      date_of_birth: body.dob,
      id_number:    body.idNumber ?? null,
      submitted_at: new Date().toISOString(),
    });

    return c.json({ success: true, message: "Documents submitted for review." });
  }
);

/* ── Notification preferences ───────────────────────────────────────────── */
account.get("/notification-preferences", async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();

  let { data } = await db.from("notification_preferences").select("*").eq("uid", uid).single();

  if (!data) {
    // Create defaults
    await db.from("notification_preferences").upsert({ uid });
    const res = await db.from("notification_preferences").select("*").eq("uid", uid).single();
    data = res.data;
  }

  return c.json({ success: true, data });
});

account.patch("/notification-preferences",
  zValidator("json", z.record(z.boolean()).partial()),
  async (c) => {
    const uid  = c.get("uid") as string;
    const body = c.req.valid("json");
    const db   = getDb();

    await db.from("notification_preferences").upsert({ uid, ...body, updated_at: new Date().toISOString() });
    return c.json({ success: true });
  }
);

/* ══════════════════════════════════════════════════════════════════════════
   LOANS
══════════════════════════════════════════════════════════════════════════ */

const LOAN_PRODUCTS = {
  BTC:  { maxLtv: 0.65, liquidationLtv: 0.83, dailyRate: 0.00055 },
  ETH:  { maxLtv: 0.65, liquidationLtv: 0.83, dailyRate: 0.00060 },
  BNB:  { maxLtv: 0.60, liquidationLtv: 0.80, dailyRate: 0.00070 },
  SOL:  { maxLtv: 0.55, liquidationLtv: 0.75, dailyRate: 0.00080 },
  AVAX: { maxLtv: 0.50, liquidationLtv: 0.70, dailyRate: 0.00090 },
} as const;

account.get("/loans", async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();
  const { data } = await db.from("crypto_loans").select("*").eq("uid", uid).eq("status", "active")
    .order("created_at", { ascending: false });
  return c.json({ success: true, data: data ?? [] });
});

account.post("/loans",
  zValidator("json", z.object({
    collateralAsset:  z.string(),
    collateralAmount: z.number().positive(),
    loanAmount:       z.number().min(10),
    durationDays:     z.number().min(7).max(90).default(30),
  })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const body = c.req.valid("json");
    const db   = getDb();

    const product = LOAN_PRODUCTS[body.collateralAsset as keyof typeof LOAN_PRODUCTS];
    if (!product) return c.json({ success: false, error: "Unsupported collateral asset" }, 400);

    // Check collateral balance
    const collBal = await getBalance(uid, body.collateralAsset, "trading");
    if (lt(collBal, body.collateralAmount.toString())) {
      return c.json({ success: false, error: "Insufficient collateral balance" }, 400);
    }

    // Get price for LTV calc
    const priceKey = `binance:ticker:${body.collateralAsset.toUpperCase()}USDT`;
    const price    = await redis.get<string>(priceKey).catch(() => null);
    const collUsd  = price ? new Big(body.collateralAmount).times(parseFloat(price)) : new Big(body.collateralAmount);
    const ltv      = new Big(body.loanAmount).div(collUsd);

    if (ltv.gt(product.maxLtv)) {
      return c.json({ success: false, error: `Loan amount exceeds max LTV (${product.maxLtv * 100}%)` }, 400);
    }

    // Lock collateral
    await upsertBalance(uid, body.collateralAsset, subtract(collBal, body.collateralAmount.toString()), "trading");

    // Credit USDT
    const usdtBal = await getBalance(uid, "USDT", "trading");
    await upsertBalance(uid, "USDT", add(usdtBal, body.loanAmount.toString()), "trading");

    const { data, error } = await db.from("crypto_loans").insert({
      uid,
      collateral_asset:   body.collateralAsset,
      collateral_amount:  body.collateralAmount,
      loan_asset:         "USDT",
      loan_amount:        body.loanAmount,
      daily_rate:         product.dailyRate,
      max_ltv:            product.maxLtv,
      liquidation_ltv:    product.liquidationLtv,
      current_ltv:        ltv.toFixed(4),
      duration_days:      body.durationDays,
      due_at:             new Date(Date.now() + body.durationDays * 24 * 60 * 60 * 1000).toISOString(),
    }).select().single();

    if (error) return c.json({ success: false, error: error.message }, 400);

    await createLedgerEntry({ uid, asset: "USDT", amount: body.loanAmount.toString(), type: "loan_disbursement", note: `Crypto loan ${data.id}` });
    return c.json({ success: true, data });
  }
);

account.post("/loans/:id/repay",
  zValidator("json", z.object({ amount: z.number().positive() })),
  async (c) => {
    const uid    = c.get("uid") as string;
    const id     = c.req.param("id");
    const body   = c.req.valid("json");
    const db     = getDb();

    const { data: loan } = await db.from("crypto_loans").select("*").eq("id", id).eq("uid", uid).eq("status", "active").single();
    if (!loan) return c.json({ success: false, error: "Loan not found" }, 404);

    const totalOwed = new Big(loan.loan_amount).plus(loan.interest_accrued);
    const repayAmt  = new Big(body.amount);

    // Check USDT balance
    const usdtBal = await getBalance(uid, "USDT", "trading");
    if (lt(usdtBal, repayAmt.toString())) {
      return c.json({ success: false, error: "Insufficient USDT balance" }, 400);
    }

    await upsertBalance(uid, "USDT", subtract(usdtBal, repayAmt.toString()), "trading");

    const isFullRepay = repayAmt.gte(totalOwed);
    if (isFullRepay) {
      // Return collateral
      const collBal = await getBalance(uid, loan.collateral_asset, "trading");
      await upsertBalance(uid, loan.collateral_asset, add(collBal, loan.collateral_amount.toString()), "trading");
      await db.from("crypto_loans").update({ status: "repaid", repaid_at: new Date().toISOString() }).eq("id", id);
      return c.json({ success: true, message: "Loan fully repaid. Collateral returned." });
    } else {
      const remaining = totalOwed.minus(repayAmt);
      await db.from("crypto_loans").update({ loan_amount: remaining.toFixed(8), interest_accrued: "0" }).eq("id", id);
      return c.json({ success: true, message: "Partial repayment recorded." });
    }
  }
);

/* ══════════════════════════════════════════════════════════════════════════
   DCA / AUTO-INVEST
══════════════════════════════════════════════════════════════════════════ */

account.get("/dca/plans", async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();
  const { data } = await db.from("dca_plans").select("*").eq("uid", uid).order("created_at", { ascending: false });

  // Map snake_case DB fields to camelCase expected by frontend
  const mapped = (data ?? []).map(p => ({
    id:             p.id,
    asset:          p.asset,
    amountPerCycle: p.amount_per_cycle?.toString() ?? "0",
    frequency:      p.frequency,
    totalInvested:  p.total_invested?.toString() ?? "0",
    total_invested: p.total_invested?.toString() ?? "0",
    currentValue:   p.total_invested?.toString() ?? "0", // approximate until price data
    status:         p.status,
    nextRun:        p.next_run_at
      ? new Date(p.next_run_at).toLocaleDateString("en-KE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "Scheduled",
    cyclesCompleted: p.cycles_done ?? 0,
    createdAt:       p.created_at,
  }));

  return c.json({ success: true, data: mapped });
});

account.post("/dca/plans",
  zValidator("json", z.object({
    asset:          z.string(),
    amountPerCycle: z.number().min(1),
    frequency:      z.enum(["hourly","daily","weekly","biweekly","monthly"]),
  })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const body = c.req.valid("json");
    const db   = getDb();

    // Check USDT balance for first purchase
    const usdtBal = await getBalance(uid, "USDT", "trading");
    if (lt(usdtBal, body.amountPerCycle.toString())) {
      return c.json({ success: false, error: "Insufficient USDT balance for first purchase" }, 400);
    }

    const { data, error } = await db.from("dca_plans").insert({
      uid,
      asset:           body.asset,
      amount_per_cycle: body.amountPerCycle,
      frequency:       body.frequency,
      next_run_at:     new Date().toISOString(),
    }).select().single();

    if (error) return c.json({ success: false, error: error.message }, 400);
    return c.json({ success: true, data });
  }
);

account.patch("/dca/plans/:id",
  zValidator("json", z.object({ status: z.enum(["active","paused"]) })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const id   = c.req.param("id");
    const body = c.req.valid("json");
    const db   = getDb();

    await db.from("dca_plans").update({ status: body.status }).eq("id", id).eq("uid", uid);
    return c.json({ success: true });
  }
);

account.delete("/dca/plans/:id", async (c) => {
  const uid = c.get("uid") as string;
  const id  = c.req.param("id");
  const db  = getDb();
  await db.from("dca_plans").delete().eq("id", id).eq("uid", uid);
  return c.json({ success: true });
});

/* ══════════════════════════════════════════════════════════════════════════
   TRADING BOTS
══════════════════════════════════════════════════════════════════════════ */

account.get("/bots", async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();
  const { data } = await db.from("trading_bots").select("*").eq("uid", uid).order("created_at", { ascending: false });
  return c.json({ success: true, data: data ?? [] });
});

account.post("/bots",
  zValidator("json", z.object({
    type:   z.enum(["grid","dca","rebalance"]),
    pair:   z.string(),
    config: z.record(z.unknown()),
  })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const body = c.req.valid("json");
    const db   = getDb();

    const { data, error } = await db.from("trading_bots").insert({
      uid, type: body.type, pair: body.pair, config: body.config,
    }).select().single();

    if (error) return c.json({ success: false, error: error.message }, 400);
    return c.json({ success: true, data });
  }
);

account.patch("/bots/:id",
  zValidator("json", z.object({ status: z.enum(["running","paused","stopped"]) })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const id   = c.req.param("id");
    const body = c.req.valid("json");
    const db   = getDb();

    const updates: Record<string, unknown> = { status: body.status };
    if (body.status === "stopped") updates.stopped_at = new Date().toISOString();

    await db.from("trading_bots").update(updates).eq("id", id).eq("uid", uid);
    return c.json({ success: true });
  }
);

account.delete("/bots/:id", async (c) => {
  const uid = c.get("uid") as string;
  const id  = c.req.param("id");
  const db  = getDb();
  await db.from("trading_bots").update({ status: "stopped", stopped_at: new Date().toISOString() }).eq("id", id).eq("uid", uid);
  return c.json({ success: true });
});

/* ══════════════════════════════════════════════════════════════════════════
   SQUARE (community feed)
══════════════════════════════════════════════════════════════════════════ */

account.get("/square/posts", async (c) => {
  const { limit = "20", offset = "0", coin } = c.req.query();
  const db = getDb();

  let query = db
    .from("square_posts")
    .select("*, users!inner(uid, display_name, avatar_url)")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (coin) query = query.contains("coin_tags", [coin.toUpperCase()]);

  const { data } = await query;
  return c.json({ success: true, data: data ?? [] });
});

account.post("/square/posts",
  zValidator("json", z.object({
    content:   z.string().min(1).max(1000),
    coin_tags: z.array(z.string()).max(5).default([]),
  })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const body = c.req.valid("json");
    const db   = getDb();

    const { data, error } = await db.from("square_posts").insert({
      uid, content: body.content, coin_tags: body.coin_tags,
    }).select().single();

    if (error) return c.json({ success: false, error: error.message }, 400);
    return c.json({ success: true, data });
  }
);

account.delete("/square/posts/:id", async (c) => {
  const uid = c.get("uid") as string;
  const id  = c.req.param("id");
  const db  = getDb();
  await db.from("square_posts").update({ is_hidden: true }).eq("id", id).eq("uid", uid);
  return c.json({ success: true });
});

/* ─── POST /kyc/submit-documents — Multipart KYC upload ─────────────────── */
account.post("/kyc/submit-documents", authMiddleware, async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();

  // Check not already verified
  const { data: existing } = await db.from("kyc_submissions")
    .select("id, status").eq("uid", uid)
    .order("created_at", { ascending: false }).limit(1).single();

  if (existing?.status === "approved") {
    return c.json({ success: false, error: "Already verified" }, 400);
  }

  // Parse multipart form
  const formData   = await c.req.formData();
  const fullName   = formData.get("fullName")?.toString() ?? "";
  const dob        = formData.get("dob")?.toString() ?? "";
  const idNumber   = formData.get("idNumber")?.toString() ?? null;

  if (!fullName || !dob) {
    return c.json({ success: false, error: "Full name and date of birth are required" }, 400);
  }

  // Store files in Supabase storage
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );

  const uploadFile = async (field: string, path: string) => {
    const file = formData.get(field);
    if (!file || !(file instanceof File)) return null;
    const buf = Buffer.from(await file.arrayBuffer());
    const { data } = await admin.storage.from("kyc-documents").upload(path, buf, {
      contentType: file.type,
      upsert: true,
    });
    return data?.path ?? null;
  };

  const [frontPath, backPath, selfiePath] = await Promise.all([
    uploadFile("frontId", `${uid}/front-id`),
    uploadFile("backId",  `${uid}/back-id`),
    uploadFile("selfie",  `${uid}/selfie`),
  ]);

  // Create kyc_submission record
  const { data, error } = await db.from("kyc_submissions").upsert({
    uid,
    full_name:      fullName,
    date_of_birth:  dob,
    id_number:      idNumber,
    status:         "pending",
    submitted_at:   new Date().toISOString(),
  }, { onConflict: "uid" }).select().single();

  if (error) return c.json({ success: false, error: error.message }, 400);

  return c.json({ success: true, message: "Documents submitted for review." });
});

export default account;

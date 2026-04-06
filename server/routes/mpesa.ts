import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { findUserByUid } from "@/server/db/users";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { initiateStkPush, parseStkCallback, queryStkStatus } from "@/server/services/mpesa";
import { getKesPerUsd } from "@/server/services/forex";
import { getDb } from "@/server/db/client";
import { Notifications } from "@/server/services/notifications";
import { isValidKenyanPhone } from "@/lib/utils/formatters";
import { add, divide, toFixed } from "@/lib/utils/money";
import Big from "big.js";

const mpesa = new Hono();

// ── Deposit phase logger ───────────────────────────────────────────────────
async function logDepositPhase(
  depositId: string,
  uid: string,
  phase: string,
  detail?: Record<string, unknown>
) {
  try {
    const db = getDb();
    await db.from("deposit_logs").insert({ deposit_id: depositId, uid, phase, detail });
  } catch { /* non-blocking */ }
}

/* ─── POST /deposit ─────────────────────────────────────────────────────── */

mpesa.post(
  "/deposit",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator(
    "json",
    z.object({
      phone: z.string().refine(isValidKenyanPhone, "Invalid Kenyan phone number"),
      amount: z.number().min(10, "Minimum deposit is KSh 10").max(300_000),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { phone, amount } = c.req.valid("json");

    // Fetch user and rate in parallel
    const [userRow, kesPerUsd] = await Promise.all([
      findUserByUid(uid),
      getKesPerUsd(),
    ]);

    if (!userRow) {
      return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);
    }

    const db = getDb();

    // Create pending deposit record with rate locked in
    const { data: deposit, error: insertError } = await db
      .from("deposits")
      .insert({
        uid,
        phone,
        amount_kes: amount.toFixed(2),
        kes_per_usd: kesPerUsd,
        status: "pending",
      })
      .select()
      .single();

    if (insertError || !deposit) {
      return c.json(
        { success: false, error: "Failed to create deposit record", statusCode: 500 },
        500
      );
    }

    // Log: deposit record created
    logDepositPhase(deposit.id, uid, "initiated", { phone, amount_kes: amount, kes_per_usd: kesPerUsd });

    try {
      // Initiate STK Push
      const stkResult = await initiateStkPush(
        phone,
        amount,
        uid.slice(0, 10).toUpperCase(),
        "KryptoKe deposit"
      );

      // Store checkout request ID for callback matching
      await db
        .from("deposits")
        .update({
          checkout_request_id: stkResult.checkoutRequestId,
          status: "processing",
        })
        .eq("id", deposit.id);

      logDepositPhase(deposit.id, uid, "stk_sent", {
        checkout_request_id: stkResult.checkoutRequestId,
        message: stkResult.customerMessage,
      });

      return c.json({
        success: true,
        data: {
          txId: deposit.id,
          checkoutRequestId: stkResult.checkoutRequestId,
          message: stkResult.customerMessage,
        },
      });
    } catch (err) {
      // Mark deposit as failed
      await db.from("deposits").update({ status: "failed" }).eq("id", deposit.id);
      const message = err instanceof Error ? err.message : "STK Push failed";
      logDepositPhase(deposit.id, uid, "stk_failed", { error: message });
      return c.json({ success: false, error: message, statusCode: 502 }, 502);
    }
  }
);

/* ─── POST /callback — no auth, called by Safaricom ────────────────────── */

mpesa.post("/callback", async (c) => {
  // Always respond 200 immediately — Safaricom will retry if we don't
  const body = await c.req.json().catch(() => null);

  // Process asynchronously — do not await
  processCallback(body).catch((err) => {
    console.error("[M-Pesa Callback] Processing error:", err);
  });

  return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

async function processCallback(body: unknown): Promise<void> {
  const data = parseStkCallback(body);
  if (!data) {
    console.error("[M-Pesa Callback] Failed to parse callback body");
    return;
  }

  const db = getDb();

  // Find the deposit record by checkout request ID
  const { data: deposit } = await db
    .from("deposits")
    .select("*")
    .eq("checkout_request_id", data.checkoutRequestId)
    .single();

  if (!deposit) {
    console.error(
      "[M-Pesa Callback] No deposit found for checkoutRequestId:",
      data.checkoutRequestId
    );
    return;
  }

  // Log: callback received
  logDepositPhase(deposit.id, deposit.uid, "callback_received", {
    result_code: data.resultCode,
    checkout_request_id: data.checkoutRequestId,
  });

  // Already processed
  if (deposit.status === "completed" || deposit.status === "failed") return;

  if (data.resultCode !== 0) {
    // Payment failed or cancelled
    await db
      .from("deposits")
      .update({ status: "failed" })
      .eq("id", deposit.id);
    logDepositPhase(deposit.id, deposit.uid, "failed", { result_code: data.resultCode });
    return;
  }

  // Payment successful
  const kesPerUsd = deposit.kes_per_usd ?? "130";
  const amountKes = deposit.amount_kes;

  const usdtToCredit = new Big(amountKes).div(new Big(kesPerUsd)).toFixed(6);

  const currentBalance = await getBalance(deposit.uid, "USDT", "funding");
  const newBalance = add(currentBalance, usdtToCredit);

  await upsertBalance(deposit.uid, "USDT", newBalance, "funding");

  await createLedgerEntry({
    uid: deposit.uid,
    asset: "USDT",
    amount: usdtToCredit,
    type: "deposit",
    reference_id: deposit.id,
    note: `M-Pesa deposit KSh ${amountKes} @ ${kesPerUsd} KES/USD`,
  });

  await db
    .from("deposits")
    .update({
      status: "completed",
      usdt_credited: usdtToCredit,
      mpesa_code: data.mpesaReceiptNumber,
      completed_at: new Date().toISOString(),
    })
    .eq("id", deposit.id);

  logDepositPhase(deposit.id, deposit.uid, "completed", {
    mpesa_code: data.mpesaReceiptNumber,
    usdt_credited: usdtToCredit,
  });

  await db.from("deposit_reconciliation").insert({
    deposit_id: deposit.id,
    uid: deposit.uid,
    source: "mpesa_callback",
    amount_kes: amountKes,
    usdt_credited: usdtToCredit,
    kes_per_usd: String(kesPerUsd),
    mpesa_code: data.mpesaReceiptNumber,
    balance_before: currentBalance,
    balance_after: newBalance,
    note: `Auto from M-Pesa STK callback. Receipt: ${data.mpesaReceiptNumber}`,
  }).catch((err) => {
    console.error("[Reconciliation] Failed to write reconciliation log:", err);
  });

  await Notifications.depositConfirmed(
    deposit.uid,
    amountKes,
    toFixed(parseFloat(usdtToCredit), 2),
    deposit.id
  );
}

/* ─── GET /status/:txId — poll and actively query Safaricom if stuck ──── */

mpesa.get(
  "/status/:txId",
  authMiddleware,
  withApiRateLimit(),
  async (c) => {
    const { uid } = c.get("user");
    const { txId } = c.req.param();

    const db = getDb();
    const { data: deposit, error } = await db
      .from("deposits")
      .select("id, status, amount_kes, usdt_credited, mpesa_code, created_at, completed_at, checkout_request_id")
      .eq("id", txId)
      .eq("uid", uid)
      .single();

    if (error || !deposit) {
      return c.json(
        { success: false, error: "Deposit not found", statusCode: 404 },
        404
      );
    }

    // If still processing, actively query Safaricom (polling fallback)
    // This handles missed callbacks — if Realtime didn't fire, the UI polls this endpoint
    if (deposit.status === "processing" && deposit.checkout_request_id) {
      const ageSeconds = (Date.now() - new Date(deposit.created_at).getTime()) / 1000;
      // Only query after 15 seconds (STK takes time) and within 10 minutes
      if (ageSeconds > 15 && ageSeconds < 600) {
        try {
          logDepositPhase(deposit.id, uid, "polling_check", { age_seconds: Math.round(ageSeconds) });
          const queryResult = await queryStkStatus(deposit.checkout_request_id);

          if (queryResult.resultCode === 0 && deposit.status !== "completed") {
            // Payment confirmed via query — process it
            const kesPerUsd = deposit.kes_per_usd ?? "130";
            const amountKes = deposit.amount_kes;
            const usdtToCredit = new Big(amountKes).div(new Big(kesPerUsd)).toFixed(6);
            const currentBalance = await getBalance(uid, "USDT", "funding");
            const newBalance = add(currentBalance, usdtToCredit);

            await upsertBalance(uid, "USDT", newBalance, "funding");
            await createLedgerEntry({
              uid, asset: "USDT", amount: usdtToCredit, type: "deposit",
              reference_id: deposit.id,
              note: `M-Pesa deposit KSh ${amountKes} @ ${kesPerUsd} KES/USD (recovered via polling)`,
            });
            await db.from("deposits").update({
              status: "completed",
              usdt_credited: usdtToCredit,
              mpesa_code: queryResult.mpesaReceiptNumber ?? null,
              completed_at: new Date().toISOString(),
            }).eq("id", deposit.id);

            logDepositPhase(deposit.id, uid, "completed", {
              source: "polling", mpesa_code: queryResult.mpesaReceiptNumber,
            });

            await Notifications.depositConfirmed(uid, amountKes, toFixed(parseFloat(usdtToCredit), 2), deposit.id);

            return c.json({ success: true, data: {
              ...deposit, status: "completed", usdt_credited: usdtToCredit,
              mpesa_code: queryResult.mpesaReceiptNumber,
            }});

          } else if (queryResult.resultCode !== 0 && queryResult.resultCode !== 1032) {
            // Failed (not just "in progress" code 1032)
            await db.from("deposits").update({ status: "failed" }).eq("id", deposit.id);
            logDepositPhase(deposit.id, uid, "failed", { source: "polling", result_code: queryResult.resultCode });
            return c.json({ success: true, data: { ...deposit, status: "failed" }});
          }
        } catch (err) {
          // Query failed — just return current status, don't crash
          console.warn("[Deposit status] STK query failed:", err);
        }
      }
    }

    return c.json({ success: true, data: deposit });
  }
);

/* ─── GET /history ──────────────────────────────────────────────────────── */

mpesa.get(
  "/history",
  authMiddleware,
  withApiRateLimit(),
  async (c) => {
    const { uid } = c.get("user");
    const page = parseInt(c.req.query("page") ?? "1");
    const pageSize = 20;

    const db = getDb();
    const { data: deposits } = await db
      .from("deposits")
      .select(
        "id, status, amount_kes, usdt_credited, mpesa_code, phone, created_at, completed_at"
      )
      .eq("uid", uid)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    return c.json({
      success: true,
      data: deposits ?? [],
    });
  }
);

/* ─── GET /logs/:txId — deposit event log for transparency ─────────────── */

mpesa.get("/logs/:txId", authMiddleware, withApiRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const { txId } = c.req.param();
  const db = getDb();

  const { data } = await db
    .from("deposit_logs")
    .select("phase, detail, created_at")
    .eq("deposit_id", txId)
    .eq("uid", uid)
    .order("created_at", { ascending: true });

  return c.json({ success: true, data: data ?? [] });
});

export default mpesa;

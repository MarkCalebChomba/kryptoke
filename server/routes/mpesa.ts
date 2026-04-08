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
      provider_id: z.string().min(1).max(30).default("mpesa"),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { phone, amount, provider_id } = c.req.valid("json");

    // Validate provider is active and available
    const { validateProvider } = await import("@/server/services/paymentProviders");
    const userRow = await findUserByUid(uid);
    const countryCode = (userRow as Record<string, unknown>)?.country_code as string ?? "KE";
    const providerCheck = validateProvider(provider_id, countryCode);
    if ("error" in providerCheck) {
      return c.json({ success: false, error: providerCheck.error, statusCode: 400 }, 400);
    }

    // Currently only M-Pesa STK push is implemented — route accordingly
    if (provider_id !== "mpesa") {
      return c.json({
        success: false,
        error: `${providerCheck.provider.name} deposits are coming soon. Use M-Pesa for now.`,
        statusCode: 400,
      }, 400);
    }

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
        provider_id,
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
    // Payment failed or cancelled — atomic update: only update if still in processing state
    await db
      .from("deposits")
      .update({ status: "failed" })
      .eq("id", deposit.id)
      .in("status", ["pending", "processing"]); // guard against concurrent updates
    logDepositPhase(deposit.id, deposit.uid, "failed", { result_code: data.resultCode });
    return;
  }

  // Payment successful — atomic status flip: mark as completing FIRST to prevent double-credit
  // Only proceed if we successfully claimed the record from a non-completed state
  const { data: claimed, error: claimError } = await db
    .from("deposits")
    .update({ status: "completing" })
    .eq("id", deposit.id)
    .in("status", ["pending", "processing"])
    .select("id")
    .single();

  if (claimError || !claimed) {
    // Another process already claimed this deposit — skip to prevent double credit
    console.warn(`[M-Pesa Callback] Deposit ${deposit.id} already being processed — skipping duplicate`);
    logDepositPhase(deposit.id, deposit.uid, "duplicate_skipped", { checkout_request_id: data.checkoutRequestId });
    return;
  }

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
            // Atomic claim — prevent double-credit if callback fires at the same time
            const { data: pollClaimed } = await db
              .from("deposits")
              .update({ status: "completing" })
              .eq("id", deposit.id)
              .in("status", ["pending", "processing"])
              .select("id")
              .single();

            if (!pollClaimed) {
              // Already claimed by callback handler — just re-fetch and return current state
              const { data: fresh } = await db.from("deposits").select("*").eq("id", deposit.id).single();
              return c.json({ success: true, data: fresh ?? deposit });
            }

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
            await db.from("deposits").update({ status: "failed" })
              .eq("id", deposit.id)
              .in("status", ["pending", "processing"]); // guard concurrent updates
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

/* ─── POST /manual-confirm — user submits their M-Pesa code manually ────── */
// Used when STK callback was missed and user has the receipt in their SMS.
// Anti-double-entry: mpesa_code is unique across all completed deposits.

mpesa.post(
  "/manual-confirm",
  authMiddleware,
  withSensitiveRateLimit(),
  zValidator("json", z.object({
    txId:      z.string().uuid(),
    mpesaCode: z.string().min(6).max(30).regex(/^[A-Z0-9]+$/i, "Invalid M-Pesa code format"),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { txId, mpesaCode } = c.req.valid("json");
    const code = mpesaCode.toUpperCase().trim();
    const db = getDb();

    // 1. Fetch the deposit — must belong to this user and be in processing/failed
    const { data: deposit, error } = await db
      .from("deposits")
      .select("*")
      .eq("id", txId)
      .eq("uid", uid)
      .single();

    if (error || !deposit) {
      return c.json({ success: false, error: "Deposit not found", statusCode: 404 }, 404);
    }

    if (deposit.status === "completed") {
      return c.json({ success: false, error: "This deposit has already been completed", statusCode: 400 }, 400);
    }

    if (!["processing", "failed", "pending"].includes(deposit.status)) {
      return c.json({ success: false, error: "Deposit cannot be manually confirmed in its current state", statusCode: 400 }, 400);
    }

    // 2. Anti-double-entry: check if this M-Pesa code was already used by ANYONE
    const { data: existingDeposit } = await db
      .from("deposits")
      .select("id, uid, status")
      .eq("mpesa_code", code)
      .eq("status", "completed")
      .maybeSingle();

    if (existingDeposit) {
      logDepositPhase(deposit.id, uid, "manual_confirm_rejected", {
        reason: "duplicate_mpesa_code",
        code,
        conflicting_deposit: existingDeposit.id,
      });
      return c.json({
        success: false,
        error: "This M-Pesa transaction code has already been used. If you believe this is an error, please contact support.",
        statusCode: 400,
      }, 400);
    }

    // 3. Check deposit age — only allow manual confirm within 24 hours
    const ageHours = (Date.now() - new Date(deposit.created_at).getTime()) / 3_600_000;
    if (ageHours > 24) {
      return c.json({
        success: false,
        error: "Manual confirmation is only available within 24 hours of initiating a deposit. Please contact support.",
        statusCode: 400,
      }, 400);
    }

    // 4. Mark as pending admin review — don't auto-credit, a cron/admin will verify
    //    This prevents instant fraud while still helping legit users
    await db.from("deposits").update({
      status: "processing",
      mpesa_code: code,
    }).eq("id", deposit.id);

    logDepositPhase(deposit.id, uid, "manual_code_submitted", {
      mpesa_code: code,
      previous_status: deposit.status,
    });

    // 5. Try to verify via STK Query immediately — if payment is real, confirm now
    if (deposit.checkout_request_id) {
      try {
        const queryResult = await queryStkStatus(deposit.checkout_request_id);
        if (queryResult.resultCode === 0) {
          // Safaricom confirms payment — credit immediately
          const kesPerUsd = deposit.kes_per_usd ?? "130";
          const amountKes = deposit.amount_kes;
          const usdtToCredit = new Big(amountKes).div(new Big(kesPerUsd)).toFixed(6);
          const currentBalance = await getBalance(uid, "USDT", "funding");
          const newBalance = add(currentBalance, usdtToCredit);

          await upsertBalance(uid, "USDT", newBalance, "funding");
          await createLedgerEntry({
            uid, asset: "USDT", amount: usdtToCredit, type: "deposit",
            reference_id: deposit.id,
            note: `M-Pesa deposit KSh ${amountKes} @ ${kesPerUsd} KES/USD (manual confirm + STK verified)`,
          });
          await db.from("deposits").update({
            status: "completed",
            usdt_credited: usdtToCredit,
            mpesa_code: queryResult.mpesaReceiptNumber ?? code,
            completed_at: new Date().toISOString(),
          }).eq("id", deposit.id);

          logDepositPhase(deposit.id, uid, "completed", {
            source: "manual_confirm_stk_verified",
            mpesa_code: queryResult.mpesaReceiptNumber ?? code,
          });

          await Notifications.depositConfirmed(uid, amountKes, toFixed(parseFloat(usdtToCredit), 2), deposit.id);

          return c.json({
            success: true,
            data: { status: "completed", usdtCredited: usdtToCredit, mpesaCode: queryResult.mpesaReceiptNumber ?? code },
          });
        }
      } catch { /* STK query failed — fall through to pending review */ }
    }

    // 6. Could not auto-verify — flag for admin review, raise a support ticket automatically
    await db.from("support_tickets").insert({
      uid,
      type: "deposit",
      reference_id: deposit.id,
      subject: `Manual M-Pesa code submitted - ${code}`,
      description: `User submitted M-Pesa code ${code} for deposit ${deposit.id} (KSh ${deposit.amount_kes}). STK query could not auto-verify. Requires manual review and credit if valid.`,
      priority: "high",
    }).catch(() => { /* non-blocking */ });

    return c.json({
      success: true,
      data: {
        status: "pending_review",
        message: "Your M-Pesa code has been submitted for review. We'll verify and credit your account within 30 minutes.",
      },
    });
  }
);

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

/* ─── POST /test-callback — simulate Safaricom callback (non-production only) ─ */
// Admin-only. Lets you trigger the full deposit → balance credit flow without a real payment.
// Usage: POST /api/v1/mpesa/test-callback { txId, resultCode }
// resultCode 0 = success, anything else = failure (e.g. 1032 = cancelled)

mpesa.post("/test-callback", async (c) => {
  // Hard-block in production — this route must never exist in prod
  if (process.env.MPESA_ENVIRONMENT === "production" || process.env.NODE_ENV === "production") {
    return c.json({ success: false, error: "Not available in production", statusCode: 403 }, 403);
  }

  const { adminMiddleware } = await import("@/server/middleware/auth");
  // Manually run admin check
  let isAdmin = false;
  await adminMiddleware(c, async () => { isAdmin = true; });
  if (!isAdmin) {
    return c.json({ success: false, error: "Admin only", statusCode: 403 }, 403);
  }

  const body = await c.req.json().catch(() => ({})) as {
    txId?: string;
    resultCode?: number;
    mpesaCode?: string;
  };

  const { txId, resultCode = 0, mpesaCode } = body;

  if (!txId) {
    return c.json({ success: false, error: "txId is required", statusCode: 400 }, 400);
  }

  const db = getDb();
  const { data: deposit, error } = await db
    .from("deposits")
    .select("*")
    .eq("id", txId)
    .single();

  if (error || !deposit) {
    return c.json({ success: false, error: "Deposit not found", statusCode: 404 }, 404);
  }

  if (!deposit.checkout_request_id) {
    return c.json({ success: false, error: "Deposit has no checkout_request_id — STK push may not have fired yet", statusCode: 400 }, 400);
  }

  // Build a synthetic Safaricom callback body
  const fakeReceipt = mpesaCode ?? `TEST${Date.now().toString().slice(-8)}`;
  const fakeCallback = {
    Body: {
      stkCallback: {
        MerchantRequestID: "test-merchant-id",
        CheckoutRequestID: deposit.checkout_request_id,
        ResultCode: resultCode,
        ResultDesc: resultCode === 0 ? "The service request is processed successfully." : "Request cancelled by user",
        ...(resultCode === 0 && {
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: parseFloat(deposit.amount_kes) },
              { Name: "MpesaReceiptNumber", Value: fakeReceipt },
              { Name: "TransactionDate", Value: parseInt(new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)) },
              { Name: "PhoneNumber", Value: deposit.phone },
            ],
          },
        }),
      },
    },
  };

  logDepositPhase(deposit.id, deposit.uid, "test_callback_injected", {
    result_code: resultCode,
    fake_receipt: fakeReceipt,
    injected_by: "admin",
  });

  // Run through the real processCallback — same path as a real Safaricom callback
  await processCallback(fakeCallback);

  // Fetch final state
  const { data: updated } = await db
    .from("deposits")
    .select("id, status, amount_kes, usdt_credited, mpesa_code, completed_at")
    .eq("id", txId)
    .single();

  return c.json({
    success: true,
    message: "Test callback processed",
    data: {
      deposit: updated,
      simulatedResultCode: resultCode,
      fakeReceiptNumber: resultCode === 0 ? fakeReceipt : null,
    },
  });
});

export default mpesa;

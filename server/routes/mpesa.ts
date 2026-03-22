import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { findUserByUid } from "@/server/db/users";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { initiateStkPush, parseStkCallback } from "@/server/services/mpesa";
import { getKesPerUsd } from "@/server/services/forex";
import { getDb } from "@/server/db/client";
import { Notifications } from "@/server/services/notifications";
import { isValidKenyanPhone } from "@/lib/utils/formatters";
import { add, divide, toFixed } from "@/lib/utils/money";
import Big from "big.js";

const mpesa = new Hono();

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

  // Already processed
  if (deposit.status === "completed" || deposit.status === "failed") return;

  if (data.resultCode !== 0) {
    // Payment failed or cancelled
    await db
      .from("deposits")
      .update({ status: "failed" })
      .eq("id", deposit.id);
    return;
  }

  // Payment successful
  // Bug #3 fix: use the rate that was stored at STK Push time — not fetched now
  const kesPerUsd = deposit.kes_per_usd ?? "130";
  const amountKes = deposit.amount_kes;

  // Calculate USDT to credit (KES / KES_per_USD)
  const usdtToCredit = new Big(amountKes).div(new Big(kesPerUsd)).toFixed(6);

  // Credit user balance — idempotent upsert
  const currentBalance = await getBalance(deposit.uid, "USDT", "funding");
  const newBalance = add(currentBalance, usdtToCredit);

  await upsertBalance(deposit.uid, "USDT", newBalance, "funding");

  // Ledger entry
  await createLedgerEntry({
    uid: deposit.uid,
    asset: "USDT",
    amount: usdtToCredit,
    type: "deposit",
    reference_id: deposit.id,
    note: `M-Pesa deposit KSh ${amountKes} @ ${kesPerUsd} KES/USD`,
  });

  // Mark deposit complete
  await db
    .from("deposits")
    .update({
      status: "completed",
      usdt_credited: usdtToCredit,
      mpesa_code: data.mpesaReceiptNumber,
      completed_at: new Date().toISOString(),
    })
    .eq("id", deposit.id);

  // Dual-database reconciliation log — written AFTER credit, records before/after balance
  // This lets us detect any manipulation or double-credits in audits
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
    // Non-blocking — credit already happened, log the reconciliation failure
    console.error("[Reconciliation] Failed to write reconciliation log:", err);
  });

  // Push notification
  await Notifications.depositConfirmed(
    deposit.uid,
    amountKes,
    toFixed(parseFloat(usdtToCredit), 2),
    deposit.id
  );
}

/* ─── GET /status/:txId ─────────────────────────────────────────────────── */

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
      .select(
        "id, status, amount_kes, usdt_credited, mpesa_code, created_at, completed_at"
      )
      .eq("id", txId)
      .eq("uid", uid) // security: user can only see their own deposits
      .single();

    if (error || !deposit) {
      return c.json(
        { success: false, error: "Deposit not found", statusCode: 404 },
        404
      );
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

export default mpesa;

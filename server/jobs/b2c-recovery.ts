import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import Big from "big.js";

/**
 * Bug #7 fix: B2C timeout has no recovery job — withdrawals can get stuck in processing state.
 * This job runs every 10 minutes and refunds withdrawals that have been processing for too long.
 */
export const handler = async (): Promise<void> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Supabase credentials not configured");

  const db = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const STUCK_THRESHOLD_MINUTES = 30;
  const cutoffTime = new Date(
    Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000
  ).toISOString();

  // Find withdrawals stuck in 'processing' or 'timed_out' for over 30 minutes
  // Covers both KES (direct M-Pesa) and mpesa_usdt (crypto→KES) withdrawal types
  const { data: stuckWithdrawals } = await db
    .from("withdrawals")
    .select("*")
    .in("type", ["kes", "mpesa_usdt"])
    .in("status", ["processing", "timed_out"])
    .lt("created_at", cutoffTime);

  if (!stuckWithdrawals || stuckWithdrawals.length === 0) {
    console.log("[B2C Recovery] No stuck withdrawals found");
    return;
  }

  console.log(`[B2C Recovery] Found ${stuckWithdrawals.length} stuck withdrawal(s)`);

  for (const withdrawal of stuckWithdrawals) {
    try {
      // Get current balance
      const { data: balanceRow } = await db
        .from("balances")
        .select("amount")
        .eq("uid", withdrawal.uid)
        .eq("asset", "KES")
        .eq("account", "funding")
        .single();

      const currentBalance = balanceRow?.amount ?? "0";
      const newBalance = new Big(currentBalance).plus(withdrawal.amount).toFixed(2);

      // Refund
      await db
        .from("balances")
        .upsert(
          { uid: withdrawal.uid, asset: "KES", account: "funding", amount: newBalance },
          { onConflict: "uid,asset,account" }
        );

      // Ledger entry
      await db.from("ledger_entries").insert({
        uid: withdrawal.uid,
        asset: "KES",
        amount: withdrawal.amount,
        type: "withdrawal",
        reference_id: withdrawal.id,
        note: `Auto-refunded — B2C timeout after ${STUCK_THRESHOLD_MINUTES} minutes`,
      });

      // Mark as refunded
      await db
        .from("withdrawals")
        .update({ status: "refunded" })
        .eq("id", withdrawal.id);

      // Notify user
      await db.from("notifications").insert({
        uid: withdrawal.uid,
        type: "withdrawal_sent",
        title: "Withdrawal refunded",
        body: `Your KSh ${withdrawal.amount} withdrawal could not be processed and has been refunded.`,
        data: { txId: withdrawal.id, amount: withdrawal.amount },
      });

      console.log(`[B2C Recovery] Refunded withdrawal ${withdrawal.id}`);
    } catch (err) {
      console.error(`[B2C Recovery] Failed to process ${withdrawal.id}:`, err);
    }
  }
};

/**
 * recoverStuckCompletingDeposits — runs alongside B2C recovery.
 * Deposits stuck in `completing` for > 5 minutes indicate a crashed handler
 * (e.g. Vercel function timeout mid-write). This resets them to `processing`
 * so the next status poll or callback retry can re-claim and complete them.
 * 
 * Safe to run repeatedly — only touches deposits in `completing` state older than threshold.
 */
export const recoverStuckCompletingDeposits = async (): Promise<void> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const db = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });

  const STUCK_MINUTES = 5;
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000).toISOString();

  const { data: stuck } = await db
    .from("deposits")
    .select("id, uid, amount_kes, checkout_request_id")
    .eq("status", "completing")
    .lt("updated_at", cutoff);

  if (!stuck?.length) return;

  console.log(`[Deposit Recovery] Found ${stuck.length} deposit(s) stuck in 'completing'`);

  for (const deposit of stuck) {
    try {
      // Reset to processing — the status poll or next callback will re-claim
      await db
        .from("deposits")
        .update({ status: "processing" })
        .eq("id", deposit.id)
        .eq("status", "completing"); // guard: only reset if still stuck

      console.log(`[Deposit Recovery] Reset deposit ${deposit.id} (KSh ${deposit.amount_kes}) to processing`);

      // Log the recovery
      try {
        await db.from("deposit_logs").insert({
          deposit_id: deposit.id,
          uid: deposit.uid,
          phase: "completing_recovery",
          detail: { note: `Reset from stuck 'completing' state after ${STUCK_MINUTES}min`, cutoff },
        });
      } catch { /* non-blocking */ }

    } catch (err) {
      console.error(`[Deposit Recovery] Failed to recover deposit ${deposit.id}:`, err);
    }
  }
};

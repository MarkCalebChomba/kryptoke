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

  // Find withdrawals that have been processing for over 30 minutes
  const { data: stuckWithdrawals } = await db
    .from("withdrawals")
    .select("*")
    .eq("type", "kes")
    .eq("status", "processing")
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

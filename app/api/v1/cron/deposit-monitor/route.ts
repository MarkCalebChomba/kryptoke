/**
 * Deposit Monitor Cron Endpoint
 * POST /api/v1/cron/deposit-monitor
 *
 * Called by cron-job.org every 30 seconds.
 * Scans all supported non-EVM chains for new incoming deposits.
 * Also processes the withdrawal queue (advance queued → broadcast).
 *
 * Security: validated via X-Cron-Secret header matching CRON_SECRET env var.
 *
 * cron-job.org setup:
 *   URL:      https://yourdomain.com/api/v1/cron/deposit-monitor
 *   Method:   POST
 *   Headers:  X-Cron-Secret: <your-secret>
 *   Schedule: Every 30 seconds (two jobs: :00 and :30 of each minute)
 */

import { NextRequest, NextResponse } from "next/server";
import type { NonEvmChainId } from "@/server/services/nonEvm";

const NON_EVM_CHAINS: NonEvmChainId[] = [
  "TRON", "BTC", "LTC", "DOGE", "BCH", "SOL", "XRP", "TON", "XLM", "NEAR", "FIL",
];

export async function POST(req: NextRequest) {
  // Authenticate
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results: Record<string, { depositsFound: number; error?: string }> = {};

  const { scanChainDeposits } = await import("@/server/services/nonEvm");

  // Run all chain scanners in parallel with individual error isolation
  await Promise.allSettled(
    NON_EVM_CHAINS.map(async (chain) => {
      try {
        const count = await scanChainDeposits(chain);
        results[chain] = { depositsFound: count };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results[chain] = { depositsFound: 0, error: msg };
        console.error(`[deposit-monitor] ${chain} scanner failed:`, msg);
      }
    })
  );

  // Process withdrawal queue
  let withdrawalsProcessed = 0;
  try {
    withdrawalsProcessed = await processWithdrawalQueue();
  } catch (err) {
    console.error("[deposit-monitor] withdrawal queue processor failed:", err);
  }

  const totalDeposits = Object.values(results).reduce((s, r) => s + r.depositsFound, 0);
  const errors = Object.entries(results)
    .filter(([, r]) => r.error)
    .map(([chain, r]) => `${chain}: ${r.error}`);

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    totalDepositsFound: totalDeposits,
    withdrawalsProcessed,
    chains: results,
    ...(errors.length > 0 ? { errors } : {}),
  });
}

/**
 * Withdrawal queue processor:
 *  1. Advance expired pending_cancel → queued
 *  2. Broadcast all queued withdrawals (max 10 per run)
 *  3. Email admin about new awaiting_admin withdrawals
 */
async function processWithdrawalQueue(): Promise<number> {
  const { getDb } = await import("@/server/db/client");
  const { createLedgerEntry } = await import("@/server/db/balances");
  const db = getDb();

  // 1. Advance expired cancel windows
  await db
    .from("withdrawal_queue")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("status", "pending_cancel")
    .lt("cancel_expires_at", new Date().toISOString());

  // 2. Fetch queued items ready to broadcast
  const { data: queued } = await db
    .from("withdrawal_queue")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(10);

  let processed = 0;

  for (const wq of queued ?? []) {
    // Lock the row by marking broadcasting before doing anything else
    const { error: lockError } = await db
      .from("withdrawal_queue")
      .update({ status: "broadcasting", updated_at: new Date().toISOString() })
      .eq("id", wq.id)
      .eq("status", "queued"); // only update if still queued (prevent double-broadcast)

    if (lockError) continue; // another process got there first

    try {
      const HOT_WALLET_HD_INDEX = 0; // index 0 is the exchange hot wallet

      let txHash: string;
      const isEvmChain = /^\d+$/.test(wq.chain_id as string);

      if (isEvmChain) {
        const { sendEvmWithdrawal } = await import("@/server/services/bsc");
        txHash = await sendEvmWithdrawal(
          parseInt(wq.chain_id as string),
          wq.to_address,
          wq.net_amount,
          wq.asset_symbol
        );
      } else {
        const { broadcastNonEvmWithdrawal } = await import("@/server/services/nonEvm");
        txHash = await broadcastNonEvmWithdrawal(
          wq.chain_id as NonEvmChainId,
          HOT_WALLET_HD_INDEX,
          wq.to_address,
          wq.net_amount,
          wq.asset_symbol,
          wq.memo ?? undefined
        );
      }

      await db.from("withdrawal_queue").update({
        status: "completed",
        tx_hash: txHash,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", wq.id);

      // Ledger entry for withdrawal fee
      if (parseFloat(wq.fee_amount as string) > 0) {
        await createLedgerEntry({
          uid: wq.uid,
          asset: wq.fee_asset as string,
          amount: `-${wq.fee_amount}`,
          type: "withdrawal_fee",
          reference_id: wq.id,
          note: `Network fee: ${wq.fee_amount} ${wq.fee_asset} on ${wq.chain_name}`,
        });
      }

      // Notify user
      const { Notifications } = await import("@/server/services/notifications");
      await Notifications.withdrawalSent(
        wq.uid,
        wq.gross_amount as string,
        wq.asset_symbol as string,
        txHash
      );

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[withdrawal-queue] broadcast failed for ${wq.id}:`, msg);

      // Mark failed
      await db.from("withdrawal_queue").update({
        status: "failed",
        admin_notes: `Broadcast failed: ${msg.slice(0, 500)}`,
        updated_at: new Date().toISOString(),
      }).eq("id", wq.id);

      // Refund gross amount + fee back to user's funding balance
      const { getBalance, upsertBalance } = await import("@/server/db/balances");
      const current = await getBalance(wq.uid, wq.asset_symbol as string, "funding");
      const refundTotal = (
        parseFloat(current) +
        parseFloat(wq.gross_amount as string) +
        parseFloat(wq.fee_amount as string)
      ).toFixed(18);
      await upsertBalance(wq.uid, wq.asset_symbol as string, refundTotal, "funding");

      await createLedgerEntry({
        uid: wq.uid,
        asset: wq.asset_symbol as string,
        amount: (parseFloat(wq.gross_amount as string) + parseFloat(wq.fee_amount as string)).toFixed(18),
        type: "refund",
        reference_id: wq.id,
        note: `Withdrawal refunded: broadcast failed`,
      });
    }
  }

  // 3. Email admin about new awaiting_admin items (notify once per item)
  const { data: pendingApproval } = await db
    .from("withdrawal_queue")
    .select("id, uid, asset_symbol, gross_amount, chain_name, to_address, created_at")
    .eq("status", "awaiting_admin")
    .is("admin_notes", null)
    .limit(5);

  if (pendingApproval?.length) {
    const { data: configRow } = await db
      .from("system_config").select("value").eq("key", "admin_notification_email").maybeSingle();
    const adminEmail = (configRow?.value as string) ?? "";

    if (adminEmail && process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      for (const wq of pendingApproval) {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@kryptoke.com",
          to: adminEmail,
          subject: `[KryptoKe Admin] Large withdrawal pending — ${wq.gross_amount} ${wq.asset_symbol}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;">
              <h2 style="color:#F0B429;">Large Withdrawal Pending Approval</h2>
              <p>A withdrawal above the review threshold requires your approval.</p>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:4px 0;color:#666;">Amount</td><td style="font-weight:bold;">${wq.gross_amount} ${wq.asset_symbol}</td></tr>
                <tr><td style="padding:4px 0;color:#666;">Network</td><td>${wq.chain_name}</td></tr>
                <tr><td style="padding:4px 0;color:#666;">Destination</td><td style="font-family:monospace;font-size:12px;">${wq.to_address}</td></tr>
                <tr><td style="padding:4px 0;color:#666;">User UID</td><td style="font-family:monospace;font-size:12px;">${wq.uid}</td></tr>
                <tr><td style="padding:4px 0;color:#666;">Submitted</td><td>${wq.created_at}</td></tr>
              </table>
              <p style="margin-top:16px;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin"
                   style="background:#00E5B4;color:#080C14;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
                  Review in Admin Dashboard
                </a>
              </p>
            </div>
          `,
        }).catch(console.error);

        // Mark notified
        await db.from("withdrawal_queue")
          .update({ admin_notes: "email_sent", updated_at: new Date().toISOString() })
          .eq("id", wq.id);
      }
    }
  }

  return processed;
}

// Allow GET for manual trigger / health check
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return POST(req);
}

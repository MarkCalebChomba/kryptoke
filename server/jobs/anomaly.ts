import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const handler = async (): Promise<void> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Supabase credentials not configured");

  const db = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

  const anomalies: Array<{
    type: string;
    description: string;
    uid: string | null;
    severity: "low" | "medium" | "high";
  }> = [];

  // ── Check 1: Deposit then withdraw within 5 minutes ──────────────────────
  const { data: recentDeposits } = await db
    .from("deposits")
    .select("uid, completed_at, amount_kes")
    .eq("status", "completed")
    .gte("completed_at", fiveMinutesAgo);

  if (recentDeposits) {
    for (const deposit of recentDeposits) {
      const { data: recentWithdrawals } = await db
        .from("withdrawals")
        .select("id")
        .eq("uid", deposit.uid)
        .gte("created_at", fiveMinutesAgo)
        .eq("status", "processing")
        .limit(1);

      if (recentWithdrawals && recentWithdrawals.length > 0) {
        anomalies.push({
          type: "rapid_deposit_withdrawal",
          description: `User deposited KSh ${deposit.amount_kes} and initiated withdrawal within 5 minutes`,
          uid: deposit.uid,
          severity: "high",
        });
      }
    }
  }

  // ── Check 2: More than 10 transactions in 1 hour ─────────────────────────
  const { data: highFrequency } = await db.rpc
    ? await db
        .from("ledger_entries")
        .select("uid")
        .gte("created_at", oneHourAgo)
    : { data: null };

  if (highFrequency) {
    const countByUid = new Map<string, number>();
    for (const entry of highFrequency) {
      countByUid.set(entry.uid, (countByUid.get(entry.uid) ?? 0) + 1);
    }
    for (const [uid, count] of countByUid.entries()) {
      if (count > 10) {
        anomalies.push({
          type: "high_frequency_transactions",
          description: `User made ${count} transactions in the last hour`,
          uid,
          severity: "medium",
        });
      }
    }
  }

  // ── Check 3: Withdrawal at exactly the daily limit ────────────────────────
  const { data: limitWithdrawals } = await db
    .from("withdrawals")
    .select("uid, amount")
    .gte("created_at", oneHourAgo)
    .eq("type", "kes")
    .gte("amount", "149000"); // Within KSh 1,000 of the limit

  if (limitWithdrawals) {
    for (const w of limitWithdrawals) {
      anomalies.push({
        type: "withdrawal_near_daily_limit",
        description: `Withdrawal of KSh ${w.amount} is close to daily limit`,
        uid: w.uid,
        severity: "low",
      });
    }
  }

  // ── Check 4: Same M-Pesa phone across multiple accounts ──────────────────
  const { data: phoneDeposits } = await db
    .from("deposits")
    .select("phone, uid")
    .gte("created_at", oneHourAgo);

  if (phoneDeposits) {
    const phoneToUids = new Map<string, Set<string>>();
    for (const d of phoneDeposits) {
      if (!phoneToUids.has(d.phone)) phoneToUids.set(d.phone, new Set());
      phoneToUids.get(d.phone)!.add(d.uid);
    }
    for (const [phone, uids] of phoneToUids.entries()) {
      if (uids.size > 1) {
        anomalies.push({
          type: "shared_mpesa_number",
          description: `Phone ${phone.slice(0, 6)}*** used across ${uids.size} accounts`,
          uid: null,
          severity: "high",
        });
      }
    }
  }

  if (anomalies.length === 0) return;

  // Store anomalies
  await db.from("anomalies").insert(
    anomalies.map((a) => ({
      type: a.type,
      description: a.description,
      uid: a.uid,
      severity: a.severity,
      resolved: false,
    }))
  );

  // Email admin for high severity
  const highSeverity = anomalies.filter((a) => a.severity === "high");
  if (highSeverity.length > 0) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const resendKey = process.env.RESEND_API_KEY;

    if (adminEmail && resendKey) {
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@kryptoke.com",
        to: adminEmail,
        subject: `[KryptoKe Alert] ${highSeverity.length} high-severity anomaly(ies) detected`,
        html: `
          <h2>Anomaly Alert</h2>
          <p>${highSeverity.length} high-severity anomalies were detected at ${now.toISOString()}:</p>
          <ul>
            ${highSeverity.map((a) => `<li><strong>${a.type}</strong>: ${a.description}</li>`).join("")}
          </ul>
          <p>Log in to the admin dashboard to review.</p>
        `,
      }).catch(() => undefined);
    }
  }

  console.log(`[Anomaly] Recorded ${anomalies.length} anomalies`);
};

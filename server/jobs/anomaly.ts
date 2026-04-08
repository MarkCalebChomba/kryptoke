/**
 * AML Behavioral Scoring Job — SHIELD S-B
 *
 * Runs every 4 hours via POST /api/v1/cron/aml-score (CRON_SECRET protected).
 * For each user active in the last 7 days, computes a risk score 0–100 by
 * accumulating weighted signals. Writes results to aml_risk_scores and logs
 * status changes in compliance_actions. Suspends accounts scoring 81–100.
 *
 * Enforcement happens in server/routes/withdraw.ts (query aml_risk_scores
 * on every withdrawal attempt).
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type AmlStatus = "normal" | "review" | "restricted" | "suspended";

interface Signal {
  id: string;
  label: string;
  weight: number;
}

function statusForScore(score: number): AmlStatus {
  if (score >= 81) return "suspended";
  if (score >= 61) return "restricted";
  if (score >= 31) return "review";
  return "normal";
}

export const handler = async (): Promise<{ scored: number; alerts: number }> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");

  const db = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // ── Get users active in last 7 days ────────────────────────────────────────
  const { data: activeUsers } = await db
    .from("users")
    .select("uid, kyc_status, created_at, suspended_until, suspension_reason")
    .gte("last_active_at", sevenDaysAgo);

  if (!activeUsers || activeUsers.length === 0) {
    return { scored: 0, alerts: 0 };
  }

  let totalAlerts = 0;
  const adminEmail = process.env.ADMIN_EMAIL;

  for (const user of activeUsers) {
    const uid = user.uid;
    const signals: Signal[] = [];
    let score = 0;

    // ── Signal: Deposit → withdrawal within 10 min (+25) ──────────────────
    const { data: recentDeposits } = await db
      .from("deposits")
      .select("uid, completed_at")
      .eq("uid", uid)
      .eq("status", "completed")
      .gte("completed_at", sevenDaysAgo);

    for (const dep of recentDeposits ?? []) {
      if (!dep.completed_at) continue;
      const depTime = new Date(dep.completed_at).getTime();
      const tenMinLater = new Date(depTime + 10 * 60 * 1000).toISOString();
      const sixtyMinLater = new Date(depTime + 60 * 60 * 1000).toISOString();

      const { data: rapidWithdrawals } = await db
        .from("withdrawals")
        .select("id, created_at")
        .eq("uid", uid)
        .gte("created_at", dep.completed_at)
        .lte("created_at", sixtyMinLater)
        .limit(1);

      if (rapidWithdrawals && rapidWithdrawals.length > 0) {
        const wTime = new Date(rapidWithdrawals[0].created_at).getTime();
        const diffMin = (wTime - depTime) / 60000;
        if (diffMin <= 10) {
          signals.push({ id: "rapid_deposit_withdraw_10m", label: "Deposit→withdrawal <10min", weight: 25 });
          score += 25;
        } else {
          signals.push({ id: "rapid_deposit_withdraw_1h", label: "Deposit→withdrawal <1hr", weight: 10 });
          score += 10;
        }
        break; // count once per user per run
      }
    }

    // ── Signal: 5+ unique crypto destinations in 7 days (+15) ─────────────
    const { data: cryptoWithdrawals } = await db
      .from("withdrawals")
      .select("address")
      .eq("uid", uid)
      .eq("type", "crypto")
      .gte("created_at", sevenDaysAgo);

    const uniqueAddresses = new Set((cryptoWithdrawals ?? []).map((w) => w.address).filter(Boolean));
    if (uniqueAddresses.size >= 5) {
      signals.push({ id: "many_withdrawal_addresses", label: `${uniqueAddresses.size} unique withdrawal addresses`, weight: 15 });
      score += 15;
    }

    // ── Signal: 3+ distinct IPs in 24h (+10) ──────────────────────────────
    const { data: sessions } = await db
      .from("login_sessions")
      .select("ip_address")
      .eq("uid", uid)
      .gte("created_at", oneDayAgo);

    const uniqueIps = new Set((sessions ?? []).map((s) => (s as { ip_address?: string }).ip_address).filter(Boolean));
    if (uniqueIps.size >= 3) {
      signals.push({ id: "multiple_ips_24h", label: `${uniqueIps.size} IPs in 24h`, weight: 10 });
      score += 10;
    }

    // ── Signal: Suspected multi-account (same IP as other user in 7 days) (+20) ──
    if (uniqueIps.size > 0) {
      const ipList = [...uniqueIps] as string[];
      const { data: otherSessions } = await db
        .from("login_sessions")
        .select("uid")
        .in("ip_address" as never, ipList)
        .neq("uid", uid)
        .gte("created_at", sevenDaysAgo)
        .limit(1);

      if (otherSessions && otherSessions.length > 0) {
        signals.push({ id: "shared_ip_other_account", label: "Shared IP with another account", weight: 20 });
        score += 20;
      }
    }

    // ── Signal: Round-number transaction near structured thresholds (+5) ───
    const STRUCTURED_THRESHOLDS_USD = [500, 1000, 5000, 10000];
    const { data: recentWithdrawals } = await db
      .from("withdrawals")
      .select("amount, type")
      .eq("uid", uid)
      .gte("created_at", sevenDaysAgo);

    // Get forex rate for KES→USD conversion (rough)
    const kesPerUsd = 130; // fallback; ideally read from redis/DB

    for (const w of recentWithdrawals ?? []) {
      const amountUsd = w.type === "kes"
        ? parseFloat(w.amount) / kesPerUsd
        : parseFloat(w.amount); // crypto amounts are already USD-denominated roughly

      for (const threshold of STRUCTURED_THRESHOLDS_USD) {
        const pctDiff = Math.abs(amountUsd - threshold) / threshold;
        if (pctDiff <= 0.01) {
          signals.push({ id: "round_number_structuring", label: `Transaction near $${threshold} threshold`, weight: 5 });
          score += 5;
          break;
        }
      }
    }

    // ── Signal: Volume spike — today > 3x 30-day daily average (+15) ──────
    const { data: thirtyDayDeposits } = await db
      .from("deposits")
      .select("amount_kes")
      .eq("uid", uid)
      .eq("status", "completed")
      .gte("completed_at", thirtyDaysAgo);

    const { data: todayDeposits } = await db
      .from("deposits")
      .select("amount_kes")
      .eq("uid", uid)
      .eq("status", "completed")
      .gte("completed_at", oneDayAgo);

    const thirtyDayTotal = (thirtyDayDeposits ?? []).reduce((s, d) => s + parseFloat(d.amount_kes), 0);
    const dailyAvg = thirtyDayTotal / 30;
    const todayTotal = (todayDeposits ?? []).reduce((s, d) => s + parseFloat(d.amount_kes), 0);

    if (dailyAvg > 0 && todayTotal > dailyAvg * 3) {
      signals.push({ id: "volume_spike", label: `Today's volume ${(todayTotal / dailyAvg).toFixed(1)}x daily avg`, weight: 15 });
      score += 15;
    }

    // ── Signal: New account <7 days, no KYC, volume >$100 (+20) ───────────
    const accountAgeMs = now.getTime() - new Date(user.created_at).getTime();
    const isNewAccount = accountAgeMs < 7 * 24 * 60 * 60 * 1000;
    const noKyc = user.kyc_status !== "verified";

    if (isNewAccount && noKyc && todayTotal / kesPerUsd > 100) {
      signals.push({ id: "new_unverified_high_volume", label: "New unverified account with high volume", weight: 20 });
      score += 20;
    }

    // ── Negative signals (reduce score) ───────────────────────────────────

    // Verified account >90 days with clean history (-20)
    const isOldAccount = accountAgeMs > 90 * 24 * 60 * 60 * 1000;
    if (isOldAccount && !noKyc) {
      signals.push({ id: "verified_old_account", label: "Verified account >90 days", weight: -20 });
      score -= 20;
    }

    // P2P completion rate >95% with >10 orders (-10)
    let p2pOrders: Array<{ status: string }> | null = null;
    try {
      const p2pResult = await (db.from("p2p_orders" as never) as unknown as { select: (s: string) => { eq: (k: string, v: string) => { limit: (n: number) => Promise<{ data: Array<{ status: string }> | null }> } } }).select("status").eq("uid", uid).limit(100);
      p2pOrders = (p2pResult.data as Array<{ status: string }> | null);
    } catch { /* table may not exist yet */ }

    if (p2pOrders && p2pOrders.length >= 10) {
      const completed = p2pOrders.filter((o) => o.status === "completed").length;
      const rate = completed / p2pOrders.length;
      if (rate >= 0.95) {
        signals.push({ id: "high_p2p_reputation", label: `P2P completion ${(rate * 100).toFixed(0)}%`, weight: -10 });
        score -= 10;
      }
    }

    // ── Apply manual override if set ───────────────────────────────────────
    let existingScore: { status?: string; manual_override?: number | null } | null = null;
    try {
      const esResult = await db.from("aml_risk_scores").select("score, status, manual_override").eq("uid", uid).maybeSingle();
      existingScore = esResult.data as { status?: string; manual_override?: number | null } | null;
    } catch { /* table may not exist yet */ }

    const prevStatus = existingScore?.status as AmlStatus | undefined;
    const manualOverride = existingScore?.manual_override;

    const finalScore = Math.max(0, Math.min(100,
      manualOverride != null ? manualOverride : score
    ));
    const newStatus = statusForScore(finalScore);

    // ── Upsert risk score ──────────────────────────────────────────────────
    await db.from("aml_risk_scores").upsert({
      uid,
      score: finalScore,
      signals,
      status: newStatus,
      scored_at: now.toISOString(),
    }, { onConflict: "uid" });

    // ── Log status change ──────────────────────────────────────────────────
    if (prevStatus && prevStatus !== newStatus) {
      await db.from("compliance_actions").insert({
        uid,
        action: `status_changed_${prevStatus}_to_${newStatus}`,
        reason: `Score changed from previous to ${finalScore}. Signals: ${signals.map((s) => s.id).join(", ") || "none"}`,
        score_at_action: finalScore,
        signals,
        performed_by: "aml_job",
      });
    }

    // ── Enforce: suspend account if score >= 81 ────────────────────────────
    if (newStatus === "suspended") {
      const isSuspended = user.suspended_until && new Date(user.suspended_until) > now;
      if (!isSuspended) {
        // Suspend for 7 days pending manual review
        const suspendUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await db.from("users").update({
          suspended_until: suspendUntil,
          suspension_reason: `AML score ${finalScore}/100 — pending compliance review`,
        } as never).eq("uid", uid);

        // Bust suspension cache in Redis (best-effort)
        try {
          const { redis } = await import("@/lib/redis/client");
          await redis.del(`suspended:${uid}`);
        } catch { /* non-fatal */ }

        // Alert admin
        if (adminEmail && process.env.RESEND_API_KEY) {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "noreply@kryptoke.com",
            to: adminEmail,
            subject: `[KryptoKe CRITICAL] Account auto-suspended — AML score ${finalScore}/100`,
            html: `
              <h2>Account Auto-Suspended</h2>
              <p><strong>UID:</strong> ${uid}</p>
              <p><strong>AML Score:</strong> ${finalScore}/100</p>
              <p><strong>Suspended until:</strong> ${suspendUntil}</p>
              <h3>Risk Signals</h3>
              <ul>${signals.map((s) => `<li>${s.label} (+${s.weight})</li>`).join("")}</ul>
              <p>Review in the <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://kryptoke-mu.vercel.app"}/admin/compliance">Compliance Dashboard</a>.</p>
            `,
          }).catch(() => undefined);
        }
        totalAlerts++;
      }
    }

    // ── Insert compliance_alert for review/restricted status ──────────────
    if (newStatus === "review" || newStatus === "restricted") {
      if (prevStatus !== newStatus) {
        try {
          await db.from("compliance_alerts").insert({
            uid,
            alert_type: `aml_${newStatus}`,
            details: { score: finalScore, signals },
            severity: newStatus === "restricted" ? "high" : "medium",
            status: "open",
          });
        } catch { /* non-fatal if compliance_alerts table not yet migrated */ }
        totalAlerts++;
      }
    }
  }

  console.log(`[AML] Scored ${activeUsers.length} users. Alerts: ${totalAlerts}`);
  return { scored: activeUsers.length, alerts: totalAlerts };
};

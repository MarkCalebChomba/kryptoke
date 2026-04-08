/**
 * Address Screening Service — NEXUS
 *
 * Checks a blockchain address against:
 *   1. Internal `blocked_addresses` table (instant, always checked)
 *   2. Chainalysis Community API (if CHAINALYSIS_API_KEY is set)
 *
 * Used before:
 *   - Crediting any incoming crypto deposit (sweep.ts / nonEvm.ts)
 *   - Queuing any crypto withdrawal (withdraw.ts)
 *
 * If blocked: never reveal the real reason to the end user.
 * Always insert into compliance_alerts and notify admin.
 */

import { getDb } from "@/server/db/client";

export interface ScreeningResult {
  blocked: boolean;
  riskLevel: "sanctions" | "high_risk" | "darknet" | "mixer" | null;
  source: string | null;
}

const CLEAN: ScreeningResult = { blocked: false, riskLevel: null, source: null };

/**
 * Check a single address against blocked_addresses DB + Chainalysis.
 * Returns immediately on first match — does not double-check if internal DB hits.
 */
export async function checkAddress(
  address: string,
  chain: string
): Promise<ScreeningResult> {
  if (!address || address.length < 10) return CLEAN;

  const normalised = address.trim().toLowerCase();

  // ── 1. Internal blocklist ──────────────────────────────────────────────────
  try {
    const db = getDb();
    const { data } = await db
      .from("blocked_addresses")
      .select("risk_level, source")
      .eq("address", normalised)
      .or(`chain.eq.${chain},chain.eq.*`)
      .maybeSingle();

    if (data) {
      return {
        blocked: true,
        riskLevel: data.risk_level as ScreeningResult["riskLevel"],
        source: data.source,
      };
    }
  } catch (err) {
    // DB failure — fail open (don't block user) but log
    console.error("[AddressScreening] DB check failed:", err);
  }

  // ── 2. Chainalysis Community API (optional) ────────────────────────────────
  const chainalysisKey = process.env.CHAINALYSIS_API_KEY;
  if (chainalysisKey) {
    try {
      const res = await fetch(
        `https://public.chainalysis.com/api/v1/address/${encodeURIComponent(address)}`,
        {
          headers: {
            "X-API-Key": chainalysisKey,
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(5_000),
        }
      );

      if (res.ok) {
        const json = (await res.json()) as {
          identifications?: Array<{ category: string; name: string }>;
        };

        const HIGH_RISK_CATEGORIES = new Set([
          "sanctions", "darknet market", "darknet service",
          "mixer", "ransomware", "fraud shop", "high risk exchange",
          "theft", "scam", "terrorist financing",
        ]);

        const hit = json.identifications?.find((id) =>
          HIGH_RISK_CATEGORIES.has(id.category.toLowerCase())
        );

        if (hit) {
          const categoryLower = hit.category.toLowerCase();
          let riskLevel: ScreeningResult["riskLevel"] = "high_risk";
          if (categoryLower === "sanctions") riskLevel = "sanctions";
          else if (categoryLower.includes("darknet")) riskLevel = "darknet";
          else if (categoryLower === "mixer") riskLevel = "mixer";

          // Auto-add to internal blocklist so future checks are instant
          try {
            const db = getDb();
            await db.from("blocked_addresses").upsert(
              {
                address: normalised,
                chain,
                risk_level: riskLevel,
                source: `chainalysis:${hit.name}`,
                notes: `Auto-added from Chainalysis API. Category: ${hit.category}`,
              },
              { onConflict: "address,chain", ignoreDuplicates: true }
            );
          } catch { /* non-blocking */ }

          return { blocked: true, riskLevel, source: `chainalysis:${hit.name}` };
        }
      }
    } catch (err) {
      // Chainalysis failure — fail open, log warning
      console.warn("[AddressScreening] Chainalysis check failed (fail open):", err);
    }
  }

  return CLEAN;
}

/**
 * Insert a compliance alert and notify admin email.
 * Called whenever a blocked address is detected — for both deposits and withdrawals.
 */
export async function raiseComplianceAlert(opts: {
  uid: string;
  alertType: "blocked_deposit" | "blocked_withdrawal" | "aml_flag";
  severity: "low" | "medium" | "high" | "critical";
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getDb();

    await db.from("compliance_alerts").insert({
      uid: opts.uid,
      alert_type: opts.alertType,
      severity: opts.severity,
      details: opts.details,
      status: "open",
    });

    // Notify admin by email (fire-and-forget)
    const { data: configRow } = await db
      .from("system_config")
      .select("value")
      .eq("key", "admin_notification_email")
      .maybeSingle();

    const adminEmail = (configRow?.value as string) ?? "";
    if (adminEmail && process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const label = opts.alertType.replace(/_/g, " ").toUpperCase();
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@kryptoke.com",
        to: adminEmail,
        subject: `[KryptoKe COMPLIANCE] ${label} — Severity: ${opts.severity.toUpperCase()}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;">
            <h2 style="color:#FF4444;">⚠ Compliance Alert: ${label}</h2>
            <p><strong>Severity:</strong> ${opts.severity.toUpperCase()}</p>
            <p><strong>User UID:</strong> <code>${opts.uid}</code></p>
            <pre style="background:#1a1a1a;color:#fff;padding:12px;border-radius:8px;font-size:12px;overflow:auto;">${JSON.stringify(opts.details, null, 2)}</pre>
            <p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin"
                 style="background:#F0B429;color:#080C14;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
                Review in Admin Dashboard
              </a>
            </p>
          </div>
        `,
      }).catch(console.error);
    }
  } catch (err) {
    console.error("[ComplianceAlert] Failed to raise alert:", err);
  }
}

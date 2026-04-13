import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min max — scoring can take time for many users

/**
 * POST /api/v1/cron/aml-score
 *
 * AML behavioral scoring cron — runs every 4 hours.
 * Register on cron-job.org:
 *   URL:    https://kryptoke-mu.vercel.app/api/v1/cron/aml-score
 *   Method: POST
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   Schedule: every 4 hours
 *
 * Protected by CRON_SECRET env var (same pattern as other cron routes).
 */
export async function POST(req: Request): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { handler } = await import("@/server/jobs/anomaly");
    const result = await handler();
    console.log(`[cron/aml-score] done:`, result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/aml-score] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

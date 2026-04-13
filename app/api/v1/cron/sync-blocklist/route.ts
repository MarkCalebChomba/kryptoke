/**
 * Blocklist Sync Cron — POST /api/v1/cron/sync-blocklist
 *
 * Pulls sanctioned crypto addresses from:
 *   - OFAC SDN XML (official US Treasury feed)
 *   - Community GitHub lists (Tornado Cash, Lazarus, etc.)
 *
 * Then upserts all discovered addresses into blocked_addresses.
 * Any new address is immediately active for screening — no deploy needed.
 *
 * Schedule on cron-job.org:
 *   URL:      https://kryptoke-mu.vercel.app/api/v1/cron/sync-blocklist
 *   Method:   POST
 *   Headers:  X-Cron-Secret: <CRON_SECRET>
 *   Schedule: Once per day (e.g. 02:00 UTC)
 *
 * Can also be triggered manually from the admin panel:
 *   POST /admin/blocked-addresses/sync  (adminMiddleware protected)
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const { syncBlocklist } = await import("@/server/services/addressScreening");
    const stats = await syncBlocklist();

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...stats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-blocklist cron] Fatal error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Allow GET for manual health-check trigger
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return POST(req);
}

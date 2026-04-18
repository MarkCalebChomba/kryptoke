/**
 * app/api/v1/cron/prices/route.ts
 *
 * Price refresh cron — POST /api/v1/cron/prices
 * Secured by X-Cron-Secret header.
 * Schedule on cron-job.org: every 60 seconds (was 30s — halves Vercel Fluid CPU usage).
 */

import { NextRequest, NextResponse } from "next/server";
import { refreshPrices } from "@/server/jobs/prices";

export const runtime = "nodejs";
export const maxDuration = 15; // Prices write is Redis-only now, fast

export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.nextUrl.searchParams.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const start = Date.now();
    const { updated, errors } = await refreshPrices();
    const ms = Date.now() - start;

    if (errors.length > 0) {
      console.warn("[cron/prices] Some exchanges failed:", errors);
    }

    return NextResponse.json({
      ok: true,
      updated,
      ms,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[cron/prices] Fatal error:", err);
    return NextResponse.json({ error: "Price refresh failed" }, { status: 500 });
  }
}

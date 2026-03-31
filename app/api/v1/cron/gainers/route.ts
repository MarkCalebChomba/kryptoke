/**
 * app/api/v1/cron/gainers/route.ts
 *
 * Gainers & losers cron — POST /api/v1/cron/gainers
 * Secured by X-Cron-Secret header.
 * Schedule on cron-job.org: every 1 hour.
 */

import { NextRequest, NextResponse } from "next/server";
import { refreshGainersLosers } from "@/server/jobs/prices";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await refreshGainersLosers();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cron/gainers] Error:", err);
    return NextResponse.json({ error: "Gainers refresh failed" }, { status: 500 });
  }
}

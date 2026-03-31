/**
 * app/api/v1/cron/hot/route.ts
 *
 * Hot list cron — POST /api/v1/cron/hot
 * Secured by X-Cron-Secret header.
 * Schedule on cron-job.org: once daily at 00:00 UTC.
 */

import { NextRequest, NextResponse } from "next/server";
import { refreshHotList } from "@/server/jobs/prices";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await refreshHotList();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cron/hot] Error:", err);
    return NextResponse.json({ error: "Hot list refresh failed" }, { status: 500 });
  }
}

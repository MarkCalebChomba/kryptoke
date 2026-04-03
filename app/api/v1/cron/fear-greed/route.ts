/**
 * app/api/v1/cron/fear-greed/route.ts
 *
 * Fear & Greed history cron — POST /api/v1/cron/fear-greed
 * Fetches today's F&G value and appends it to fear_greed_history table.
 * Schedule: once daily at 00:05 UTC via cron-job.org
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { redis, CacheKeys } from "@/lib/redis/client";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.nextUrl.searchParams.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch current F&G from alternative.me
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error("F&G API unavailable");

    const data = await res.json() as {
      data?: Array<{ value: string; value_classification: string; timestamp: string }>;
    };

    const item = data.data?.[0];
    if (!item) throw new Error("No data");

    const value = parseInt(item.value);
    const label = item.value_classification;
    const today = new Date().toISOString().split("T")[0]!; // YYYY-MM-DD

    // Store in Supabase
    const db = getDb();
    await db.from("fear_greed_history").upsert(
      { date: today, value, label },
      { onConflict: "date" }
    );

    // Also refresh the Redis F&G cache
    await redis.set(CacheKeys.fearGreed(), {
      value,
      classification: label,
      timestamp: item.timestamp,
    }, { ex: 60 * 60 });

    return NextResponse.json({ ok: true, date: today, value, label });
  } catch (err) {
    console.error("[cron/fear-greed]", err);
    return NextResponse.json({ error: "Fear & greed update failed" }, { status: 500 });
  }
}

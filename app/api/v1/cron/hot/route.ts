import { NextRequest, NextResponse } from "next/server";
import { refreshPrices } from "@/server/jobs/prices";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { updated, errors } = await refreshPrices();
    return NextResponse.json({ ok: true, updated, errors });
  } catch (err) {
    console.error("[cron/hot]", err);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}

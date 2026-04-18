import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/v1/cron/bots
 * Trading bots + DCA execution + loan liquidation + loan interest accrual.
 * Register on cron-job.org: every 5 minutes, POST with Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth.slice(7) !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { handler } = await import("@/server/jobs/bots");
    const result = await handler();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/bots]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

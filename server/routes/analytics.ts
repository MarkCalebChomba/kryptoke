import { Hono } from "hono";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import type { DailyPnl } from "@/types";

const analytics = new Hono();
analytics.use("*", authMiddleware, withApiRateLimit());

/* ─── GET /daily-pnl ────────────────────────────────────────────────────── */

analytics.get("/daily-pnl", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();

  // Get last 30 snapshots
  const { data: snapshots } = await db
    .from("portfolio_snapshots")
    .select("date, value_usd, value_kes")
    .eq("uid", uid)
    .order("date", { ascending: true })
    .limit(31);

  if (!snapshots || snapshots.length < 2) {
    return c.json({ success: true, data: [] });
  }

  const pnl: DailyPnl[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    if (!prev || !curr) continue;
    const pnlUsd = (parseFloat(curr.value_usd) - parseFloat(prev.value_usd)).toFixed(6);
    const pnlKes = (parseFloat(curr.value_kes) - parseFloat(prev.value_kes)).toFixed(2);
    pnl.push({ date: curr.date, pnlUsd, pnlKes });
  }

  return c.json({ success: true, data: pnl });
});

/* ─── GET /portfolio-history ────────────────────────────────────────────── */

analytics.get("/portfolio-history", async (c) => {
  const { uid } = c.get("user");
  const days = parseInt(c.req.query("days") ?? "30");
  const db = getDb();

  const { data } = await db
    .from("portfolio_snapshots")
    .select("date, value_usd, value_kes")
    .eq("uid", uid)
    .order("date", { ascending: true })
    .limit(days);

  return c.json({ success: true, data: data ?? [] });
});

/* ─── GET /spot-pnl ─────────────────────────────────────────────────────── */

analytics.get("/spot-pnl", async (c) => {
  const { uid } = c.get("user");
  const period = c.req.query("period") ?? "30D";
  const db = getDb();

  const daysMap: Record<string, number> = { "7D": 7, "30D": 30, "90D": 90, "All": 365 };
  const days = daysMap[period] ?? 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  // Sum completed trades
  const { data: trades } = await db
    .from("trades")
    .select("amount_in, amount_out, token_in, token_out, side, created_at")
    .eq("uid", uid)
    .eq("status", "completed")
    .gte("created_at", since);

  // Simple PnL: sum of USDT received from sells minus USDT spent on buys
  let totalPnl = 0;
  const today = new Date().toISOString().split("T")[0];
  let todayPnl = 0;

  for (const trade of trades ?? []) {
    const amountOut = parseFloat(trade.amount_out ?? "0");
    const amountIn = parseFloat(trade.amount_in ?? "0");
    const isToday = trade.created_at.startsWith(today ?? "");

    if (trade.side === "sell" && trade.token_out === "USDT") {
      totalPnl += amountOut - amountIn;
      if (isToday) todayPnl += amountOut - amountIn;
    }
  }

  return c.json({
    success: true,
    data: {
      totalPnlUsd: totalPnl.toFixed(6),
      todayPnlUsd: todayPnl.toFixed(6),
      period,
    },
  });
});

/* ─── GET /export-csv — Download ledger as CSV ──────────────────────────── */
analytics.get("/export-csv", authMiddleware, async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();

  const { data } = await db
    .from("ledger_entries")
    .select("created_at, type, asset, amount, note")
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = data ?? [];
  const header = "Date,Type,Asset,Amount,Note\n";
  const body   = rows.map(r =>
    `"${r.created_at}","${r.type}","${r.asset}","${r.amount}","${(r.note ?? "").replace(/"/g, "'")}"`
  ).join("\n");

  const csv = header + body;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="kryptoke-statement-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
});

export default analytics;

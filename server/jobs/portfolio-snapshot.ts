import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import Big from "big.js";

export const handler = async (): Promise<void> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Supabase credentials not configured");

  const db = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fetch today's exchange rate
  const { Redis } = await import("@upstash/redis");
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  });

  const rateKey = "forex:kes_usd";
  const rate = await redis.get<{ kesPerUsd: string }>(rateKey);
  const kesPerUsd = rate?.kesPerUsd ?? "130";

  // Get all user balances
  const { data: balances } = await db
    .from("balances")
    .select("uid, asset, amount");

  if (!balances) return;

  // Group by user
  const byUser = new Map<string, { kes: Big; usdt: Big }>();
  for (const b of balances) {
    if (!byUser.has(b.uid)) {
      byUser.set(b.uid, { kes: new Big(0), usdt: new Big(0) });
    }
    const entry = byUser.get(b.uid)!;
    if (b.asset === "KES") entry.kes = entry.kes.plus(b.amount);
    if (b.asset === "USDT") entry.usdt = entry.usdt.plus(b.amount);
  }

  const today = new Date().toISOString().split("T")[0] ?? "";
  const snapshots = [];

  for (const [uid, { kes, usdt }] of byUser.entries()) {
    const totalUsd = usdt.plus(kes.div(kesPerUsd));
    const totalKes = kes.plus(usdt.times(kesPerUsd));

    snapshots.push({
      uid,
      date: today,
      value_usd: totalUsd.toFixed(6),
      value_kes: totalKes.toFixed(2),
    });
  }

  if (snapshots.length === 0) return;

  // Upsert — idempotent if job runs twice
  await db.from("portfolio_snapshots").upsert(snapshots, { onConflict: "uid,date" });

  console.log(`[Portfolio Snapshot] Captured ${snapshots.length} user snapshots for ${today}`);
};

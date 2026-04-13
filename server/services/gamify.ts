/**
 * server/services/gamify.ts
 *
 * Gamification engine for KryptoKe.
 * All functions are fire-and-forget safe — wrap callers in .catch(() => undefined).
 *
 * XP thresholds:
 *   Bronze   0–499
 *   Silver   500–1 999
 *   Gold     2 000–9 999
 *   Platinum 10 000–49 999
 *   Diamond  50 000+
 *
 * Fee discount: Platinum/Diamond users pay 10% less spread on spot trades.
 */

import { getDb } from "@/server/db/client";

// ─── Badge definitions ────────────────────────────────────────────────────────

export const BADGES: Record<string, { label: string; icon: string; description: string }> = {
  // Onboarding
  first_deposit:     { label: "First Deposit",     icon: "💰", description: "Made your first deposit" },
  kyc_verified:      { label: "Verified",           icon: "✅", description: "Completed KYC verification" },
  // Trading
  first_trade:       { label: "First Trade",        icon: "⚡", description: "Executed your first trade" },
  trade_10:          { label: "Active Trader",       icon: "🔥", description: "Completed 10 trades" },
  trade_100:         { label: "Power Trader",        icon: "🚀", description: "Completed 100 trades" },
  // Levels
  level_silver:      { label: "Silver",             icon: "🥈", description: "Reached Silver level" },
  level_gold:        { label: "Gold",               icon: "🥇", description: "Reached Gold level" },
  level_platinum:    { label: "Platinum",           icon: "💎", description: "Reached Platinum level" },
  level_diamond:     { label: "Diamond",            icon: "💠", description: "Reached Diamond level" },
  // P2P
  p2p_seller:        { label: "P2P Seller",         icon: "🤝", description: "Completed a P2P sale" },
  p2p_power_seller:  { label: "Power Seller",       icon: "⭐", description: "Completed 10 P2P sales" },
  // Referral
  referral_kyc:      { label: "Referrer",           icon: "🎯", description: "Referred a verified user" },
  referral_5:        { label: "Connector",          icon: "🌐", description: "Referred 5 verified users" },
};

// XP to reach next level
const LEVEL_THRESHOLDS = [
  { name: "Bronze",   min: 0,      next: 500   },
  { name: "Silver",   min: 500,    next: 2000  },
  { name: "Gold",     min: 2000,   next: 10000 },
  { name: "Platinum", min: 10000,  next: 50000 },
  { name: "Diamond",  min: 50000,  next: null  },
];

function levelFromXp(xp: number): { level: string; xpToNext: number | null } {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    const t = LEVEL_THRESHOLDS[i]!;
    if (xp >= t.min) {
      return { level: t.name, xpToNext: t.next !== null ? t.next - xp : null };
    }
  }
  return { level: "Bronze", xpToNext: 500 - xp };
}

// ─── awardXp ─────────────────────────────────────────────────────────────────

export async function awardXp(
  uid: string,
  eventType: string,
  xp: number,
  referenceId?: string
): Promise<void> {
  const db = getDb();

  // Insert XP event
  const { error } = await db.from("user_xp_events").insert({
    uid,
    event_type: eventType,
    xp,
    reference_id: referenceId ?? null,
  });
  if (error) {
    console.error(`[gamify] awardXp failed for ${uid}:`, error.message);
    return;
  }

  // Recompute total and check for level-up badge
  const { data: rows } = await db
    .from("user_xp_events")
    .select("xp")
    .eq("uid", uid);

  const totalXp = (rows ?? []).reduce((s, r) => s + (r.xp as number), 0);
  const { level } = levelFromXp(totalXp);

  const levelBadgeMap: Record<string, string> = {
    Silver:   "level_silver",
    Gold:     "level_gold",
    Platinum: "level_platinum",
    Diamond:  "level_diamond",
  };
  const badgeId = levelBadgeMap[level];
  if (badgeId) {
    await awardBadge(uid, badgeId);
  }

  // First-trade badge at 1 trade count
  if (eventType === "trade_completed") {
    const { count } = await db
      .from("user_xp_events")
      .select("*", { count: "exact", head: true })
      .eq("uid", uid)
      .eq("event_type", "trade_completed");
    if (count === 1) await awardBadge(uid, "first_trade");
    if (count === 10) await awardBadge(uid, "trade_10");
    if (count === 100) await awardBadge(uid, "trade_100");
  }

  // P2P power seller at 10
  if (eventType === "p2p_seller") {
    const { count } = await db
      .from("user_xp_events")
      .select("*", { count: "exact", head: true })
      .eq("uid", uid)
      .eq("event_type", "p2p_seller");
    if (count === 10) await awardBadge(uid, "p2p_power_seller");
  }

  // Referral connector at 5
  if (eventType === "referral_kyc") {
    const { count } = await db
      .from("user_xp_events")
      .select("*", { count: "exact", head: true })
      .eq("uid", uid)
      .eq("event_type", "referral_kyc");
    if (count === 5) await awardBadge(uid, "referral_5");
  }
}

// ─── awardBadge ──────────────────────────────────────────────────────────────

export async function awardBadge(uid: string, badgeId: string): Promise<void> {
  const db = getDb();
  // Upsert — silently ignores duplicate (primary key conflict)
  await db.from("user_badges").upsert({ uid, badge_id: badgeId }, { onConflict: "uid,badge_id", ignoreDuplicates: true });
}

// ─── getUserLevel ─────────────────────────────────────────────────────────────

export async function getUserLevel(uid: string): Promise<{
  level: string;
  totalXp: number;
  xpToNext: number | null;
  feeDiscount: number; // 0.0–0.1 — multiply platform fee by (1 - feeDiscount)
}> {
  const db = getDb();
  const { data: rows } = await db
    .from("user_xp_events")
    .select("xp")
    .eq("uid", uid);

  const totalXp = (rows ?? []).reduce((s, r) => s + (r.xp as number), 0);
  const { level, xpToNext } = levelFromXp(totalXp);
  const feeDiscount = level === "Platinum" || level === "Diamond" ? 0.1 : 0;

  return { level, totalXp, xpToNext, feeDiscount };
}

// ─── getLeaderboard ───────────────────────────────────────────────────────────

export async function getLeaderboard(
  period: "weekly" | "alltime",
  limit = 100
): Promise<Array<{ rank: number; display_name: string; xp: number }>> {
  const db = getDb();
  const view = period === "weekly" ? "xp_leaderboard_weekly" : "xp_leaderboard_alltime";
  const xpCol = period === "weekly" ? "weekly_xp" : "total_xp";

  const { data } = await db
    .from(view)
    .select(`rank, display_name, ${xpCol}`)
    .order("rank", { ascending: true })
    .limit(limit);

  return (data ?? []).map((r) => ({
    rank:         r.rank as number,
    display_name: (r.display_name as string) ?? "Anonymous",
    xp:           (r[xpCol] as number) ?? 0,
  }));
}

// ─── getUserRank ──────────────────────────────────────────────────────────────

export async function getUserRank(
  uid: string,
  period: "weekly" | "alltime"
): Promise<number | null> {
  const db = getDb();
  const view = period === "weekly" ? "xp_leaderboard_weekly" : "xp_leaderboard_alltime";
  const { data } = await db.from(view).select("rank").eq("uid", uid).maybeSingle();
  return (data?.rank as number) ?? null;
}

import { Hono } from "hono";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getUserLevel, getLeaderboard, getUserRank, BADGES } from "@/server/services/gamify";

const gamify = new Hono();
gamify.use("*", authMiddleware);
gamify.use("*", withApiRateLimit());

/* ─── GET /me — current user XP, level, badges, rank ────────────────────── */

gamify.get("/me", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();

  const [levelData, { data: earnedBadges }, weeklyRank, alltimeRank] = await Promise.all([
    getUserLevel(uid),
    db.from("user_badges").select("badge_id, awarded_at").eq("uid", uid),
    getUserRank(uid, "weekly"),
    getUserRank(uid, "alltime"),
  ]);

  // Build full badge list: earned + locked
  const earnedSet = new Set((earnedBadges ?? []).map((b) => b.badge_id as string));
  const allBadges = Object.entries(BADGES).map(([id, meta]) => ({
    id,
    ...meta,
    earned: earnedSet.has(id),
    earnedAt: (earnedBadges ?? []).find((b) => b.badge_id === id)?.awarded_at ?? null,
  }));

  // Referral stats
  const { count: referralCount } = await db
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_uid", uid);

  return c.json({
    success: true,
    data: {
      level:       levelData.level,
      totalXp:     levelData.totalXp,
      xpToNext:    levelData.xpToNext,
      feeDiscount: levelData.feeDiscount,
      rankWeekly:  weeklyRank,
      rankAlltime: alltimeRank,
      badges:      allBadges,
      referrals:   referralCount ?? 0,
    },
  });
});

/* ─── GET /leaderboard?period=weekly|alltime ─────────────────────────────── */

gamify.get("/leaderboard", async (c) => {
  const period = (c.req.query("period") ?? "weekly") as "weekly" | "alltime";
  const { uid } = c.get("user");

  const [board, userRank] = await Promise.all([
    getLeaderboard(period, 100),
    getUserRank(uid, period),
  ]);

  return c.json({
    success: true,
    data: {
      period,
      leaderboard: board,
      myRank:      userRank,
    },
  });
});

export default gamify;

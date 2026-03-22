import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";

const referral = new Hono();
referral.use("*", authMiddleware, withApiRateLimit());

/* ─── GET /stats — Referral dashboard ───────────────────────────────────── */
referral.get("/stats", async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();

  // Get user's referral code
  const { data: user } = await db.from("users").select("referral_code").eq("uid", uid).single();

  // Get referral records
  const { data: refs, count } = await db
    .from("referrals")
    .select("*, users!referee_uid(uid, display_name, kyc_status)", { count: "exact" })
    .eq("referrer_uid", uid)
    .order("created_at", { ascending: false })
    .limit(50);

  const totalEarned = (refs ?? []).reduce((s, r) => s + parseFloat(r.total_earned_usdt?.toString() ?? "0"), 0);
  const referralLink = `https://kryptoke.com/register?ref=${user?.referral_code ?? ""}`;

  // Map DB rows to frontend-expected shape
  const mappedRefs = (refs ?? []).map(r => {
    const referee = (r as unknown as { users?: { uid?: string; kyc_status?: string } }).users;
    return {
      id:               r.id,
      maskedId:         `user_***${r.referee_uid?.slice(-4) ?? "????"}`,
      joinedAt:         r.created_at,
      kycStatus:        (referee?.kyc_status === "verified" ? "full" : referee?.kyc_status === "submitted" ? "basic" : "none") as "none" | "basic" | "full",
      tradingVolume30d: "0",
      commissionEarned: r.total_earned_usdt?.toString() ?? "0",
    };
  });

  return c.json({
    success: true,
    data: {
      referralCode:  user?.referral_code ?? "",
      referralLink,
      totalReferred: count ?? 0,
      totalEarned:   totalEarned.toFixed(2),
      pendingEarned: "0",
      commissionRate: 20,
      referrals:     mappedRefs,
    },
  });
});

/* ─── GET /code — Get or generate referral code ─────────────────────────── */
referral.get("/code", async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();

  const { data: user } = await db.from("users").select("referral_code").eq("uid", uid).single();

  if (!user?.referral_code) {
    const code = "KK" + Math.random().toString(36).substring(2, 10).toUpperCase();
    await db.from("users").update({ referral_code: code }).eq("uid", uid);
    return c.json({ success: true, code });
  }

  return c.json({ success: true, code: user.referral_code });
});

/* ─── POST /claim — Process referral when a referee completes KYC ────────── */
referral.post(
  "/claim",
  zValidator("json", z.object({ referralCode: z.string().min(4) })),
  async (c) => {
    const uid  = c.get("uid") as string;
    const body = c.req.valid("json");
    const db   = getDb();

    // Find referrer
    const { data: referrer } = await db
      .from("users")
      .select("uid")
      .eq("referral_code", body.referralCode.toUpperCase())
      .single();

    if (!referrer) return c.json({ success: false, error: "Invalid referral code" }, 400);
    if (referrer.uid === uid) return c.json({ success: false, error: "Cannot refer yourself" }, 400);

    // Check not already referred
    const { data: existing } = await db.from("referrals").select("id").eq("referee_uid", uid).single();
    if (existing) return c.json({ success: false, error: "Already used a referral code" }, 400);

    await db.from("referrals").insert({
      referrer_uid:    referrer.uid,
      referee_uid:     uid,
      referral_code:   body.referralCode.toUpperCase(),
      commission_rate: 0.20,
      rebate_rate:     0.10,
    });

    return c.json({ success: true, message: "Referral recorded successfully." });
  }
);

export default referral;

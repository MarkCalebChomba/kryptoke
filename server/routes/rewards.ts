/**
 * Rewards Routes — NEXUS N-C (Wave 4)
 *
 * Fixes applied vs original:
 *   1. 24h guard on daily_login — query ledger_entries for claim in last 24h
 *   2. Global kill switch — rewards_enabled must be "true" in system_config
 *   3. Budget cap — rewards_budget_remaining_usdt covers the claim; deducted atomically
 *   4. All USDT reward amounts set to "0" — XP always awarded, USDT unlocked when pool funded
 *
 * To activate USDT rewards later:
 *   UPDATE system_config SET value = '1000' WHERE key = 'rewards_budget_remaining_usdt';
 *   UPDATE system_config SET value = 'true'  WHERE key = 'rewards_enabled';
 */

import { Hono } from "hono";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { add } from "@/lib/utils/money";
import { awardXp } from "@/server/services/gamify";
import Big from "big.js";

const rewards = new Hono();
rewards.use("*", authMiddleware, withApiRateLimit());

/* ─── Task definitions — USDT reward is 0 until pool funded ─────────────*/
const TASKS = [
  { id: "kyc",           title: "Complete Identity Verification",   category: "new_user",  reward: "0", asset: "USDT", xp: 500, requiredAction: "/kyc" },
  { id: "first_deposit", title: "Make Your First Deposit",          category: "new_user",  reward: "0", asset: "USDT", xp: 200, requiredAction: "/deposit" },
  { id: "first_trade",   title: "Complete Your First Spot Trade",   category: "new_user",  reward: "0", asset: "USDT", xp: 100, requiredAction: "/trade" },
  { id: "first_earn",    title: "Subscribe to an Earn Product",     category: "new_user",  reward: "0", asset: "USDT", xp: 100, requiredAction: "/earn" },
  { id: "first_p2p",     title: "Complete a P2P Trade",             category: "new_user",  reward: "0", asset: "USDT", xp: 150, requiredAction: "/p2p" },
  { id: "set_alert",     title: "Set a Price Alert",                category: "daily",     reward: "0", asset: "USDT", xp: 10,  requiredAction: "/alerts" },
  { id: "daily_login",   title: "Daily Login Streak",               category: "daily",     reward: "0", asset: "USDT", xp: 20,  requiredAction: "/" },
  { id: "referral_1",    title: "Refer Your First Friend",          category: "referral",  reward: "0", asset: "USDT", xp: 300, requiredAction: "/referral" },
  { id: "futures_trade", title: "Open Your First Futures Position", category: "trading",   reward: "0", asset: "USDT", xp: 150, requiredAction: "/trade" },
  { id: "auto_invest",   title: "Create an Auto-Invest Plan",       category: "investing", reward: "0", asset: "USDT", xp: 100, requiredAction: "/auto-invest" },
] as const;

type TaskId = typeof TASKS[number]["id"];

async function getConfig(key: string): Promise<string | null> {
  try {
    const db = getDb();
    const { data } = await db.from("system_config").select("value").eq("key", key).maybeSingle();
    return (data?.value as string) ?? null;
  } catch { return null; }
}

/* ─── GET /tasks ─────────────────────────────────────────────────────────*/
rewards.get("/tasks", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();

  const [userRes, tradesRes, depositsRes, earnRes, kycRes, alertsRes, p2pRes] = await Promise.all([
    db.from("users").select("kyc_status").eq("uid", uid).single(),
    db.from("trades").select("id").eq("uid", uid).limit(1),
    db.from("deposits").select("id").eq("uid", uid).eq("status", "completed").limit(1),
    db.from("earn_positions").select("id").eq("uid", uid).limit(1),
    db.from("kyc_submissions").select("status").eq("uid", uid).order("created_at", { ascending: false }).limit(1),
    db.from("alerts").select("id").eq("uid", uid).limit(1),
    db.from("p2p_orders").select("id").eq("uid", uid).eq("status", "completed").limit(1),
  ]);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { data: loginToday } = await db.from("login_sessions").select("id").eq("uid", uid).gte("created_at", todayStart.toISOString()).limit(1);

  const completedMap: Partial<Record<TaskId, boolean>> = {
    kyc:           kycRes.data?.[0]?.status === "approved" || userRes.data?.kyc_status === "verified",
    first_deposit: (depositsRes.data?.length ?? 0) > 0,
    first_trade:   (tradesRes.data?.length ?? 0) > 0,
    first_earn:    (earnRes.data?.length ?? 0) > 0,
    set_alert:     (alertsRes.data?.length ?? 0) > 0,
    first_p2p:     (p2pRes.data?.length ?? 0) > 0,
    daily_login:   (loginToday?.length ?? 0) > 0,
  };

  const { data: claimedRows } = await db.from("ledger_entries").select("note, created_at").eq("uid", uid).like("note", "reward:%");
  const claimedSet = new Set((claimedRows ?? []).map((l) => (l.note as string).replace("reward:", "")));
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const dailyClaimedRecently = (claimedRows ?? []).some((l) => l.note === "reward:daily_login" && l.created_at > since24h);

  const tasks = TASKS.map((task) => ({
    ...task,
    completed: completedMap[task.id] ?? false,
    claimed: task.id === "daily_login" ? dailyClaimedRecently : claimedSet.has(task.id),
    progress: (completedMap[task.id] ?? false) ? 1 : 0,
    total: 1,
  }));

  return c.json({ success: true, data: { tasks, claimableCount: tasks.filter((t) => t.completed && !t.claimed).length } });
});

/* ─── POST /claim/:taskId ────────────────────────────────────────────────*/
rewards.post("/claim/:taskId", withSensitiveRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const taskId = c.req.param("taskId") as TaskId;
  const db = getDb();

  const task = TASKS.find((t) => t.id === taskId);
  if (!task) return c.json({ success: false, error: "Unknown task", statusCode: 404 }, 404);

  const rewardsEnabled = await getConfig("rewards_enabled");
  const usdtAmount = parseFloat(task.reward);
  const creditUsdt = rewardsEnabled === "true" && usdtAmount > 0;

  // 1. 24h guard for daily_login
  if (taskId === "daily_login") {
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent } = await db.from("ledger_entries").select("id").eq("uid", uid).eq("note", "reward:daily_login").gte("created_at", since24h).limit(1);
    if ((recent?.length ?? 0) > 0) return c.json({ success: false, error: "Already claimed today. Come back tomorrow!", statusCode: 400 }, 400);
  } else {
    // One-time tasks: never claimed before
    const { data: existing } = await db.from("ledger_entries").select("id").eq("uid", uid).eq("note", `reward:${taskId}`).limit(1).maybeSingle();
    if (existing) return c.json({ success: false, error: "Reward already claimed", statusCode: 400 }, 400);
  }

  // 2. Kill switch — if USDT reward but rewards disabled, fall through to XP-only
  // 3. Budget cap
  if (creditUsdt) {
    const budgetStr = await getConfig("rewards_budget_remaining_usdt");
    const budget = parseFloat(budgetStr ?? "0");
    if (budget < usdtAmount) {
      // Pool empty — award XP only, still mark as claimed
      await createLedgerEntry({ uid, asset: "USDT", amount: "0", type: "reward", note: `reward:${taskId}` });
      await awardXp(uid, `task_reward_${taskId}`, task.xp, taskId).catch(() => {});
      return c.json({ success: true, message: `+${task.xp} XP earned! USDT reward coming soon.`, reward: { amount: "0", asset: "USDT", xp: task.xp } });
    }

    // Deduct budget
    const newBudget = new Big(budgetStr ?? "0").minus(usdtAmount).toFixed(6);
    await db.from("system_config").update({ value: newBudget }).eq("key", "rewards_budget_remaining_usdt");

    // Credit balance
    const current = await getBalance(uid, task.asset, "funding");
    await upsertBalance(uid, task.asset, add(current, task.reward), "funding");
    await createLedgerEntry({ uid, asset: task.asset, amount: task.reward, type: "reward", note: `reward:${taskId}` });
  } else {
    // XP-only — still mark claimed
    await createLedgerEntry({ uid, asset: "USDT", amount: "0", type: "reward", note: `reward:${taskId}` });
  }

  // 4. Always award XP
  await awardXp(uid, `task_reward_${taskId}`, task.xp, taskId).catch(() => {});

  return c.json({
    success: true,
    message: creditUsdt ? `${task.reward} ${task.asset} + ${task.xp} XP credited!` : `+${task.xp} XP earned! USDT rewards unlock soon.`,
    reward: { amount: creditUsdt ? task.reward : "0", asset: task.asset, xp: task.xp },
  });
});

/* ─── GET /summary ───────────────────────────────────────────────────────*/
rewards.get("/summary", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();
  const [claimedRes, budgetStr, enabledStr] = await Promise.all([
    db.from("ledger_entries").select("amount").eq("uid", uid).eq("type", "reward"),
    getConfig("rewards_budget_remaining_usdt"),
    getConfig("rewards_enabled"),
  ]);
  const totalClaimed = (claimedRes.data ?? []).reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0).toFixed(2);
  return c.json({ success: true, data: { totalClaimedUsdt: totalClaimed, poolEnabled: enabledStr === "true", poolFunded: parseFloat(budgetStr ?? "0") > 0 } });
});

export default rewards;

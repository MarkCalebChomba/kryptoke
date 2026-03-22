import { Hono } from "hono";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit } from "@/server/middleware/ratelimit";
import { getDb } from "@/server/db/client";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { add } from "@/lib/utils/money";

const rewards = new Hono();
rewards.use("*", authMiddleware, withApiRateLimit());

/* ─── Static task definitions ────────────────────────────────────────────── */
const TASKS = [
  { id: "kyc",          title: "Complete Identity Verification",  category: "new_user",   reward: "5",    asset: "USDT", requiredAction: "/kyc" },
  { id: "first_deposit",title: "Make Your First Deposit",         category: "new_user",   reward: "2",    asset: "USDT", requiredAction: "/deposit" },
  { id: "first_trade",  title: "Complete Your First Spot Trade",  category: "new_user",   reward: "1",    asset: "USDT", requiredAction: "/trade" },
  { id: "first_earn",   title: "Subscribe to an Earn Product",    category: "new_user",   reward: "1",    asset: "USDT", requiredAction: "/earn" },
  { id: "first_p2p",    title: "Complete a P2P Trade",            category: "new_user",   reward: "2",    asset: "USDT", requiredAction: "/p2p" },
  { id: "set_alert",    title: "Set a Price Alert",               category: "daily",      reward: "0.1",  asset: "USDT", requiredAction: "/alerts" },
  { id: "daily_login",  title: "Daily Login Streak",              category: "daily",      reward: "0.05", asset: "USDT", requiredAction: "/" },
  { id: "referral_1",   title: "Refer Your First Friend",         category: "referral",   reward: "10",   asset: "USDT", requiredAction: "/referral" },
  { id: "futures_trade",title: "Open Your First Futures Position",category: "trading",    reward: "2",    asset: "USDT", requiredAction: "/trade" },
  { id: "auto_invest",  title: "Create an Auto-Invest Plan",      category: "investing",  reward: "1",    asset: "USDT", requiredAction: "/auto-invest" },
];

/* ─── GET /tasks — Return tasks with completion status ───────────────────── */
rewards.get("/tasks", async (c) => {
  const uid = c.get("uid") as string;
  const db  = getDb();

  // Get user data to determine which tasks are complete
  const [userRes, tradesRes, depositsRes, earnRes, kyc, alertsRes] = await Promise.all([
    db.from("users").select("kyc_status").eq("uid", uid).single(),
    db.from("trades").select("id").eq("uid", uid).limit(1),
    db.from("deposits").select("id").eq("uid", uid).eq("status", "completed").limit(1),
    db.from("earn_positions").select("id").eq("uid", uid).limit(1),
    db.from("kyc_submissions").select("id, status").eq("uid", uid).order("created_at", { ascending: false }).limit(1),
    db.from("alerts").select("id").eq("uid", uid).limit(1),
  ]);

  const completedMap: Record<string, boolean> = {
    kyc:           (kyc.data?.[0]?.status === "approved") || userRes.data?.kyc_status === "verified",
    first_deposit: (depositsRes.data?.length ?? 0) > 0,
    first_trade:   (tradesRes.data?.length ?? 0) > 0,
    first_earn:    (earnRes.data?.length ?? 0) > 0,
    set_alert:     (alertsRes.data?.length ?? 0) > 0,
  };

  // Check claimed rewards from ledger
  const { data: claimed } = await db
    .from("ledger_entries")
    .select("note")
    .eq("uid", uid)
    .like("note", "reward:%");

  const claimedSet = new Set((claimed ?? []).map(l => l.note.replace("reward:", "")));

  const tasks = TASKS.map(task => ({
    ...task,
    completed: completedMap[task.id] ?? false,
    claimed:   claimedSet.has(task.id),
    progress:  completedMap[task.id] ? 1 : 0,
    total:     1,
  }));

  // Voucher-style rewards available
  const vouchers = tasks.filter(t => t.completed && !t.claimed).map(t => ({
    id:      t.id,
    type:    "task_reward",
    amount:  t.reward,
    asset:   t.asset,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  return c.json({ success: true, data: { tasks, vouchers } });
});

/* ─── POST /claim/:taskId — Claim a completed task reward ───────────────── */
rewards.post("/claim/:taskId", async (c) => {
  const uid    = c.get("uid") as string;
  const taskId = c.req.param("taskId");
  const db     = getDb();

  const task = TASKS.find(t => t.id === taskId);
  if (!task) return c.json({ success: false, error: "Unknown task" }, 404);

  // Check not already claimed
  const { data: existing } = await db
    .from("ledger_entries")
    .select("id")
    .eq("uid", uid)
    .eq("note", `reward:${taskId}`)
    .single();

  if (existing) return c.json({ success: false, error: "Reward already claimed" }, 400);

  // Credit the reward
  const current = await getBalance(uid, task.asset, "funding");
  await upsertBalance(uid, task.asset, add(current, task.reward), "funding");
  await createLedgerEntry({ uid, asset: task.asset, amount: task.reward, type: "reward", note: `reward:${taskId}` });

  return c.json({
    success: true,
    message: `${task.reward} ${task.asset} credited to your Funding wallet.`,
    reward: { amount: task.reward, asset: task.asset },
  });
});

export default rewards;

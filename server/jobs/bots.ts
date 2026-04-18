/**
 * Bots Job — SHIELD S-F
 *
 * Runs every 5 minutes via POST /api/v1/cron/bots.
 * Handles three responsibilities:
 *   1. Trading bot ticks (grid / DCA / rebalance)
 *   2. DCA plan execution
 *   3. Crypto loan interest accrual + liquidation checks
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { add, subtract, lt } from "@/lib/utils/money";
import Big from "big.js";

type TradingBot = Database["public"]["Tables"]["trading_bots"]["Row"];
type DcaPlan    = Database["public"]["Tables"]["dca_plans"]["Row"];
type CryptoLoan = Database["public"]["Tables"]["crypto_loans"]["Row"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getPrice(symbol: string): Promise<number | null> {
  try {
    const { redis } = await import("@/lib/redis/client");
    const raw = await redis.get<string>(`binance:ticker:${symbol.toUpperCase()}USDT`);
    return raw ? parseFloat(raw) : null;
  } catch {
    return null;
  }
}

function nextRunAt(frequency: DcaPlan["frequency"], from: Date): Date {
  const d = new Date(from);
  switch (frequency) {
    case "hourly":    d.setHours(d.getHours() + 1);     break;
    case "daily":     d.setDate(d.getDate() + 1);        break;
    case "weekly":    d.setDate(d.getDate() + 7);        break;
    case "biweekly":  d.setDate(d.getDate() + 14);       break;
    case "monthly":   d.setMonth(d.getMonth() + 1);      break;
  }
  return d;
}

// ── Grid bot tick ─────────────────────────────────────────────────────────────

async function tickGridBot(bot: TradingBot): Promise<void> {
  const db     = getDb();
  const config = bot.config as { gridLow: number; gridHigh: number; gridCount: number; amountPerGrid: number };
  const state  = (bot.state ?? {}) as { lastPrice?: number; orders?: Array<{ price: number; side: "buy" | "sell" }> };

  if (!config.gridLow || !config.gridHigh || !config.gridCount) return;

  const [baseSymbol] = bot.pair.split("/");
  const price = await getPrice(baseSymbol ?? bot.pair);
  if (!price) return;

  const step = (config.gridHigh - config.gridLow) / config.gridCount;
  const gridLevels = Array.from({ length: config.gridCount + 1 }, (_, i) => config.gridLow + i * step);
  const lastPrice = state.lastPrice ?? price;

  // Find grid crossings between lastPrice and current price
  const crossedLevels = gridLevels.filter(level =>
    (lastPrice < level && price >= level) || (lastPrice > level && price <= level)
  );

  let pnlDelta = 0;
  for (const level of crossedLevels) {
    const side = price >= level ? "sell" : "buy"; // crossed up → sell, crossed down → buy
    const amountUsdt = config.amountPerGrid ?? 10;
    const units = amountUsdt / level;

    try {
      if (side === "buy") {
        const bal = await getBalance(bot.uid, "USDT", "trading");
        if (lt(bal, amountUsdt.toString())) continue;
        await upsertBalance(bot.uid, "USDT", subtract(bal, amountUsdt.toString()), "trading");
        const assetBal = await getBalance(bot.uid, baseSymbol!, "trading");
        await upsertBalance(bot.uid, baseSymbol!, add(assetBal, units.toFixed(8)), "trading");
        await createLedgerEntry({ uid: bot.uid, asset: "USDT", amount: `-${amountUsdt}`, type: "bot_trade", note: `Grid buy ${units.toFixed(6)} ${baseSymbol} @ ${level}` });
      } else {
        const assetBal = await getBalance(bot.uid, baseSymbol!, "trading");
        if (lt(assetBal, units.toFixed(8))) continue;
        await upsertBalance(bot.uid, baseSymbol!, subtract(assetBal, units.toFixed(8)), "trading");
        const usdtBal = await getBalance(bot.uid, "USDT", "trading");
        await upsertBalance(bot.uid, "USDT", add(usdtBal, amountUsdt.toString()), "trading");
        pnlDelta += amountUsdt * 0.002; // ~0.2% grid spread profit
        await createLedgerEntry({ uid: bot.uid, asset: "USDT", amount: amountUsdt.toString(), type: "bot_trade", note: `Grid sell ${units.toFixed(6)} ${baseSymbol} @ ${level}` });
      }
    } catch { /* balance issue — skip this level */ }
  }

  await db.from("trading_bots").update({
    state: { ...state, lastPrice: price },
    pnl_usdt: new Big(bot.pnl_usdt ?? 0).plus(pnlDelta).toFixed(8),
    executions: (bot.executions ?? 0) + crossedLevels.length,
    last_tick: new Date().toISOString(),
  }).eq("id", bot.id);
}

// ── Rebalance bot tick ────────────────────────────────────────────────────────

async function tickRebalanceBot(bot: TradingBot): Promise<void> {
  const db     = getDb();
  const config = bot.config as { targets: Record<string, number>; threshold: number }; // e.g. { BTC: 0.5, ETH: 0.3, USDT: 0.2 }, threshold: 0.05
  const state  = (bot.state ?? {}) as { lastRebalance?: string };

  if (!config.targets || !config.threshold) return;

  // Only rebalance if enough time has passed (min 1 hour between rebalances)
  const lastRebalance = state.lastRebalance ? new Date(state.lastRebalance) : new Date(0);
  if (Date.now() - lastRebalance.getTime() < 60 * 60 * 1000) return;

  // Get current balances and prices
  const assets = Object.keys(config.targets);
  const values: Record<string, number> = {};
  let totalUsd = 0;

  for (const asset of assets) {
    const bal = await getBalance(bot.uid, asset, "trading");
    const price = asset === "USDT" ? 1 : (await getPrice(asset)) ?? 0;
    const usdVal = parseFloat(bal) * price;
    values[asset] = usdVal;
    totalUsd += usdVal;
  }

  if (totalUsd < 10) return; // not enough to rebalance

  // Check if any asset has drifted beyond threshold
  let needsRebalance = false;
  for (const [asset, targetPct] of Object.entries(config.targets)) {
    const currentPct = (values[asset] ?? 0) / totalUsd;
    if (Math.abs(currentPct - targetPct) > config.threshold) {
      needsRebalance = true;
      break;
    }
  }

  if (!needsRebalance) return;

  // Execute rebalance trades (simplified: sell overweight → buy underweight via USDT)
  for (const [asset, targetPct] of Object.entries(config.targets)) {
    if (asset === "USDT") continue;
    const targetUsd = totalUsd * targetPct;
    const currentUsd = values[asset] ?? 0;
    const diff = targetUsd - currentUsd;
    const price = (await getPrice(asset)) ?? 0;
    if (!price || Math.abs(diff) < 1) continue;

    const units = Math.abs(diff) / price;
    if (diff < 0) {
      // Overweight — sell
      const assetBal = await getBalance(bot.uid, asset, "trading");
      if (lt(assetBal, units.toFixed(8))) continue;
      await upsertBalance(bot.uid, asset, subtract(assetBal, units.toFixed(8)), "trading");
      const usdtBal = await getBalance(bot.uid, "USDT", "trading");
      await upsertBalance(bot.uid, "USDT", add(usdtBal, Math.abs(diff).toFixed(8)), "trading");
      await createLedgerEntry({ uid: bot.uid, asset, amount: `-${units.toFixed(8)}`, type: "bot_trade", note: `Rebalance sell ${asset}` });
    } else {
      // Underweight — buy
      const usdtBal = await getBalance(bot.uid, "USDT", "trading");
      if (lt(usdtBal, diff.toFixed(8))) continue;
      await upsertBalance(bot.uid, "USDT", subtract(usdtBal, diff.toFixed(8)), "trading");
      const assetBal = await getBalance(bot.uid, asset, "trading");
      await upsertBalance(bot.uid, asset, add(assetBal, units.toFixed(8)), "trading");
      await createLedgerEntry({ uid: bot.uid, asset: "USDT", amount: `-${diff.toFixed(8)}`, type: "bot_trade", note: `Rebalance buy ${asset}` });
    }
  }

  await db.from("trading_bots").update({
    state: { ...state, lastRebalance: new Date().toISOString() },
    executions: (bot.executions ?? 0) + 1,
    last_tick: new Date().toISOString(),
  }).eq("id", bot.id);
}

// ── DCA plan execution ────────────────────────────────────────────────────────

async function executeDcaPlan(plan: DcaPlan): Promise<void> {
  const db    = getDb();
  const now   = new Date();
  const price = await getPrice(plan.asset);
  if (!price || price <= 0) return;

  const amountUsdt = parseFloat(plan.amount_per_cycle);
  const units      = amountUsdt / price;

  // Check balance
  const usdtBal = await getBalance(plan.uid, "USDT", "trading");
  if (lt(usdtBal, amountUsdt.toString())) {
    // Pause plan — insufficient funds
    await db.from("dca_plans").update({ status: "paused" }).eq("id", plan.id);
    return;
  }

  // Execute: debit USDT, credit asset
  await upsertBalance(plan.uid, "USDT", subtract(usdtBal, amountUsdt.toString()), "trading");
  const assetBal = await getBalance(plan.uid, plan.asset, "trading");
  await upsertBalance(plan.uid, plan.asset, add(assetBal, units.toFixed(8)), "trading");

  await createLedgerEntry({
    uid:    plan.uid,
    asset:  "USDT",
    amount: `-${amountUsdt}`,
    type:   "dca_purchase",
    note:   `DCA: bought ${units.toFixed(6)} ${plan.asset} @ $${price.toFixed(2)}`,
  });

  await db.from("dca_plans").update({
    last_run_at:    now.toISOString(),
    next_run_at:    nextRunAt(plan.frequency, now).toISOString(),
    total_invested: new Big(plan.total_invested ?? 0).plus(amountUsdt).toFixed(8),
    total_units:    new Big(plan.total_units ?? 0).plus(units).toFixed(8),
    executions:     (plan.executions ?? 0) + 1,
  }).eq("id", plan.id);
}

// ── Loan interest accrual ─────────────────────────────────────────────────────

async function accrueLoansInterest(db: ReturnType<typeof getDb>): Promise<void> {
  const { data: loans } = await db
    .from("crypto_loans")
    .select("id, uid, loan_amount, interest_accrued, daily_rate, due_at")
    .eq("status", "active");

  for (const loan of loans ?? []) {
    // Accrue 5-minute slice of daily interest: daily_rate / (24*12)
    const sliceRate = new Big(loan.daily_rate).div(24 * 12);
    const interest  = new Big(loan.loan_amount).times(sliceRate);
    const newAccrued = new Big(loan.interest_accrued ?? 0).plus(interest);

    // Mark overdue if past due_at
    const overdue = new Date(loan.due_at) < new Date();
    await db.from("crypto_loans").update({
      interest_accrued: newAccrued.toFixed(8),
      ...(overdue ? { status: "overdue" } : {}),
    }).eq("id", loan.id);
  }
}

// ── Loan liquidation check ────────────────────────────────────────────────────

async function checkLoanLiquidations(db: ReturnType<typeof getDb>): Promise<number> {
  const { data: loans } = await db
    .from("crypto_loans")
    .select("*")
    .in("status", ["active", "overdue"]);

  let liquidated = 0;

  for (const loan of (loans ?? []) as CryptoLoan[]) {
    const price = await getPrice(loan.collateral_asset);
    if (!price) continue;

    const collateralUsd = new Big(loan.collateral_amount).times(price);
    const totalOwed     = new Big(loan.loan_amount).plus(loan.interest_accrued ?? 0);
    const ltv           = totalOwed.div(collateralUsd);

    if (ltv.gte(loan.liquidation_ltv)) {
      // Liquidate: keep collateral as platform, zero out balances
      await db.from("crypto_loans").update({
        status:           "liquidated",
        liquidated_at:    new Date().toISOString(),
        liquidation_price: price.toString(),
        current_ltv:      ltv.toFixed(4),
      }).eq("id", loan.id);

      // Collateral was already deducted from user at loan creation — no balance change needed
      // Log ledger entry for audit
      await createLedgerEntry({
        uid:    loan.uid,
        asset:  loan.collateral_asset,
        amount: `-${loan.collateral_amount}`,
        type:   "liquidation",
        note:   `Loan ${loan.id} liquidated at LTV ${ltv.toFixed(2)} (price $${price})`,
      });

      // Notify user
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const notifDb = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await notifDb.from("notifications").insert({
          uid:   loan.uid,
          type:  "liquidation" as never,
          title: "Loan Liquidated",
          body:  `Your ${loan.collateral_asset} collateral was liquidated. LTV reached ${(parseFloat(ltv.toFixed(2)) * 100).toFixed(0)}%.`,
          read:  false,
        });
      } catch { /* non-fatal */ }

      liquidated++;
    } else {
      // Update current LTV
      await db.from("crypto_loans").update({
        current_ltv: ltv.toFixed(4),
      }).eq("id", loan.id);
    }
  }

  return liquidated;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const handler = async (): Promise<{
  botsRan: number; dcaRan: number; loansAccrued: number; liquidations: number;
}> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials not configured");
  }

  const db  = getDb();
  const now = new Date();

  // ── 1. Run active trading bot ticks ────────────────────────────────────────
  const { data: bots } = await db
    .from("trading_bots")
    .select("*")
    .eq("status", "running");

  let botsRan = 0;
  for (const bot of (bots ?? []) as TradingBot[]) {
    try {
      if (bot.type === "grid")      await tickGridBot(bot);
      if (bot.type === "rebalance") await tickRebalanceBot(bot);
      // DCA bots are handled via dca_plans table below
      botsRan++;
    } catch (err) {
      console.error(`[bots] Bot ${bot.id} error:`, err);
      await db.from("trading_bots").update({
        status:    "error",
        error_msg: err instanceof Error ? err.message : "Unknown error",
      }).eq("id", bot.id);
    }
  }

  // ── 2. Execute due DCA plans ────────────────────────────────────────────────
  const { data: duePlans } = await db
    .from("dca_plans")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", now.toISOString());

  let dcaRan = 0;
  for (const plan of (duePlans ?? []) as DcaPlan[]) {
    try {
      await executeDcaPlan(plan);
      dcaRan++;
    } catch (err) {
      console.error(`[bots] DCA plan ${plan.id} error:`, err);
    }
  }

  // ── 3. Accrue loan interest ────────────────────────────────────────────────
  await accrueLoansInterest(db);
  const { count: activeLoans } = await db
    .from("crypto_loans")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  // ── 4. Check liquidations ──────────────────────────────────────────────────
  const liquidations = await checkLoanLiquidations(db);

  console.log(`[bots] bots=${botsRan} dca=${dcaRan} loans=${activeLoans ?? 0} liquidations=${liquidations}`);
  return { botsRan, dcaRan, loansAccrued: activeLoans ?? 0, liquidations };
};

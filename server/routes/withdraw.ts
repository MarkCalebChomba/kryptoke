/**
 * Withdrawal Routes
 *
 * POST /withdraw/kes          — withdraw KES to M-Pesa via B2C
 * POST /withdraw/mpesa-usdt   — convert USDT to KES and withdraw via M-Pesa
 * POST /withdraw/crypto       — queue crypto withdrawal to external wallet
 * POST /withdraw/cancel/:id   — cancel a pending_cancel withdrawal
 * GET  /withdraw/fee          — get fee for asset+chain
 * GET  /withdraw/chains/:asset— get available chains for an asset
 * GET  /withdraw/limits       — daily limits and remaining balance
 * GET  /withdraw/history      — full withdrawal history
 * GET  /withdraw/queue        — user's active queued withdrawals
 *
 * Crypto withdrawals are queued:
 *   pending_cancel (10 min) → queued → broadcasting → completed
 *   Above $500 USD → awaiting_admin → approved/rejected by admin
 *
 * Rate offset is applied silently on M-Pesa USDT conversions.
 * Fees come from chain_fees and system_config tables.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authMiddleware } from "@/server/middleware/auth";
import { withSensitiveRateLimit, withApiRateLimit, withPinRateLimit } from "@/server/middleware/ratelimit";
import { findUserByUid } from "@/server/db/users";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { initiateB2c, parseB2cResult } from "@/server/services/mpesa";
import { getExchangeRate } from "@/server/services/forex";
import { getDb } from "@/server/db/client";
import { Notifications } from "@/server/services/notifications";
import { isValidKenyanPhone } from "@/lib/utils/formatters";
import { subtract, add, lt } from "@/lib/utils/money";
import Big from "big.js";

const withdraw = new Hono();

const DAILY_LIMIT_KES = "150000";
const MIN_WITHDRAWAL_KES = "500";
const MPESA_FEE_PERCENT = "0.01"; // 1%

withdraw.use("*", authMiddleware);

async function getConfig(key: string, fallback: string): Promise<string> {
  const db = getDb();
  const { data } = await db.from("system_config").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) ?? fallback;
}

async function getChainFee(chainId: string, assetSymbol: string): Promise<{ flat: string; pct: number; minWithdraw: string }> {
  const db = getDb();
  const { data: chainRow } = await db.from("chain_fees").select("withdraw_flat, withdraw_pct, min_withdraw").eq("chain_id", chainId).maybeSingle();
  if (!chainRow) return { flat: "0", pct: 0, minWithdraw: "0" };

  const NATIVE_MAP: Record<string, string> = {
    TRON: "TRX", SOL: "SOL", XRP: "XRP", TON: "TON", XLM: "XLM",
    NEAR: "NEAR", FIL: "FIL", BTC: "BTC", LTC: "LTC", DOGE: "DOGE", BCH: "BCH",
  };
  const nativeSymbol = NATIVE_MAP[chainId.toUpperCase()] ?? chainId.toUpperCase();
  const isNativeCoin = assetSymbol.toUpperCase() === nativeSymbol;

  if (isNativeCoin) {
    const nativeFee = await getConfig(`fee_native_${chainId.toUpperCase()}`, chainRow.withdraw_flat?.toString() ?? "0");
    return { flat: nativeFee, pct: parseFloat(chainRow.withdraw_pct?.toString() ?? "0"), minWithdraw: chainRow.min_withdraw?.toString() ?? "0" };
  }
  return { flat: chainRow.withdraw_flat?.toString() ?? "0", pct: parseFloat(chainRow.withdraw_pct?.toString() ?? "0"), minWithdraw: chainRow.min_withdraw?.toString() ?? "0" };
}

async function getUsdEquivalent(asset: string, amount: string): Promise<number> {
  if (asset === "USDT" || asset === "USDC") return parseFloat(amount);
  const { redis } = await import("@/lib/redis/client");
  const prices = await redis.get<Record<string, string>>("binance:tickers").catch(() => null);
  const price = prices?.[`${asset}USDT`] ?? "1";
  return parseFloat(amount) * parseFloat(price);
}

async function checkFreeze(tokenSymbol: string, chainId: string): Promise<{ depositFrozen: boolean; withdrawFrozen: boolean }> {
  const db = getDb();
  const { data } = await db.from("token_chain_freeze").select("deposit_frozen, withdraw_frozen").eq("token_symbol", tokenSymbol.toUpperCase()).eq("chain_id", chainId).maybeSingle();
  return { depositFrozen: data?.deposit_frozen ?? false, withdrawFrozen: data?.withdraw_frozen ?? false };
}

/* ── POST /kes ────────────────────────────────────────────────────────────── */

withdraw.post("/kes", withSensitiveRateLimit(),
  zValidator("json", z.object({
    amount: z.number().min(100).max(150_000),
    phone: z.string().refine(isValidKenyanPhone, "Invalid phone number"),
    assetPin: z.string().length(6).regex(/^\d+$/),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { amount, phone, assetPin } = c.req.valid("json");
    const amountStr = amount.toFixed(2);
    const db = getDb();

    const userRow = await findUserByUid(uid);
    if (!userRow?.asset_pin_hash) return c.json({ success: false, error: "Asset PIN not set", statusCode: 400 }, 400);
    const pinValid = await bcrypt.compare(assetPin, userRow.asset_pin_hash);
    if (!pinValid) return c.json({ success: false, error: "Incorrect asset PIN", statusCode: 400 }, 400);

    const today = new Date().toISOString().split("T")[0] ?? "";
    const { data: dailyTotal } = await db.rpc("get_daily_withdrawal_total", { p_uid: uid, p_date: today });
    const used = (dailyTotal as number | null) ?? 0;
    const remaining = new Big(DAILY_LIMIT_KES).minus(used);
    if (remaining.lte(0) || new Big(amountStr).gt(remaining)) {
      return c.json({ success: false, error: `Daily limit reached. KSh ${remaining.toFixed(2)} remaining.`, statusCode: 400 }, 400);
    }

    const kesBalance = await getBalance(uid, "KES", "funding");
    if (lt(kesBalance, amountStr)) return c.json({ success: false, error: "Insufficient KES balance", statusCode: 400 }, 400);

    const fee = new Big(amountStr).times(MPESA_FEE_PERCENT).toFixed(2);
    const netAmount = new Big(amountStr).minus(fee).toFixed(2);
    await upsertBalance(uid, "KES", subtract(kesBalance, amountStr), "funding");

    const { data: wr, error: ie } = await db.from("withdrawals")
      .insert({ uid, type: "kes", amount: amountStr, fee, net_amount: netAmount, phone, status: "processing" })
      .select().single();

    if (ie || !wr) { await upsertBalance(uid, "KES", kesBalance, "funding"); return c.json({ success: false, error: "Failed to create record", statusCode: 500 }, 500); }

    try {
      const b2c = await initiateB2c(phone, parseFloat(netAmount), wr.id);
      await db.from("withdrawals").update({ b2c_conversation_id: b2c.conversationId }).eq("id", wr.id);
      await createLedgerEntry({ uid, asset: "KES", amount: `-${amountStr}`, type: "withdrawal", reference_id: wr.id, note: `M-Pesa withdrawal to ${phone}` });
      return c.json({ success: true, data: { txId: wr.id, amount: amountStr, fee, netAmount, message: "M-Pesa payment initiated." } });
    } catch {
      await upsertBalance(uid, "KES", kesBalance, "funding");
      await db.from("withdrawals").update({ status: "failed" }).eq("id", wr.id);
      return c.json({ success: false, error: "M-Pesa payment could not be initiated. Please try again.", statusCode: 502 }, 502);
    }
  }
);

/* ── POST /mpesa-usdt ─────────────────────────────────────────────────────── */

/* ─── POST /mpesa-usdt ───────────────────────────────────────────────────────
 * Convert ANY crypto asset to KES and send via M-Pesa B2C.
 * This is our core selling point — supports all 14 tokens up to KSh 150,000.
 * Token→USDT conversion uses live Binance price from Redis.
 * KES rate uses market rate minus withdrawal spread (silent).
 */
withdraw.post("/mpesa-usdt", withSensitiveRateLimit(),
  zValidator("json", z.object({
    kesAmount: z.number().min(100).max(150_000),
    asset: z.string().min(1).max(20).default("USDT"), // any token the user holds
    phone: z.string().refine(isValidKenyanPhone, "Invalid Kenyan phone number"),
    assetPin: z.string().length(6).regex(/^\d+$/),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { kesAmount, asset: rawAsset, phone, assetPin } = c.req.valid("json");
    const asset = rawAsset.toUpperCase();
    const db = getDb();

    // ── PIN verification ────────────────────────────────────────────────────
    const userRow = await findUserByUid(uid);
    if (!userRow?.asset_pin_hash) {
      return c.json({ success: false, error: "Asset PIN not set. Please set one in Settings → Security.", statusCode: 400 }, 400);
    }
    const pinValid = await bcrypt.compare(assetPin, userRow.asset_pin_hash);
    if (!pinValid) return c.json({ success: false, error: "Incorrect asset PIN.", statusCode: 400 }, 400);

    // ── Daily limit check ────────────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0] ?? "";
    const { data: dailyTotal } = await db.rpc("get_daily_withdrawal_total", { p_uid: uid, p_date: today });
    const used = (dailyTotal as number | null) ?? 0;
    const remaining = new Big(DAILY_LIMIT_KES).minus(used);
    if (remaining.lte(0) || new Big(kesAmount.toFixed(2)).gt(remaining)) {
      return c.json({ success: false, error: `Daily limit reached. KSh ${remaining.toFixed(2)} remaining today.`, statusCode: 400 }, 400);
    }

    // ── Get effective KES/USD rate (with silent spread) ──────────────────────
    const rate = await getExchangeRate();
    const withdrawSpread = parseFloat(await getConfig("kes_withdraw_spread", "3"));
    const kesPerUsd = parseFloat(rate.kesPerUsd) - withdrawSpread;
    if (kesPerUsd <= 0) return c.json({ success: false, error: "Exchange rate unavailable. Please try again.", statusCode: 503 }, 503);

    // ── Calculate asset cost ─────────────────────────────────────────────────
    // kesAmount → USD → asset units
    let assetCost: string;
    let assetToUsdRate = 1; // default for USDT/USDC

    if (asset === "USDT" || asset === "USDC") {
      assetCost = new Big(kesAmount).div(kesPerUsd).toFixed(6);
    } else {
      // Look up live price from Redis (set by Binance WS)
      const { redis } = await import("@/lib/redis/client");
      const prices = await redis.get<Record<string, string>>("binance:tickers").catch(() => null);
      const priceStr = prices?.[`${asset}USDT`];
      if (!priceStr || parseFloat(priceStr) <= 0) {
        return c.json({ success: false, error: `Cannot get live price for ${asset}. Please try again.`, statusCode: 503 }, 503);
      }
      assetToUsdRate = parseFloat(priceStr);
      // KES → USD → asset
      const usdNeeded = new Big(kesAmount).div(kesPerUsd);
      assetCost = usdNeeded.div(assetToUsdRate).toFixed(8);
    }

    // ── Balance check ────────────────────────────────────────────────────────
    const assetBalance = await getBalance(uid, asset, "funding");
    if (lt(assetBalance, assetCost)) {
      const usdValue = new Big(assetBalance).times(assetToUsdRate).toFixed(2);
      const maxKes = new Big(usdValue).times(kesPerUsd).toFixed(0);
      return c.json({
        success: false,
        error: `Insufficient ${asset} balance. Maximum withdrawal with your balance: KSh ${maxKes}.`,
        statusCode: 400,
      }, 400);
    }

    // ── Fee calculation ──────────────────────────────────────────────────────
    const feesKes = new Big(kesAmount).times(MPESA_FEE_PERCENT).toFixed(2);
    const netKes = new Big(kesAmount).minus(feesKes).toFixed(2);

    // ── Deduct balance optimistically ────────────────────────────────────────
    const newBalance = subtract(assetBalance, assetCost);
    await upsertBalance(uid, asset, newBalance, "funding");

    // ── Create withdrawal record ─────────────────────────────────────────────
    const { data: wr, error: ie } = await db.from("withdrawals")
      .insert({
        uid,
        type: "mpesa_usdt",
        amount: kesAmount.toFixed(2),
        fee: feesKes,
        net_amount: netKes,
        phone,
        status: "processing",
        asset,
      })
      .select().single();

    if (ie || !wr) {
      // Rollback balance
      await upsertBalance(uid, asset, assetBalance, "funding");
      return c.json({ success: false, error: "Could not create withdrawal record.", statusCode: 500 }, 500);
    }

    // ── Initiate B2C ─────────────────────────────────────────────────────────
    try {
      const b2c = await initiateB2c(phone, parseFloat(netKes), wr.id);
      await db.from("withdrawals").update({ b2c_conversation_id: b2c.conversationId }).eq("id", wr.id);

      await createLedgerEntry({
        uid,
        asset,
        amount: `-${assetCost}`,
        type: "withdrawal",
        reference_id: wr.id,
        note: `${asset}→KES: ${assetCost} ${asset} → KSh ${kesAmount} via M-Pesa to ${phone}`,
      });

      return c.json({
        success: true,
        data: {
          txId: wr.id,
          assetDeducted: assetCost,
          asset,
          kesAmount: kesAmount.toFixed(2),
          fee: feesKes,
          netKes,
          message: "M-Pesa payment initiated. Funds arriving shortly.",
        },
      });
    } catch {
      // Rollback balance on B2C failure
      await upsertBalance(uid, asset, assetBalance, "funding");
      await db.from("withdrawals").update({ status: "failed" }).eq("id", wr.id);
      return c.json({ success: false, error: "M-Pesa payment could not be initiated. Please try again.", statusCode: 502 }, 502);
    }
  }
);

/* ── POST /crypto ─────────────────────────────────────────────────────────── */

withdraw.post("/crypto", withSensitiveRateLimit(),
  zValidator("json", z.object({
    asset: z.string().min(1).max(20).toUpperCase(),
    chainId: z.string().min(1).max(20),
    toAddress: z.string().min(10).max(200),
    amount: z.string().regex(/^\d+(\.\d+)?$/),
    assetPin: z.string().length(6).regex(/^\d+$/),
    memo: z.string().max(100).optional(),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { asset, chainId, toAddress, amount, assetPin, memo } = c.req.valid("json");
    const db = getDb();

    const userRow = await findUserByUid(uid);
    if (!userRow?.asset_pin_hash) return c.json({ success: false, error: "Asset PIN not set. Please set one in Settings.", statusCode: 400 }, 400);
    const pinValid = await bcrypt.compare(assetPin, userRow.asset_pin_hash);
    if (!pinValid) return c.json({ success: false, error: "Incorrect asset PIN", statusCode: 400 }, 400);

    const { withdrawFrozen } = await checkFreeze(asset, chainId);
    if (withdrawFrozen) return c.json({ success: false, error: `Withdrawals for ${asset} on this network are temporarily suspended.`, statusCode: 400 }, 400);

    const { flat: feeFlat, pct: feePct, minWithdraw } = await getChainFee(chainId, asset);
    const totalFee = new Big(feeFlat).plus(new Big(amount).times(feePct)).toFixed(18);
    const netAmount = new Big(amount).minus(totalFee).toFixed(18);

    if (parseFloat(netAmount) <= 0) return c.json({ success: false, error: `Amount is too small after fees. Fee: ${totalFee} ${asset}.`, statusCode: 400 }, 400);
    if (parseFloat(amount) < parseFloat(minWithdraw)) return c.json({ success: false, error: `Minimum withdrawal: ${minWithdraw} ${asset}.`, statusCode: 400 }, 400);

    const grossWithFee = new Big(amount).plus(totalFee).toFixed(18);
    const balance = await getBalance(uid, asset, "funding");
    if (lt(balance, grossWithFee)) return c.json({ success: false, error: `Insufficient ${asset} balance. Need ${grossWithFee} ${asset} (amount + fee).`, statusCode: 400 }, 400);

    let chainName = chainId;
    if (/^\d+$/.test(chainId)) {
      const { CHAINS } = await import("@/server/services/blockchain");
      chainName = CHAINS[parseInt(chainId)]?.name ?? chainId;
    } else {
      const { data: nc } = await db.from("non_evm_chains").select("name").eq("id", chainId).maybeSingle();
      chainName = nc?.name ?? chainId;
    }

    const usdEquivalent = await getUsdEquivalent(asset, amount);
    const thresholdUsd = parseFloat(await getConfig("large_withdrawal_threshold_usd", "500"));
    const requiresAdminApproval = usdEquivalent >= thresholdUsd;

    await upsertBalance(uid, asset, subtract(balance, grossWithFee), "funding");

    const { data: qe, error: ie } = await db.from("withdrawal_queue")
      .insert({
        uid, asset_symbol: asset, chain_id: chainId, chain_name: chainName,
        gross_amount: amount, fee_amount: totalFee, net_amount: netAmount,
        fee_asset: asset, usd_equivalent: usdEquivalent.toFixed(2),
        to_address: toAddress, memo: memo ?? null,
        status: requiresAdminApproval ? "awaiting_admin" : "pending_cancel",
        cancel_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      .select().single();

    if (ie || !qe) { await upsertBalance(uid, asset, balance, "funding"); return c.json({ success: false, error: "Failed to submit withdrawal.", statusCode: 500 }, 500); }

    await createLedgerEntry({ uid, asset, amount: `-${amount}`, type: "withdrawal", reference_id: qe.id, note: `Withdrawal: ${amount} ${asset} → ${toAddress} on ${chainName}` });

    const message = requiresAdminApproval
      ? "Processing — large withdrawals are verified for security. This typically takes up to 24 hours."
      : "Withdrawal queued. You have 10 minutes to cancel.";

    return c.json({ success: true, data: { queueId: qe.id, status: qe.status, amount, fee: totalFee, netAmount, cancelExpiresAt: qe.cancel_expires_at, requiresAdminApproval, message } });
  }
);

/* ── POST /cancel/:id ─────────────────────────────────────────────────────── */

withdraw.post("/cancel/:id", withSensitiveRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const { id } = c.req.param();
  const db = getDb();

  const { data: entry } = await db.from("withdrawal_queue").select("*").eq("id", id).eq("uid", uid).maybeSingle();
  if (!entry) return c.json({ success: false, error: "Withdrawal not found", statusCode: 404 }, 404);
  if (entry.status !== "pending_cancel") return c.json({ success: false, error: "This withdrawal can no longer be cancelled.", statusCode: 400 }, 400);
  if (new Date(entry.cancel_expires_at as string) < new Date()) return c.json({ success: false, error: "Cancellation window has expired.", statusCode: 400 }, 400);

  const refundTotal = (parseFloat(entry.gross_amount as string) + parseFloat(entry.fee_amount as string)).toFixed(18);
  const current = await getBalance(uid, entry.asset_symbol as string, "funding");
  await upsertBalance(uid, entry.asset_symbol as string, add(current, refundTotal), "funding");

  await db.from("withdrawal_queue").update({ status: "failed", admin_notes: "Cancelled by user", updated_at: new Date().toISOString(), processed_at: new Date().toISOString() }).eq("id", id);
  await createLedgerEntry({ uid, asset: entry.asset_symbol as string, amount: refundTotal, type: "refund", reference_id: id, note: "Withdrawal cancelled by user" });

  return c.json({ success: true, data: { message: "Withdrawal cancelled. Balance restored." } });
});

/* ── GET /fee ─────────────────────────────────────────────────────────────── */

withdraw.get("/fee", withApiRateLimit(), async (c) => {
  const asset = (c.req.query("asset") ?? "USDT").toUpperCase();
  const chainId = c.req.query("chain") ?? "56";
  const { flat, pct, minWithdraw } = await getChainFee(chainId, asset);
  return c.json({ success: true, data: { asset, chainId, feeFlat: flat, feePct: pct, minWithdraw, feeAsset: asset } });
});

/* ── GET /chains/:asset ───────────────────────────────────────────────────── */

withdraw.get("/chains/:asset", withApiRateLimit(), async (c) => {
  const asset = c.req.param("asset").toUpperCase();
  const db = getDb();
  const [{ data: fees }, { data: freezes }, { data: nonEvmRows }] = await Promise.all([
    db.from("chain_fees").select("*").order("chain_id"),
    db.from("token_chain_freeze").select("chain_id, deposit_frozen, withdraw_frozen").eq("token_symbol", asset),
    db.from("non_evm_chains").select("*").eq("withdraw_enabled", true).order("sort_order"),
  ]);
  const freezeMap = new Map((freezes ?? []).map((f) => [f.chain_id, f]));
  const { CHAINS } = await import("@/server/services/blockchain");

  const evmChains = Object.values(CHAINS).map((ch) => {
    const feeRow = fees?.find((f) => f.chain_id === String(ch.id));
    const fr = freezeMap.get(String(ch.id));
    return { chainId: String(ch.id), name: ch.name, type: "EVM", fee: feeRow?.withdraw_flat?.toString() ?? "0", feePct: feeRow?.withdraw_pct?.toString() ?? "0", minWithdraw: feeRow?.min_withdraw?.toString() ?? "0", arrivalTime: "~5 minutes", frozen: fr?.withdraw_frozen ?? false, hasMemo: false };
  }).filter((ch) => !ch.frozen);

  const nonEvmChains = (nonEvmRows ?? []).map((ch) => {
    const feeRow = fees?.find((f) => f.chain_id === ch.id);
    const fr = freezeMap.get(ch.id);
    return { chainId: ch.id, name: ch.name, type: "non-EVM", fee: feeRow?.withdraw_flat?.toString() ?? "0", feePct: feeRow?.withdraw_pct?.toString() ?? "0", minWithdraw: feeRow?.min_withdraw?.toString() ?? "0", arrivalTime: ch.arrival_time, frozen: fr?.withdraw_frozen ?? false, hasMemo: ["XRP", "TON", "XLM"].includes(ch.id), nativeSymbol: ch.symbol };
  }).filter((ch) => !ch.frozen);

  return c.json({ success: true, data: [...evmChains, ...nonEvmChains] });
});

/* ── GET /limits ──────────────────────────────────────────────────────────── */

withdraw.get("/limits", withApiRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const db = getDb();
  const today = new Date().toISOString().split("T")[0] ?? "";
  const { data: dailyTotal } = await db.rpc("get_daily_withdrawal_total", { p_uid: uid, p_date: today });
  const used = (dailyTotal as number | null) ?? 0;
  const remaining = Math.max(0, parseFloat(DAILY_LIMIT_KES) - used);
  return c.json({ success: true, data: { dailyLimit: DAILY_LIMIT_KES, usedToday: used.toFixed(2), remaining: remaining.toFixed(2), minMpesaWithdrawal: MIN_WITHDRAWAL_KES, mpesaFeePercent: MPESA_FEE_PERCENT } });
});

/* ── GET /queue ───────────────────────────────────────────────────────────── */

withdraw.get("/queue", withApiRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const db = getDb();
  const { data } = await db.from("withdrawal_queue")
    .select("id, asset_symbol, chain_name, gross_amount, fee_amount, net_amount, to_address, status, cancel_expires_at, tx_hash, created_at")
    .eq("uid", uid)
    .in("status", ["pending_cancel", "queued", "broadcasting", "awaiting_admin"])
    .order("created_at", { ascending: false }).limit(20);
  return c.json({ success: true, data: data ?? [] });
});

/* ── GET /history ─────────────────────────────────────────────────────────── */

withdraw.get("/history", withApiRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const page = parseInt(c.req.query("page") ?? "1");
  const db = getDb();
  const [mpesaRes, cryptoRes] = await Promise.all([
    db.from("withdrawals").select("id, type, amount, fee, net_amount, phone, address, network, asset, status, created_at").eq("uid", uid).order("created_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1),
    db.from("withdrawal_queue").select("id, asset_symbol, chain_id, chain_name, gross_amount, fee_amount, net_amount, to_address, status, tx_hash, created_at").eq("uid", uid).order("created_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1),
  ]);
  const mpesa = (mpesaRes.data ?? []).map((w) => ({ id: w.id, type: w.type, asset: w.asset ?? "KES", amount: w.amount, fee: w.fee, netAmount: w.net_amount, destination: w.phone ?? w.address ?? "", chain: w.network ?? "M-Pesa", status: w.status, txHash: null, createdAt: w.created_at }));
  const crypto = (cryptoRes.data ?? []).map((w) => ({ id: w.id, type: "crypto", asset: w.asset_symbol, amount: w.gross_amount, fee: w.fee_amount, netAmount: w.net_amount, destination: w.to_address, chain: w.chain_name, status: w.status, txHash: w.tx_hash, createdAt: w.created_at }));
  const all = [...mpesa, ...crypto].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
  return c.json({ success: true, data: all });
});

/* ── B2C callbacks ────────────────────────────────────────────────────────── */

withdraw.post("/b2c/result", async (c) => {
  const body = await c.req.json().catch(() => null);
  processB2cResult(body).catch((err) => console.error("[B2C]", err));
  return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

withdraw.post("/b2c/timeout", async (c) => {
  // Safaricom timed out waiting for the mobile app response.
  // The withdrawal is already in 'processing' — b2c-recovery.ts will refund
  // it after 30 minutes if the result callback never arrives.
  // We also immediately log the timeout so admin can see it.
  const body = await c.req.json().catch(() => null) as { Body?: { Result?: { ConversationID?: string } } } | null;
  const conversationId = body?.Body?.Result?.ConversationID ?? null;

  if (conversationId) {
    const db = getDb();
    // Mark as timed_out so the recovery job prioritises it over generic "processing"
    await db
      .from("withdrawals")
      .update({ status: "timed_out", updated_at: new Date().toISOString() })
      .eq("b2c_conversation_id", conversationId)
      .eq("status", "processing") // guard: only flip if still processing
      .catch((err) => console.error("[B2C Timeout] DB update failed:", err));

    console.warn("[B2C Timeout] Marked as timed_out:", conversationId);
  } else {
    console.warn("[B2C Timeout] No ConversationID in body:", JSON.stringify(body));
  }

  return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

async function processB2cResult(body: unknown): Promise<void> {
  const data = parseB2cResult(body);
  if (!data) return;
  const db = getDb();
  const { data: wr } = await db.from("withdrawals").select("*").eq("b2c_conversation_id", data.conversationId).maybeSingle();
  if (!wr || !["processing", "timed_out"].includes(wr.status as string)) return;
  if (data.resultCode !== 0) {
    await db.from("withdrawals").update({ status: "failed" }).eq("id", wr.id);
    // Refund the correct asset — wr.asset is the crypto asset, wr.amount is KES
    // For mpesa_usdt: we need to re-derive asset cost from ledger entry
    const refundAsset = (wr.asset as string | null) ?? "KES";
    const refundAccount = "funding";
    if (refundAsset === "KES") {
      const bal = await getBalance(wr.uid, "KES", refundAccount);
      await upsertBalance(wr.uid, "KES", add(bal, wr.amount as string), refundAccount);
    } else {
      // Re-credit the crypto asset using the ledger entry amount
      const { data: ledger } = await db.from("ledger_entries")
        .select("amount")
        .eq("reference_id", wr.id)
        .eq("type", "withdrawal")
        .maybeSingle();
      if (ledger?.amount) {
        const refundAmt = String(Math.abs(parseFloat(String(ledger.amount))));
        const bal = await getBalance(wr.uid, refundAsset, refundAccount);
        await upsertBalance(wr.uid, refundAsset, add(bal, refundAmt), refundAccount);
      }
    }
    return;
  }
  await db.from("withdrawals").update({ status: "completed", mpesa_ref: data.transactionId, completed_at: new Date().toISOString() }).eq("id", wr.id);
  await Notifications.withdrawalSent(wr.uid, wr.net_amount, "KES", data.transactionId ?? "");
}

export default withdraw;

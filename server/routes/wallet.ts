import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { findUserByUid } from "@/server/db/users";
import { getAllBalances, getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { getDb } from "@/server/db/client";
import { getExchangeRate } from "@/server/services/forex";
import { getBnbBalance, getDepositNetworks } from "@/server/services/blockchain";
import { isMemoChain, getMemoForUser, deriveNonEvmAddress } from "@/server/services/nonEvm";
import { validateAmount, subtract, add } from "@/lib/utils/money";
import type { WalletInfo, Balance } from "@/types";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis/client";

const wallet = new Hono();

wallet.use("*", authMiddleware);
wallet.use("*", withApiRateLimit());

/* ─── GET /info ─────────────────────────────────────────────────────────── */

wallet.get("/info", async (c) => {
  const { uid } = c.get("user");

  const cacheKey = `wallet:info:${uid}`;
  const cached = await redis.get<Record<string, unknown>>(cacheKey).catch(() => null);
  if (cached) {
    return c.json({ success: true, data: cached });
  }

  // Run DB queries and forex in parallel — forex now returns instantly from memory/stale
  const [userRow, balanceRows, rate] = await Promise.all([
    findUserByUid(uid),
    getAllBalances(uid),
    getExchangeRate(),
  ]);

  if (!userRow) {
    return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);
  }

  // BNB balance: serve from cache or "0" — NEVER block the response on an RPC call.
  // Background refresh happens asynchronously after we respond.
  const bnbCacheKey = `bnb:balance:${userRow.deposit_address}`;
  const cachedBnb = await redis.get<string>(bnbCacheKey).catch(() => null);
  const bnbBalance = cachedBnb ?? "0";

  // Fire-and-forget BNB refresh if cache is empty
  if (!cachedBnb) {
    getBnbBalance(userRow.deposit_address)
      .then((bal) => redis.set(bnbCacheKey, bal, { ex: 5 * 60 }).catch(() => undefined))
      .catch(() => undefined);
  }

  const kesBalance  = balanceRows.find((b) => b.asset === "KES"  && b.account === "funding")?.amount ?? "0";
  const usdtBalance = balanceRows.find((b) => b.asset === "USDT" && b.account === "funding")?.amount ?? "0";

  const info: WalletInfo = {
    depositAddress: userRow.deposit_address,
    bnbBalance,
    kesBalance,
    usdtBalance,
    kycStatus: userRow.kyc_status,
  };

  const response = { ...info, rate };
  // Cache 10s — short enough to stay fresh, long enough to absorb repeated page loads
  await redis.set(cacheKey, response, { ex: 10 }).catch(() => undefined);

  return c.json({ success: true, data: response });
});

/* ─── GET /balances ─────────────────────────────────────────────────────── */

wallet.get("/balances", async (c) => {
  const { uid } = c.get("user");
  const rows = await getAllBalances(uid);

  const balances: Balance[] = rows.map((r) => ({
    asset: r.asset,
    amount: r.amount,
    updatedAt: r.updated_at,
  }));

  return c.json({ success: true, data: balances });
});

/* ─── GET /rate ─────────────────────────────────────────────────────────── */

wallet.get("/rate", async (c) => {
  const rate = await getExchangeRate();
  return c.json({ success: true, data: rate });
});

/* ─── POST /transfer — move between funding/trading/earn ────────────────── */

wallet.post(
  "/transfer",
  zValidator(
    "json",
    z.object({
      from: z.enum(["funding", "trading", "earn"]),
      to: z.enum(["funding", "trading", "earn"]),
      asset: z.string().min(1),
      amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount"),
    })
  ),
  async (c) => {
    const { uid } = c.get("user");
    const { from, to, asset, amount } = c.req.valid("json");

    if (from === to) {
      return c.json(
        { success: false, error: "Source and destination cannot be the same", statusCode: 400 },
        400
      );
    }

    const fromBalance = await getBalance(uid, asset, from);

    const { valid, error } = validateAmount(amount, "0.000001", fromBalance, fromBalance);
    if (!valid) {
      return c.json({ success: false, error: error ?? "Invalid amount", statusCode: 400 }, 400);
    }

    // Deduct from source
    const newFromBalance = subtract(fromBalance, amount);
    await upsertBalance(uid, asset, newFromBalance, from);

    // Add to destination
    const toBalance = await getBalance(uid, asset, to);
    const newToBalance = add(toBalance, amount);
    await upsertBalance(uid, asset, newToBalance, to);

    // Ledger entry
    await createLedgerEntry({
      uid,
      asset,
      amount: "0", // transfer is internal — net zero
      type: "transfer",
      note: `Transfer ${amount} ${asset} from ${from} to ${to}`,
    });

    return c.json({
      success: true,
      data: {
        message: "Transfer complete",
        from: { account: from, asset, newBalance: newFromBalance },
        to: { account: to, asset, newBalance: newToBalance },
      },
    });
  }
);


/* ─── POST /transfer-to-user — send asset to another KryptoKe user ──────── */

wallet.post(
  "/transfer-to-user",
  withSensitiveRateLimit(),
  zValidator("json", z.object({
    recipientIdentifier: z.string().min(1), // UID or email
    asset: z.string().min(1).max(20),
    amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount"),
    assetPin: z.string().length(6).regex(/^\d+$/),
    note: z.string().max(100).optional(),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { recipientIdentifier, asset, amount, assetPin, note } = c.req.valid("json");
    const db = getDb();

    // ── PIN check ────────────────────────────────────────────────────────────
    const sender = await findUserByUid(uid);
    if (!sender?.asset_pin_hash) {
      return c.json({ success: false, error: "Asset PIN not set. Set one in Settings → Security.", statusCode: 400 }, 400);
    }
    const pinValid = await bcrypt.compare(assetPin, sender.asset_pin_hash);
    if (!pinValid) return c.json({ success: false, error: "Incorrect asset PIN.", statusCode: 400 }, 400);

    // ── Find recipient ────────────────────────────────────────────────────────
    const isEmail = recipientIdentifier.includes("@");
    const { data: recipient } = await db.from("users")
      .select("uid, display_name, email")
      .eq(isEmail ? "email" : "uid", recipientIdentifier.toLowerCase().trim())
      .neq("uid", uid) // cannot send to self
      .maybeSingle();

    if (!recipient) {
      return c.json({ success: false, error: "Recipient not found. Check the UID or email.", statusCode: 404 }, 404);
    }

    // ── Balance check ─────────────────────────────────────────────────────────
    const senderBalance = await getBalance(uid, asset, "funding");
    const { valid, error: amtErr } = validateAmount(amount, "0.000001", senderBalance, senderBalance);
    if (!valid) return c.json({ success: false, error: amtErr ?? "Invalid amount", statusCode: 400 }, 400);

    // ── Atomic transfer ───────────────────────────────────────────────────────
    const newSenderBal = subtract(senderBalance, amount);
    await upsertBalance(uid, asset, newSenderBal, "funding");

    const recipientBal = await getBalance(recipient.uid, asset, "funding");
    await upsertBalance(recipient.uid, asset, add(recipientBal, amount), "funding");

    const transferNote = note?.trim() || `P2P transfer to ${recipient.display_name ?? recipient.uid}`;

    await Promise.all([
      createLedgerEntry({ uid, asset, amount: `-${amount}`, type: "transfer", note: transferNote }),
      createLedgerEntry({ uid: recipient.uid, asset, amount, type: "transfer",
        note: `P2P transfer from ${sender.display_name ?? uid}${note ? `: ${note}` : ""}` }),
    ]);

    return c.json({
      success: true,
      data: {
        recipient: { displayName: recipient.display_name ?? "KryptoKe User", uid: recipient.uid },
        asset,
        amount,
        newBalance: newSenderBal,
        message: `${amount} ${asset} sent to ${recipient.display_name ?? recipient.uid}`,
      },
    });
  }
);


/* ─── GET /history — transaction ledger for the user ────────────────────── */

wallet.get("/history", async (c) => {
  const { uid } = c.get("user");
  const db = getDb();
  const page   = parseInt(c.req.query("page")  ?? "1");
  const limit  = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);
  const offset = (page - 1) * limit;
  const type   = c.req.query("type"); // optional filter

  let query = db
    .from("ledger_entries")
    .select("id, asset, amount, type, note, reference_id, created_at", { count: "exact" })
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) query = query.eq("type", type);

  const { data, count, error } = await query;
  if (error) return c.json({ success: false, error: "Failed to load history", statusCode: 500 }, 500);

  return c.json({
    success: true,
    data: {
      transactions: data ?? [],
      total: count ?? 0,
      page,
      limit,
      hasMore: (count ?? 0) > offset + limit,
    },
  });
});

export default wallet;

/* ─── GET /deposit/networks/:asset ─────────────────────────────────────── */
// Returns all supported deposit networks for a given asset across all chains

wallet.get("/deposit/networks/:asset", async (c) => {
  const { asset } = c.req.param();
  
  const networks = getDepositNetworks(asset.toUpperCase());
  return c.json({ success: true, data: networks });
});

/* ─── GET /deposit/address/:chain ────────────────────────────────────────────
 * Returns the user's deposit address for a given chain.
 * For EVM chains: always the same HD-derived EVM address.
 * For non-EVM chains: derived lazily on first request and cached in DB.
 * For memo-based chains (XRP, TON, XLM): returns hot wallet address + memo.
 */

wallet.get("/deposit/address/:chain", authMiddleware, withApiRateLimit(), async (c) => {
  const { uid } = c.get("user");
  const chainId = c.req.param("chain").toUpperCase();
  const db = getDb();

  // ── EVM chains — use existing deposit_address from users table ───────────
  if (/^\d+$/.test(chainId)) {
    const userRow = await findUserByUid(uid);
    if (!userRow) return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);

    // Check freeze
    const { data: freeze } = await db
      .from("token_chain_freeze")
      .select("deposit_frozen")
      .eq("token_symbol", "USDT")
      .eq("chain_id", chainId)
      .maybeSingle();

    if (freeze?.deposit_frozen) {
      return c.json({ success: false, error: "Deposits on this network are temporarily suspended.", statusCode: 400 }, 400);
    }

    return c.json({
      success: true,
      data: {
        chainId,
        address: userRow.deposit_address,
        memo: null,
        isMemoChain: false,
      },
    });
  }

  // ── Non-EVM chains ────────────────────────────────────────────────────────
  
  type NonEvmChainId = import("@/server/services/nonEvm").NonEvmChainId;
  const validNonEvmChains: NonEvmChainId[] = ["TRON","BTC","LTC","DOGE","BCH","SOL","XRP","TON","XLM","NEAR","FIL"];

  if (!validNonEvmChains.includes(chainId as NonEvmChainId)) {
    return c.json({ success: false, error: `Chain ${chainId} is not yet supported.`, statusCode: 400 }, 400);
  }

  // Check chain is enabled
  const { data: chainConfig } = await db
    .from("non_evm_chains")
    .select("deposit_enabled, name")
    .eq("id", chainId)
    .maybeSingle();

  if (!chainConfig?.deposit_enabled) {
    return c.json({ success: false, error: "Deposits on this chain are temporarily suspended.", statusCode: 400 }, 400);
  }

  // Check token freeze
  const assetForChain = chainId; // native coin symbol matches chain id for non-EVM
  const { data: freeze } = await db
    .from("token_chain_freeze")
    .select("deposit_frozen")
    .eq("token_symbol", assetForChain)
    .eq("chain_id", chainId)
    .maybeSingle();

  if (freeze?.deposit_frozen) {
    return c.json({ success: false, error: "Deposits on this network are temporarily suspended.", statusCode: 400 }, 400);
  }

  // For memo-based chains: return hot wallet address + user memo
  if (isMemoChain(chainId)) {
    const hotWalletAddrs: Partial<Record<NonEvmChainId, string>> = {
      XRP: process.env.XRP_HOT_WALLET_ADDRESS,
      TON: process.env.TON_HOT_WALLET_ADDRESS,
      XLM: process.env.XLM_HOT_WALLET_ADDRESS,
    };
    const hotAddr = hotWalletAddrs[chainId as NonEvmChainId];
    if (!hotAddr) {
      return c.json({ success: false, error: `${chainId} deposit address not configured. Contact support.`, statusCode: 503 }, 503);
    }
    const memo = getMemoForUser(chainId as NonEvmChainId, uid);
    return c.json({ success: true, data: { chainId, address: hotAddr, memo, isMemoChain: true } });
  }

  // Check if we already have a stored address for this user + chain
  const { data: existing } = await db
    .from("user_chain_addresses")
    .select("address, memo")
    .eq("uid", uid)
    .eq("chain", chainId)
    .maybeSingle();

  if (existing) {
    return c.json({ success: true, data: { chainId, address: existing.address, memo: existing.memo ?? null, isMemoChain: false } });
  }

  // Derive address lazily
  const userRow = await findUserByUid(uid);
  if (!userRow) return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);

  try {
    const address = await deriveNonEvmAddress(chainId as NonEvmChainId, userRow.hd_index);

    // Store for future requests
    await db.from("user_chain_addresses").upsert(
      { uid, chain: chainId, address, memo: null, created_at: new Date().toISOString() },
      { onConflict: "uid,chain" }
    );

    return c.json({ success: true, data: { chainId, address, memo: null, isMemoChain: false } });
  } catch (err) {
    console.error(`[deposit/address] derivation failed for ${chainId}:`, err);
    return c.json({ success: false, error: `Could not generate ${chainId} address. Please try again.`, statusCode: 500 }, 500);
  }
});

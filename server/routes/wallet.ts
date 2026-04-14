import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "@/server/middleware/auth";
import { withApiRateLimit, withSensitiveRateLimit } from "@/server/middleware/ratelimit";
import { findUserByUid } from "@/server/db/users";
import { getAllBalances, getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { getDb } from "@/server/db/client";
import { getExchangeRate } from "@/server/services/forex";
import { getBnbBalance } from "@/server/services/blockchain";
import { validateAmount, subtract, add } from "@/lib/utils/money";
import type { WalletInfo, Balance } from "@/types";
import bcrypt from "bcryptjs";

const wallet = new Hono();

wallet.use("*", authMiddleware);
wallet.use("*", withApiRateLimit());

/* ─── GET /info ─────────────────────────────────────────────────────────── */

wallet.get("/info", async (c) => {
  const { uid } = c.get("user");

  // Cache the full wallet info response for 5s — this is called on every page load
  const { redis } = await import("@/lib/redis/client");
  const cacheKey = `wallet:info:${uid}`;
  const cached = await redis.get<Record<string, unknown>>(cacheKey).catch(() => null);
  if (cached) {
    return c.json({ success: true, data: cached });
  }

  const [userRow, balanceRows, rate] = await Promise.all([
    findUserByUid(uid),
    getAllBalances(uid),
    getExchangeRate(),
  ]);

  if (!userRow) {
    return c.json({ success: false, error: "User not found", statusCode: 404 }, 404);
  }

  // BNB balance cached 60s — RPC call is slow, not critical to be real-time
  const bnbCacheKey = `bnb:balance:${userRow.deposit_address}`;
  const cachedBnb = await redis.get<string>(bnbCacheKey).catch(() => null);
  const bnbBalance = cachedBnb != null
    ? String(cachedBnb)
    : await getBnbBalance(userRow.deposit_address)
        .then(async (bal) => {
          await redis.set(bnbCacheKey, bal, { ex: 60 }).catch(() => undefined);
          return bal;
        })
        .catch(() => "0");

  const kesBalance = balanceRows.find(
    (b) => b.asset === "KES" && b.account === "funding"
  )?.amount ?? "0";

  const usdtBalance = balanceRows.find(
    (b) => b.asset === "USDT" && b.account === "funding"
  )?.amount ?? "0";

  const kkeBalance = balanceRows.find(
    (b) => b.asset === "KKE" && b.account === "funding"
  )?.amount ?? "0";

  // All account balances grouped: { funding: { USDT: "x", KES: "y" }, trading: { USDT: "z" }, earn: { USDT: "q" } }
  const accountBalances: Record<string, Record<string, string>> = {};
  for (const b of balanceRows) {
    if (!accountBalances[b.account]) accountBalances[b.account] = {};
    accountBalances[b.account]![b.asset] = b.amount;
  }

  const info: WalletInfo = {
    depositAddress: userRow.deposit_address,
    bnbBalance,
    kesBalance,
    usdtBalance,
    kkeBalance,
    kycStatus: userRow.kyc_status,
  };

  const response = {
    ...info,
    rate,
    accountBalances,
    fundPasswordSet: !!(userRow.asset_pin_hash),
    suspendedUntil: userRow.suspended_until ?? null,
    suspensionReason: userRow.suspension_reason ?? null,
  };
  // Cache for 5s — invalidated on deposit/withdrawal
  await redis.set(cacheKey, response, { ex: 5 }).catch(() => undefined);

  return c.json({ success: true, data: response });
});

/* ─── GET /balances ─────────────────────────────────────────────────────── */

wallet.get("/balances", async (c) => {
  const { uid } = c.get("user");
  const rows = await getAllBalances(uid);

  const balances: Balance[] = rows.map((r) => ({
    asset: r.asset,
    amount: r.amount,
    account: r.account as "funding" | "trading" | "earn",
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
    const { redis } = await import("@/lib/redis/client");

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

    // ── Acquire per-user advisory lock to prevent double-spend race condition ─
    // Both sender and recipient locks acquired in consistent order (sorted by uid)
    // to avoid deadlock.
    const lockKeys = [uid, recipient.uid].sort().map((id) => `transfer_lock:${id}`);
    const lockTtl = 10; // seconds

    // Attempt to acquire both locks atomically via SET NX
    const [lock1, lock2] = await Promise.all(
      lockKeys.map((k) => redis.set(k, "1", { nx: true, ex: lockTtl }))
    );

    if (!lock1 || !lock2) {
      // Release any lock we did acquire
      await Promise.all(
        lockKeys.map((k) => redis.del(k).catch(() => undefined))
      );
      return c.json({
        success: false,
        error: "Another transfer is in progress. Please wait a moment and try again.",
        statusCode: 429,
      }, 429);
    }

    try {
      // ── Balance check (inside lock) ─────────────────────────────────────────
      const senderBalance = await getBalance(uid, asset, "funding");
      const { valid, error: amtErr } = validateAmount(amount, "0.000001", senderBalance, senderBalance);
      if (!valid) return c.json({ success: false, error: amtErr ?? "Invalid amount", statusCode: 400 }, 400);

      // ── Debit sender ────────────────────────────────────────────────────────
      const newSenderBal = subtract(senderBalance, amount);
      await upsertBalance(uid, asset, newSenderBal, "funding");

      // ── Credit recipient ────────────────────────────────────────────────────
      const recipientBal = await getBalance(recipient.uid, asset, "funding");
      const newRecipientBal = add(recipientBal, amount);
      await upsertBalance(recipient.uid, asset, newRecipientBal, "funding");

      const transferNote = note?.trim() || `P2P transfer to ${recipient.display_name ?? recipient.uid}`;

      // ── Ledger entries ──────────────────────────────────────────────────────
      await Promise.all([
        createLedgerEntry({ uid, asset, amount: `-${amount}`, type: "transfer", note: transferNote }),
        createLedgerEntry({
          uid: recipient.uid, asset, amount, type: "transfer",
          note: `P2P transfer from ${sender.display_name ?? uid}${note ? `: ${note}` : ""}`,
        }),
      ]);

      // ── Bust wallet info cache for both parties ──────────────────────────────
      await Promise.all([
        redis.del(`wallet:info:${uid}`).catch(() => undefined),
        redis.del(`wallet:info:${recipient.uid}`).catch(() => undefined),
      ]);

      // ── In-app notification for recipient (fire-and-forget) ─────────────────
      (async () => {
        try {
          await db.from("notifications").insert({
            uid: recipient.uid,
            type: "transfer_received",
            title: "Transfer received",
            body: `You received ${amount} ${asset} from ${sender.display_name ?? "a KryptoKe user"}${note ? `: "${note}"` : ""}`,
            read: false,
            created_at: new Date().toISOString(),
          });
        } catch {
          // Non-fatal — transfer already completed
        }
      })();

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
    } finally {
      // Always release locks
      await Promise.all(lockKeys.map((k) => redis.del(k).catch(() => undefined)));
    }
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

/* ─── POST /dex-swap — Internal DEX swap using PancakeSwap rate ─────────── */

wallet.post(
  "/dex-swap",
  withSensitiveRateLimit(),
  zValidator("json", z.object({
    fromToken: z.string().min(1).max(20),
    toToken:   z.string().min(1).max(20),
    amountIn:  z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount"),
    slippage:  z.number().min(0.01).max(50).default(0.5),
    assetPin:  z.string().optional(),
  })),
  async (c) => {
    const { uid } = c.get("user");
    const { fromToken, toToken, amountIn, slippage, assetPin } = c.req.valid("json");

    // Verify asset PIN if user has one set
    const userRow = await findUserByUid(uid);
    if (userRow?.asset_pin_hash) {
      if (!assetPin) {
        return c.json({ success: false, error: "Asset PIN required", statusCode: 400 }, 400);
      }
      const pinOk = await bcrypt.compare(assetPin, userRow.asset_pin_hash);
      if (!pinOk) {
        return c.json({ success: false, error: "Incorrect asset PIN", statusCode: 400 }, 400);
      }
    }

    // ── Get prices from PancakeSwap V2 API ────────────────────────────────
    // Tokens we support mapped to their BSC addresses
    const BSC_ADDRESSES: Record<string, string> = {
      USDT:  "0x55d398326f99059fF775485246999027B3197955",
      USDC:  "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      BTC:   "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
      ETH:   "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      BNB:   "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      CAKE:  "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
      SOL:   "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
      XRP:   "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
      KKE:   "INTERNAL",
    };

    async function getPcsUsdPrice(symbol: string): Promise<number> {
      if (symbol === "USDT" || symbol === "USDC") return 1;
      if (symbol === "KKE") return 0.001; // internal placeholder price
      const addr = BSC_ADDRESSES[symbol];
      if (!addr || addr === "INTERNAL") return 0;
      try {
        const res = await fetch(`https://api.pancakeswap.info/api/v2/tokens/${addr}`, {
          headers: { "User-Agent": "KryptoKe/1.0" },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error("PCS API error");
        const data = await res.json() as { data?: { price?: string } };
        return parseFloat(data.data?.price ?? "0") || 0;
      } catch {
        return 0;
      }
    }

    const [fromUsd, toUsd] = await Promise.all([
      getPcsUsdPrice(fromToken),
      getPcsUsdPrice(toToken),
    ]);

    if (fromUsd <= 0 || toUsd <= 0) {
      return c.json({
        success: false,
        error: `Price unavailable for ${fromUsd <= 0 ? fromToken : toToken}. Try again.`,
        statusCode: 400,
      }, 400);
    }

    const spread = 0.005; // 0.5% platform spread
    const effectiveFromUsd = fromUsd * (1 - spread);
    const amountOut = ((parseFloat(amountIn) * effectiveFromUsd) / toUsd).toFixed(8);
    const minOut = (parseFloat(amountOut) * (1 - slippage / 100)).toFixed(8);
    const priceImpact = parseFloat(amountIn) * fromUsd > 10000 ? "0.15"
      : parseFloat(amountIn) * fromUsd > 1000 ? "0.05" : "0.01";

    // ── Check & deduct from balance ───────────────────────────────────────
    const fromBal = await getBalance(uid, fromToken, "funding");
    const { validateAmount: _va, subtract: sub, add: addBal } = await import("@/lib/utils/money");

    if (parseFloat(fromBal) < parseFloat(amountIn)) {
      return c.json({
        success: false,
        error: `Insufficient ${fromToken} balance. Available: ${parseFloat(fromBal).toFixed(6)}`,
        statusCode: 400,
      }, 400);
    }

    const newFromBal = subtract(fromBal, amountIn);
    const toBal      = await getBalance(uid, toToken, "funding");
    const newToBal   = add(toBal, amountOut);

    // Atomic balance update + ledger entries
    await Promise.all([
      upsertBalance(uid, fromToken, newFromBal, "funding"),
      upsertBalance(uid, toToken,   newToBal,   "funding"),
      createLedgerEntry({
        uid,
        type: "trade",
        asset: fromToken,
        amount: `-${amountIn}`,
        account: "funding",
        ref_type: "dex_swap",
        note: `DEX swap ${amountIn} ${fromToken} → ${amountOut} ${toToken}`,
      }),
      createLedgerEntry({
        uid,
        type: "trade",
        asset: toToken,
        amount: amountOut,
        account: "funding",
        ref_type: "dex_swap",
        note: `DEX swap ${amountIn} ${fromToken} → ${amountOut} ${toToken}`,
      }),
    ]);

    // Invalidate wallet cache
    const { redis } = await import("@/lib/redis/client");
    await redis.del(`wallet:info:${uid}`).catch(() => undefined);

    return c.json({
      success: true,
      data: {
        fromToken, toToken,
        amountIn,
        amountOut,
        minOut,
        priceImpact,
        rate: `1 ${fromToken} = ${(effectiveFromUsd / toUsd).toFixed(6)} ${toToken}`,
        source: "PancakeSwap V2 (internal execution)",
      },
    });
  }
);

export default wallet;

/* ─── GET /deposit/networks/:asset ─────────────────────────────────────── */
// Returns all supported deposit networks for a given asset across all chains

wallet.get("/deposit/networks/:asset", async (c) => {
  const { asset } = c.req.param();
  const { getDepositNetworks } = await import("@/server/services/blockchain");
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

  // ── EVM chains — derive deposit address from hd_index ────────────────────
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

    // Use stored deposit_address if available; otherwise derive from hd_index.
    // All EVM chains share the same HD-derived 0x address.
    let depositAddress = userRow.deposit_address as string | null;

    if (!depositAddress && userRow.hd_index != null) {
      const { deriveDepositAddress } = await import("@/server/services/blockchain");
      depositAddress = deriveDepositAddress(userRow.hd_index);
      // Persist for next time
      await db.from("users").update({ deposit_address: depositAddress }).eq("uid", uid);
    }

    if (!depositAddress) {
      return c.json({ success: false, error: "Deposit address not yet assigned. Please contact support.", statusCode: 503 }, 503);
    }

    return c.json({
      success: true,
      data: {
        chainId,
        address: depositAddress,
        memo: null,
        isMemoChain: false,
      },
    });
  }

  // ── Non-EVM chains ────────────────────────────────────────────────────────
  const { isMemoChain, getMemoForUser, deriveNonEvmAddress } = await import("@/server/services/nonEvm");
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

    // XRP uses a numeric DestinationTag (uint32), not a hex string.
    // The scanner matches on parseInt(uid_hex_8, 16) >>> 0.
    // Returning the numeric string here so the UI shows the right value to users.
    let memo: string | null;
    if (chainId === "XRP") {
      const { xrpDestinationTagForUser } = await import("@/server/services/nonEvm");
      memo = String(xrpDestinationTagForUser(uid));
    } else {
      memo = getMemoForUser(chainId as NonEvmChainId, uid);
    }

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

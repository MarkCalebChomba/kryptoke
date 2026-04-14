/**
 * Airdrop Service — NEXUS N-D (Wave 4)
 *
 * Handles all KKE (and any asset) airdrop operations:
 *   - creditKkeWelcomeBonus(uid)  — fires on every new registration
 *   - executeAirdrop(opts)        — admin-initiated bulk airdrop
 *
 * All operations are idempotent: ledger entry with type 'welcome_bonus' or
 * 'airdrop' + reference_id prevents double-credit.
 */

import { getDb } from "@/server/db/client";
import { getBalance, upsertBalance, createLedgerEntry } from "@/server/db/balances";
import { add } from "@/lib/utils/money";
import { awardXp } from "@/server/services/gamify";

/* ─── Welcome bonus ──────────────────────────────────────────────────────── */

/**
 * Credit the KKE welcome bonus to a new user.
 * Amount is read from system_config key 'kke_welcome_bonus' (default 100).
 * Idempotent: checks for existing 'welcome_bonus' ledger entry first.
 */
export async function creditKkeWelcomeBonus(uid: string): Promise<void> {
  const db = getDb();

  // Idempotency check — don't double-credit
  const { data: existing } = await db
    .from("ledger_entries")
    .select("id")
    .eq("uid", uid)
    .eq("type", "welcome_bonus")
    .maybeSingle();

  if (existing) return;

  // Read bonus amount from config (default 100 KKE)
  const { data: configRow } = await db
    .from("system_config")
    .select("value")
    .eq("key", "kke_welcome_bonus")
    .maybeSingle();

  const bonusAmount = (configRow?.value as string) ?? "100";
  if (parseFloat(bonusAmount) <= 0) return;

  // Credit KKE balance
  const current = await getBalance(uid, "KKE", "funding");
  const newBalance = add(current, bonusAmount);
  await upsertBalance(uid, "KKE", newBalance, "funding");

  await createLedgerEntry({
    uid,
    asset: "KKE",
    amount: bonusAmount,
    type: "welcome_bonus",
    note: `Welcome bonus: ${bonusAmount} KKE`,
  });

  // Record in airdrops table
  await db.from("airdrops").insert({
    segment: "welcome_bonus",
    asset: "KKE",
    amount_per_user: bonusAmount,
    recipient_count: 1,
    total_amount: bonusAmount,
    note: `Auto welcome bonus for new user ${uid}`,
    created_by_uid: null,
  }).catch(() => {}); // non-fatal

  // Award XP for receiving welcome bonus
  await awardXp(uid, "welcome_bonus", 50, "welcome_kke").catch(() => {});

  // In-app notification
  await db.from("notifications").insert({
    uid,
    type: "airdrop",
    title: "Welcome to KryptoKe! 🎉",
    body: `You've received ${bonusAmount} KKE as a welcome bonus. Start trading to earn more!`,
    data: { asset: "KKE", amount: bonusAmount, type: "welcome_bonus" },
  }).catch(() => {});
}

/* ─── Admin bulk airdrop ─────────────────────────────────────────────────── */

export type AirdropSegment = "all" | "kyc_verified" | "new_users_7d" | "single";

export interface AirdropOptions {
  asset: string;
  amountPerUser: string;
  segment: AirdropSegment;
  uid?: string;          // required when segment = 'single'
  note: string;
  createdByUid: string;
}

export interface AirdropResult {
  recipientCount: number;
  totalDistributed: string;
  skipped: number;
  errors: number;
}

/**
 * Execute a bulk airdrop.
 * Called from POST /admin/airdrop.
 * Processes recipients in batches of 50 to avoid timeouts.
 */
export async function executeAirdrop(opts: AirdropOptions): Promise<AirdropResult> {
  const db = getDb();
  const { asset, amountPerUser, segment, uid, note, createdByUid } = opts;

  if (parseFloat(amountPerUser) <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  // ── Resolve recipient UIDs ─────────────────────────────────────────────────
  let recipientUids: string[] = [];

  if (segment === "single") {
    if (!uid) throw new Error("uid is required for segment=single");
    recipientUids = [uid];
  } else if (segment === "all") {
    const { data } = await db
      .from("users")
      .select("uid")
      .eq("is_suspended", false)
      .limit(10_000);
    recipientUids = (data ?? []).map((u: { uid: string }) => u.uid);
  } else if (segment === "kyc_verified") {
    const { data } = await db
      .from("users")
      .select("uid")
      .eq("kyc_status", "verified")
      .eq("is_suspended", false)
      .limit(10_000);
    recipientUids = (data ?? []).map((u: { uid: string }) => u.uid);
  } else if (segment === "new_users_7d") {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data } = await db
      .from("users")
      .select("uid")
      .gte("created_at", since)
      .eq("is_suspended", false)
      .limit(10_000);
    recipientUids = (data ?? []).map((u: { uid: string }) => u.uid);
  }

  if (!recipientUids.length) {
    return { recipientCount: 0, totalDistributed: "0", skipped: 0, errors: 0 };
  }

  // ── Process in batches of 50 ───────────────────────────────────────────────
  const BATCH = 50;
  let credited = 0;
  let skipped = 0;
  let errors = 0;
  const airdropId = crypto.randomUUID();

  for (let i = 0; i < recipientUids.length; i += BATCH) {
    const batch = recipientUids.slice(i, i + BATCH);

    await Promise.allSettled(
      batch.map(async (recipientUid) => {
        try {
          // Idempotency: skip if already received this specific airdrop
          const { data: existing } = await db
            .from("ledger_entries")
            .select("id")
            .eq("uid", recipientUid)
            .eq("type", "airdrop")
            .eq("reference_id", airdropId)
            .maybeSingle();

          if (existing) { skipped++; return; }

          const current = await getBalance(recipientUid, asset, "funding");
          await upsertBalance(recipientUid, asset, add(current, amountPerUser), "funding");

          await createLedgerEntry({
            uid: recipientUid,
            asset,
            amount: amountPerUser,
            type: "airdrop",
            reference_id: airdropId,
            note: `Airdrop: ${amountPerUser} ${asset} — ${note}`,
          });

          // In-app notification
          await db.from("notifications").insert({
            uid: recipientUid,
            type: "airdrop",
            title: `You received ${amountPerUser} ${asset}! 🎁`,
            body: note,
            data: { asset, amount: amountPerUser, airdropId },
          }).catch(() => {});

          credited++;
        } catch {
          errors++;
        }
      })
    );
  }

  const totalDistributed = (credited * parseFloat(amountPerUser)).toFixed(18);

  // Record in airdrops table
  await db.from("airdrops").insert({
    segment,
    asset,
    amount_per_user: amountPerUser,
    recipient_count: credited,
    total_amount: totalDistributed,
    note,
    created_by_uid: createdByUid,
  }).catch(() => {});

  return { recipientCount: credited, totalDistributed, skipped, errors };
}

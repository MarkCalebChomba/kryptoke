import { getDb } from "./client";
import type { Database } from "@/lib/supabase/types";

type BalanceRow = Database["public"]["Tables"]["balances"]["Row"];
type LedgerInsert = Database["public"]["Tables"]["ledger_entries"]["Insert"];

export const ASSETS = {
  KES: "KES",
  USDT: "USDT",
  BNB: "BNB",
} as const;

export const ACCOUNTS = {
  FUNDING: "funding",
  TRADING: "trading",
  EARN: "earn",
} as const;

export async function getBalance(
  uid: string,
  asset: string,
  account: "funding" | "trading" | "earn" = "funding"
): Promise<string> {
  const db = getDb();
  const { data } = await db
    .from("balances")
    .select("amount")
    .eq("uid", uid)
    .eq("asset", asset)
    .eq("account", account)
    .single();

  return data?.amount ?? "0";
}

export async function getAllBalances(uid: string): Promise<BalanceRow[]> {
  const db = getDb();
  const { data } = await db
    .from("balances")
    .select("*")
    .eq("uid", uid);

  return data ?? [];
}

export async function upsertBalance(
  uid: string,
  asset: string,
  amount: string,
  account: "funding" | "trading" | "earn" = "funding"
): Promise<void> {
  const db = getDb();
  const { error } = await db.from("balances").upsert(
    {
      uid,
      asset,
      account,
      amount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "uid,asset,account" }
  );

  if (error) {
    throw new Error(`Failed to upsert balance: ${error.message}`);
  }
}

export async function createLedgerEntry(entry: LedgerInsert): Promise<void> {
  const db = getDb();
  const { error } = await db.from("ledger_entries").insert(entry);
  if (error) {
    throw new Error(`Failed to create ledger entry: ${error.message}`);
  }
}

export async function initializeUserBalances(uid: string): Promise<void> {
  const db = getDb();

  const entries = [
    { uid, asset: ASSETS.KES, account: ACCOUNTS.FUNDING, amount: "0" },
    { uid, asset: ASSETS.USDT, account: ACCOUNTS.FUNDING, amount: "0" },
    { uid, asset: ASSETS.USDT, account: ACCOUNTS.TRADING, amount: "0" },
    { uid, asset: ASSETS.USDT, account: ACCOUNTS.EARN, amount: "0" },
  ];

  const { error } = await db.from("balances").upsert(entries, {
    onConflict: "uid,asset,account",
  });

  if (error) {
    throw new Error(`Failed to initialize balances: ${error.message}`);
  }
}

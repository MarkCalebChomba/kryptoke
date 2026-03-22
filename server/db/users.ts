import { getDb } from "./client";
import type { Database } from "@/lib/supabase/types";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const db = getDb();
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .single();
  if (error || !data) return null;
  return data;
}

export async function findUserByUid(uid: string): Promise<UserRow | null> {
  const db = getDb();
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("uid", uid)
    .single();
  if (error || !data) return null;
  return data;
}

export async function findUserByPhone(phone: string): Promise<UserRow | null> {
  const db = getDb();
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("phone", phone)
    .single();
  if (error || !data) return null;
  return data;
}

export async function createUser(input: UserInsert): Promise<UserRow> {
  const db = getDb();
  const { data, error } = await db
    .from("users")
    .insert(input)
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to create user: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

export async function updateUser(uid: string, update: UserUpdate): Promise<UserRow> {
  const db = getDb();
  const { data, error } = await db
    .from("users")
    .update({ ...update, last_active_at: new Date().toISOString() })
    .eq("uid", uid)
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to update user: ${error?.message ?? "unknown error"}`);
  }
  return data;
}

/**
 * Atomically increment hd_counter and return the next 0-based index.
 *
 * Works in three modes so it never hard-fails:
 *  1. SQL RPC function (requires migration 001) — preferred, truly atomic
 *  2. Direct UPDATE on hd_counter table — atomic at row level, works without the function
 *  3. COUNT of existing users — last resort if migrations haven't been run yet
 */
export async function getNextHdIndex(): Promise<number> {
  const db = getDb();

  // Mode 1: try the SQL RPC function
  try {
    const { data: rpcData, error: rpcError } = await db.rpc("increment_hd_counter");
    if (!rpcError && rpcData !== null) {
      return rpcData as number;
    }
  } catch {
    // RPC not available — fall through
  }

  // Mode 2: direct hd_counter table UPDATE (atomic, no function needed)
  try {
    const { data: row, error: readErr } = await db
      .from("hd_counter")
      .select("value")
      .eq("id", 1)
      .single();

    if (!readErr && row) {
      const current = (row as { value: number }).value;
      await db
        .from("hd_counter")
        .update({ value: current + 1 })
        .eq("id", 1);
      return current; // 0-based — return value BEFORE increment
    }
  } catch {
    // hd_counter table doesn't exist — migrations not run
  }

  // Mode 3: count existing users — safe for dev, not for production concurrency
  const { count } = await db
    .from("users")
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

export async function isAdminUser(uid: string): Promise<boolean> {
  const db = getDb();
  const { data, error } = await db
    .from("admin_users")
    .select("uid")
    .eq("uid", uid)
    .single();
  return !error && !!data;
}

export async function touchLastActive(uid: string): Promise<void> {
  const db = getDb();
  await db
    .from("users")
    .update({ last_active_at: new Date().toISOString() })
    .eq("uid", uid);
}

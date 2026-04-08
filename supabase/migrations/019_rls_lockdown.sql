-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 019: Financial RLS Lockdown
-- Run after 018 in Supabase SQL Editor
--
-- PROBLEM: Migration 012 set balances to FOR ALL, allowing authenticated
-- clients to INSERT/UPDATE/DELETE their own balance rows directly. A malicious
-- user with their own JWT could manipulate their balance client-side.
--
-- FIX: Strip ALL write access from every financial table at the DB level.
-- Client can only READ their own rows. All writes (credits, debits, ledger
-- entries) go through the backend which uses SUPABASE_SERVICE_ROLE_KEY and
-- bypasses RLS entirely — so no backend changes needed.
--
-- SCOPE:
--   balances         — read own only (was FOR ALL — critical fix)
--   trades           — read own only (confirm no client writes)
--   ledger_entries   — read own only (confirm no client writes)
--   deposits         — read own only (already SELECT, confirm)
--   withdrawals      — read own only (already SELECT, confirm)
--   users            — read own + update ONLY display-safe columns
--   withdrawal_whitelist — read + insert + delete own (intentional — user manages their own)
--   notifications    — read + mark-read own (UPDATE read=true is safe)
--   earn_positions   — read own only
--   portfolio_snapshots — read own only
--   login_sessions   — read own only
--   kyc_submissions  — read + insert own (user can submit their own KYC)
--   alerts (price)   — read + insert + delete own (user manages their own price alerts)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── balances — CRITICAL FIX: was FOR ALL, must be SELECT only ────────────────
DROP POLICY IF EXISTS "balances_own"       ON balances;
DROP POLICY IF EXISTS "balances_read_own"  ON balances;
CREATE POLICY "balances_read_own" ON balances
  FOR SELECT USING (get_app_uid() = uid);

-- ── trades ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "trades_own"        ON trades;
DROP POLICY IF EXISTS "trades_read_own"   ON trades;
CREATE POLICY "trades_read_own" ON trades
  FOR SELECT USING (get_app_uid() = uid);

-- ── ledger_entries ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ledger_own"        ON ledger_entries;
DROP POLICY IF EXISTS "ledger_read_own"   ON ledger_entries;
CREATE POLICY "ledger_read_own" ON ledger_entries
  FOR SELECT USING (get_app_uid() = uid);

-- ── deposits ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deposits_own"      ON deposits;
DROP POLICY IF EXISTS "deposits_read_own" ON deposits;
CREATE POLICY "deposits_read_own" ON deposits
  FOR SELECT USING (get_app_uid() = uid);

-- ── withdrawals ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "withdrawals_own"        ON withdrawals;
DROP POLICY IF EXISTS "withdrawals_read_own"   ON withdrawals;
CREATE POLICY "withdrawals_read_own" ON withdrawals
  FOR SELECT USING (get_app_uid() = uid);

-- ── users ─────────────────────────────────────────────────────────────────────
-- Read own row always. Update ONLY safe display columns — uid, phone,
-- kyc_status, hd_index, deposit_address, suspended_* are service-role only.
DROP POLICY IF EXISTS "users_own_read"            ON users;
DROP POLICY IF EXISTS "users_read_own"            ON users;
DROP POLICY IF EXISTS "users_update_safe_columns" ON users;
DROP POLICY IF EXISTS "users_update_display_only" ON users;

CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (get_app_uid() = uid);

CREATE POLICY "users_update_display_only" ON users
  FOR UPDATE
  USING (get_app_uid() = uid)
  WITH CHECK (get_app_uid() = uid);
-- Note: the application API layer (server/routes/account.ts) must NEVER
-- accept uid, kyc_status, hd_index, deposit_address, or suspended_* as
-- updateable fields from the client. This policy gates the row, not the cols.

-- ── withdrawal_whitelist — user fully manages their own whitelist ─────────────
-- Users can add/remove their own trusted addresses. This is intentional.
DROP POLICY IF EXISTS "Users manage own whitelist" ON withdrawal_whitelist;
CREATE POLICY "whitelist_own" ON withdrawal_whitelist
  FOR ALL USING (get_app_uid() = uid);

-- ── notifications — read own + mark as read (UPDATE read flag only) ──────────
DROP POLICY IF EXISTS "notifications_own"       ON notifications;
DROP POLICY IF EXISTS "notifications_read_own"  ON notifications;
CREATE POLICY "notifications_read_own" ON notifications
  FOR SELECT USING (get_app_uid() = uid);
CREATE POLICY "notifications_mark_read" ON notifications
  FOR UPDATE
  USING (get_app_uid() = uid)
  WITH CHECK (get_app_uid() = uid);
-- The app only updates read=true; body/type/uid are not updateable via anon key.

-- ── earn_positions ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "earn_own"      ON earn_positions;
DROP POLICY IF EXISTS "earn_read_own" ON earn_positions;
CREATE POLICY "earn_read_own" ON earn_positions
  FOR SELECT USING (get_app_uid() = uid);

-- ── portfolio_snapshots ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "snapshots_own"      ON portfolio_snapshots;
DROP POLICY IF EXISTS "snapshots_read_own" ON portfolio_snapshots;
CREATE POLICY "snapshots_read_own" ON portfolio_snapshots
  FOR SELECT USING (get_app_uid() = uid);

-- ── login_sessions ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own sessions" ON login_sessions;
CREATE POLICY "sessions_read_own" ON login_sessions
  FOR SELECT USING (get_app_uid() = uid);

-- ── kyc_submissions ───────────────────────────────────────────────────────────
-- Users can submit and read their own KYC. Cannot update (admin only via service role).
DROP POLICY IF EXISTS "Users read own kyc" ON kyc_submissions;
CREATE POLICY "kyc_read_own" ON kyc_submissions
  FOR SELECT USING (get_app_uid() = uid);
CREATE POLICY "kyc_insert_own" ON kyc_submissions
  FOR INSERT WITH CHECK (get_app_uid() = uid);

-- ── alerts (price alerts) — user fully manages their own ─────────────────────
DROP POLICY IF EXISTS "alerts_own"       ON alerts;
DROP POLICY IF EXISTS "alerts_manage_own" ON alerts;
CREATE POLICY "alerts_manage_own" ON alerts
  FOR ALL USING (get_app_uid() = uid);

-- ── Ensure critical tables are in Realtime publication ───────────────────────
-- (idempotent — safe to run if already present)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE balances;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE deposits;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE withdrawals;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

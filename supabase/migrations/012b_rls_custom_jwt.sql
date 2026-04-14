-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012: Fix RLS policies for custom JWT authentication
-- Run after 011 in Supabase SQL Editor
--
-- PROBLEM: All existing RLS policies use auth.uid() which reads the `sub` claim
-- from a Supabase Auth JWT. KryptoKe uses a custom JWT with `uid` claim (not `sub`),
-- so auth.uid() always returns NULL — RLS blocks every client-side query.
--
-- FIX:
--   1. Add a helper function get_app_uid() that reads from request.jwt.claims->>'uid'
--      (set automatically by Supabase from the Bearer token) with a fallback to
--      auth.uid() for forward compatibility if we ever migrate to Supabase Auth.
--   2. Drop & recreate all affected RLS policies using get_app_uid().
--   3. The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely —
--      no backend changes needed. Only frontend Realtime / direct anon-key queries
--      are affected by RLS.
--
-- IMPORTANT: For Supabase to verify the custom JWT, the JWT_SECRET in Vercel
-- must match the Supabase project JWT secret (Settings → API → JWT Secret).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: extract uid from custom JWT claims ────────────────────────────────
CREATE OR REPLACE FUNCTION get_app_uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    -- Primary: custom JWT uid claim (set when custom JWT is passed as Bearer token)
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'uid', '')::uuid,
    -- Fallback: Supabase Auth uid (future-proof if we ever switch)
    auth.uid()
  );
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_app_uid() TO anon, authenticated;

-- ── balances ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "balances_own" ON balances;
CREATE POLICY "balances_own" ON balances
  FOR ALL USING (get_app_uid() = uid);

-- ── users ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_read" ON users;
CREATE POLICY "users_own_read" ON users
  FOR SELECT USING (get_app_uid() = uid);

-- ── deposits ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deposits_own" ON deposits;
CREATE POLICY "deposits_own" ON deposits
  FOR SELECT USING (get_app_uid() = uid);

-- ── withdrawals ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "withdrawals_own" ON withdrawals;
CREATE POLICY "withdrawals_own" ON withdrawals
  FOR SELECT USING (get_app_uid() = uid);

-- ── trades ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "trades_own" ON trades;
CREATE POLICY "trades_own" ON trades
  FOR SELECT USING (get_app_uid() = uid);

-- ── earn_positions ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "earn_own" ON earn_positions;
CREATE POLICY "earn_own" ON earn_positions
  FOR SELECT USING (get_app_uid() = uid);

-- ── notifications ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (get_app_uid() = uid);

-- ── alerts ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "alerts_own" ON alerts;
CREATE POLICY "alerts_own" ON alerts
  FOR ALL USING (get_app_uid() = uid);

-- ── ledger_entries ────────────────────────────────────────────────────────────
-- ledger_entries has no policy yet — add one (users can read own entries)
DROP POLICY IF EXISTS "ledger_own" ON ledger_entries;
CREATE POLICY "ledger_own" ON ledger_entries
  FOR SELECT USING (get_app_uid() = uid);

-- ── portfolio_snapshots ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "snapshots_own" ON portfolio_snapshots;
CREATE POLICY "snapshots_own" ON portfolio_snapshots
  FOR SELECT USING (get_app_uid() = uid);

-- ── login_sessions (from 008) ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own sessions" ON login_sessions;
CREATE POLICY "Users read own sessions" ON login_sessions
  FOR SELECT USING (get_app_uid() = uid);

-- ── kyc_submissions (from 008) ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own kyc" ON kyc_submissions;
CREATE POLICY "Users read own kyc" ON kyc_submissions
  FOR SELECT USING (get_app_uid() = uid);

-- ── withdrawal_whitelist (from 008) ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own whitelist" ON withdrawal_whitelist;
CREATE POLICY "Users manage own whitelist" ON withdrawal_whitelist
  FOR ALL USING (get_app_uid() = uid);

-- ── Ensure balances and deposits are in Realtime publication ─────────────────
-- (needed for frontend Realtime subscriptions to work)
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
END $$;

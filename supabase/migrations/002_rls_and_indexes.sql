-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Performance indexes and RLS policies for production
-- Run after 001_initial_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Partial indexes — massive performance gains on filtered queries ──────────

-- Only unread notifications (most common query)
CREATE INDEX IF NOT EXISTS idx_notifications_uid_unread
  ON notifications (uid, created_at DESC)
  WHERE read = false;

-- Only active earn positions
CREATE INDEX IF NOT EXISTS idx_earn_active_uid
  ON earn_positions (uid)
  WHERE status = 'active';

-- Only pending trades (admin dashboard query)
CREATE INDEX IF NOT EXISTS idx_trades_pending_fulfillment
  ON trades (created_at ASC)
  WHERE status = 'pending_fulfillment';

-- Only unresolved anomalies
CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved
  ON anomalies (created_at DESC)
  WHERE resolved = false;

-- Completed deposits only (M-Pesa callback lookup)
CREATE INDEX IF NOT EXISTS idx_deposits_completed_uid
  ON deposits (uid, completed_at DESC)
  WHERE status = 'completed';

-- Ledger entries by type (analytics queries)
CREATE INDEX IF NOT EXISTS idx_ledger_uid_type_date
  ON ledger_entries (uid, type, created_at DESC);

-- ── Composite indexes for join-heavy admin queries ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_trades_uid_status_date
  ON trades (uid, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_uid_type_status
  ON withdrawals (uid, type, status, created_at DESC);

-- ── Full-text search on users (admin search) ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_email_gin
  ON users USING gin(to_tsvector('english', email));

-- ── Feedback stats query ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_feedback_status
  ON feedback (status, created_at DESC)
  WHERE status = 'new';

-- ── Portfolio snapshots covering index ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_snapshots_uid_date_covering
  ON portfolio_snapshots (uid, date DESC)
  INCLUDE (value_usd, value_kes);

-- ── RLS service role bypass assertion ────────────────────────────────────────
-- The service_role bypasses RLS by design in Supabase.
-- These policies only apply to direct client connections using the anon/auth key.
-- All backend code uses the service_role key and is exempt.

-- Public read for events and announcements (no auth needed)
CREATE POLICY "events_public_read" ON events
  FOR SELECT USING (published = true);

CREATE POLICY "announcements_public_read" ON announcements
  FOR SELECT USING (published = true);

-- Tokens are public read
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tokens_public_read" ON tokens
  FOR SELECT USING (true);

-- ── Supabase Realtime — ensure all needed tables are in publication ──────────

DO $$
BEGIN
  -- Add tables that might not have been included in migration 001
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE withdrawals;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE trades;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE anomalies;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE ledger_entries;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ── VACUUM ANALYZE after index creation ──────────────────────────────────────
ANALYZE users;
ANALYZE balances;
ANALYZE ledger_entries;
ANALYZE deposits;
ANALYZE withdrawals;
ANALYZE trades;
ANALYZE notifications;

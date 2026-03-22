-- ─────────────────────────────────────────────────────────────────────────────
-- KryptoKe Initial Schema
-- Run this in the Supabase SQL editor or via supabase db push
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── HD Index counter ──────────────────────────────────────────────────────────
-- Single row table that atomically increments for each new user wallet
CREATE TABLE IF NOT EXISTS hd_counter (
  id      INTEGER PRIMARY KEY DEFAULT 1,
  value   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO hd_counter (id, value) VALUES (1, 0) ON CONFLICT DO NOTHING;

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  uid               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             TEXT NOT NULL UNIQUE,
  phone             TEXT UNIQUE,
  display_name      TEXT,
  avatar_url        TEXT,
  password_hash     TEXT NOT NULL,
  hd_index          INTEGER NOT NULL UNIQUE,
  deposit_address   TEXT NOT NULL UNIQUE,
  kyc_status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (kyc_status IN ('pending','submitted','verified','rejected')),
  asset_pin_hash    TEXT,
  language          TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','sw')),
  data_saver        BOOLEAN NOT NULL DEFAULT false,
  auto_earn         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_deposit_address ON users (deposit_address);

-- ── Admin users ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  uid        UUID PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin'
               CHECK (role IN ('super_admin','admin','support')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Balances ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS balances (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid        UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  asset      TEXT NOT NULL,
  account    TEXT NOT NULL DEFAULT 'funding'
               CHECK (account IN ('funding','trading','earn')),
  amount     NUMERIC(36,18) NOT NULL DEFAULT 0
               CHECK (amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (uid, asset, account)
);

CREATE INDEX IF NOT EXISTS idx_balances_uid ON balances (uid);

-- ── Ledger entries (append-only, immutable) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid          UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  asset        TEXT NOT NULL,
  amount       NUMERIC(36,18) NOT NULL, -- positive = credit, negative = debit
  type         TEXT NOT NULL
                 CHECK (type IN (
                   'deposit','withdrawal','trade','earn','fee',
                   'transfer','admin_adjustment','send','receive'
                 )),
  reference_id UUID,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_uid ON ledger_entries (uid);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_entries (type);

-- ── Deposits ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deposits (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid                   UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  phone                 TEXT NOT NULL,
  amount_kes            NUMERIC(18,2) NOT NULL CHECK (amount_kes > 0),
  usdt_credited         NUMERIC(36,18),
  kes_per_usd           NUMERIC(18,6), -- Bug #3 fix: rate stored at initiation time
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  checkout_request_id   TEXT,
  mpesa_code            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deposits_uid ON deposits (uid);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits (status);
CREATE INDEX IF NOT EXISTS idx_deposits_checkout_request ON deposits (checkout_request_id)
  WHERE checkout_request_id IS NOT NULL;

-- ── Withdrawals ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawals (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid                   UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  type                  TEXT NOT NULL CHECK (type IN ('kes','crypto')),
  amount                NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  fee                   NUMERIC(36,18) NOT NULL DEFAULT 0,
  net_amount            NUMERIC(36,18) NOT NULL,
  phone                 TEXT,
  address               TEXT,
  network               TEXT,
  asset                 TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','completed','failed','refunded')),
  mpesa_ref             TEXT,
  b2c_conversation_id   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bug #4 fix: composite index for daily limit query
CREATE INDEX IF NOT EXISTS idx_withdrawals_uid_created ON withdrawals (uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_b2c_conv ON withdrawals (b2c_conversation_id)
  WHERE b2c_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals (status);

-- ── Trades ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid              UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  token_in         TEXT NOT NULL,
  token_out        TEXT NOT NULL,
  amount_in        NUMERIC(36,18) NOT NULL,
  amount_out       NUMERIC(36,18),
  price            NUMERIC(36,18),
  side             TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type       TEXT NOT NULL DEFAULT 'market'
                     CHECK (order_type IN (
                       'limit','market','tp_sl','trailing_stop','trigger','advanced_limit'
                     )),
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN (
                       'pending','pending_fulfillment','processing','completed','failed','cancelled'
                     )),
  tx_hash          TEXT,
  fulfillment_type TEXT NOT NULL DEFAULT 'manual' CHECK (fulfillment_type IN ('manual','auto')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_uid ON trades (uid);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades (status);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades (created_at DESC);

-- ── Earn positions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS earn_positions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid               UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  asset             TEXT NOT NULL,
  amount            NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  product           TEXT NOT NULL,
  apr               NUMERIC(8,4) NOT NULL,
  start_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date          TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','redeemed','expired')),
  external_id       TEXT,
  accrued_interest  NUMERIC(36,18) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_earn_uid ON earn_positions (uid);
CREATE INDEX IF NOT EXISTS idx_earn_status ON earn_positions (status);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid        UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT false,
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_uid ON notifications (uid);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications (uid, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

-- ── Price alerts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid           UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  token_address TEXT NOT NULL,
  token_symbol  TEXT NOT NULL,
  condition     TEXT NOT NULL CHECK (condition IN ('above','below')),
  price         NUMERIC(36,18) NOT NULL,
  triggered     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_uid ON alerts (uid);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts (triggered) WHERE triggered = false;

-- ── Feedback ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid         UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  user_email  TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Events ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  type        TEXT NOT NULL
                CHECK (type IN ('SPOT','FUTURES','VESTING','MAINTENANCE','LISTING')),
  date        TIMESTAMPTZ NOT NULL,
  badge_color TEXT NOT NULL DEFAULT '#00E5B4',
  published   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_published ON events (date) WHERE published = true;

-- ── Tokens ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tokens (
  address        TEXT PRIMARY KEY,
  symbol         TEXT NOT NULL,
  name           TEXT NOT NULL,
  decimals       INTEGER NOT NULL DEFAULT 18,
  is_native      BOOLEAN NOT NULL DEFAULT false,
  whitelisted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  coingecko_id   TEXT,
  is_new         BOOLEAN NOT NULL DEFAULT true,
  is_seed        BOOLEAN NOT NULL DEFAULT false,
  icon_url       TEXT
);

-- ── Announcements ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','warning','promotion')),
  published  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── System config ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default config values
INSERT INTO system_config (key, value) VALUES
  ('paybill_number', '000000'),
  ('deposit_fee_percent', '0'),
  ('withdrawal_fee_percent', '0.01'),
  ('trading_spread_percent', '0.005'),
  ('daily_withdrawal_limit_kes', '150000'),
  ('min_deposit_kes', '10'),
  ('min_withdrawal_kes', '10'),
  ('maintenance_mode', 'false'),
  ('mpesa_display_name', 'KryptoKe')
ON CONFLICT (key) DO NOTHING;

-- ── Web vitals ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_vitals (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric     TEXT NOT NULL,
  value      NUMERIC NOT NULL,
  route      TEXT NOT NULL,
  uid        UUID REFERENCES users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── API metrics ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_metrics (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route       TEXT NOT NULL,
  method      TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  uid         UUID REFERENCES users(uid) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_metrics_route ON api_metrics (route, created_at DESC);

-- ── Anomalies ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomalies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        TEXT NOT NULL,
  description TEXT NOT NULL,
  uid         UUID REFERENCES users(uid) ON DELETE SET NULL,
  severity    TEXT NOT NULL DEFAULT 'medium'
                CHECK (severity IN ('low','medium','high')),
  resolved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Portfolio snapshots ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid        UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  date       DATE NOT NULL,
  value_usd  NUMERIC(18,6) NOT NULL,
  value_kes  NUMERIC(18,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (uid, date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_uid ON portfolio_snapshots (uid, date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Atomically increment the HD wallet counter and return the new index
CREATE OR REPLACE FUNCTION increment_hd_counter()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_index INTEGER;
BEGIN
  UPDATE hd_counter SET value = value + 1 WHERE id = 1
  RETURNING value INTO new_index;
  RETURN new_index - 1; -- return 0-based index
END;
$$;

-- Get total withdrawals for a user on a given date (for daily limit check)
-- Bug #4 fix: this replaces the broken Firestore composite query
CREATE OR REPLACE FUNCTION get_daily_withdrawal_total(p_uid UUID, p_date DATE)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO total
  FROM withdrawals
  WHERE uid = p_uid
    AND type = 'kes'
    AND status IN ('processing', 'completed')
    AND DATE(created_at AT TIME ZONE 'Africa/Nairobi') = p_date;
  RETURN total;
END;
$$;

-- Balance reconciliation — compares balance table against ledger sum
CREATE OR REPLACE FUNCTION reconcile_balances()
RETURNS TABLE(
  uid UUID,
  asset TEXT,
  balance_amount NUMERIC,
  ledger_sum NUMERIC,
  discrepancy NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.uid,
    b.asset,
    b.amount AS balance_amount,
    COALESCE(SUM(le.amount), 0) AS ledger_sum,
    b.amount - COALESCE(SUM(le.amount), 0) AS discrepancy
  FROM balances b
  LEFT JOIN ledger_entries le ON le.uid = b.uid AND le.asset = b.asset
  GROUP BY b.uid, b.asset, b.amount
  HAVING ABS(b.amount - COALESCE(SUM(le.amount), 0)) > 0.000001;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE earn_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS — backend uses service role key
-- RLS only applies to anon/authenticated Supabase client calls

-- Users can only read their own record via direct Supabase client
CREATE POLICY "users_own_read" ON users
  FOR SELECT USING (auth.uid()::TEXT = uid::TEXT);

-- All other tables follow the same pattern — service role bypasses
CREATE POLICY "balances_own" ON balances
  FOR ALL USING (auth.uid()::TEXT = uid::TEXT);

CREATE POLICY "deposits_own" ON deposits
  FOR SELECT USING (auth.uid()::TEXT = uid::TEXT);

CREATE POLICY "withdrawals_own" ON withdrawals
  FOR SELECT USING (auth.uid()::TEXT = uid::TEXT);

CREATE POLICY "trades_own" ON trades
  FOR SELECT USING (auth.uid()::TEXT = uid::TEXT);

CREATE POLICY "earn_own" ON earn_positions
  FOR SELECT USING (auth.uid()::TEXT = uid::TEXT);

CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (auth.uid()::TEXT = uid::TEXT);

CREATE POLICY "alerts_own" ON alerts
  FOR ALL USING (auth.uid()::TEXT = uid::TEXT);

-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable realtime on tables the frontend subscribes to
ALTER PUBLICATION supabase_realtime ADD TABLE deposits;
ALTER PUBLICATION supabase_realtime ADD TABLE withdrawals;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE balances;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE trades;

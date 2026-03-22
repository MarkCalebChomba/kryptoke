-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: Futures trading + deposit reconciliation log
-- Run in Supabase SQL editor after 006
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Futures positions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS futures_positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid             UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,

  -- Market
  symbol          TEXT NOT NULL,          -- e.g. "BTCUSDT"
  side            TEXT NOT NULL CHECK (side IN ('long', 'short')),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed', 'liquidated')),

  -- Sizing
  leverage        INTEGER NOT NULL DEFAULT 10 CHECK (leverage BETWEEN 1 AND 125),
  margin          NUMERIC(36,8) NOT NULL,       -- collateral posted (USDT)
  notional        NUMERIC(36,8) NOT NULL,       -- margin * leverage
  quantity        NUMERIC(36,8) NOT NULL,       -- coin qty (notional / entry_price)

  -- Prices
  entry_price     NUMERIC(36,8) NOT NULL,
  mark_price      NUMERIC(36,8),               -- latest mark (updated by cron)
  liquidation_price NUMERIC(36,8) NOT NULL,
  take_profit     NUMERIC(36,8),
  stop_loss       NUMERIC(36,8),

  -- P&L (USDT)
  realised_pnl    NUMERIC(36,8) DEFAULT 0,
  funding_paid    NUMERIC(36,8) DEFAULT 0,

  -- Timestamps
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  close_price     NUMERIC(36,8),
  close_reason    TEXT CHECK (close_reason IN ('manual','liquidation','take_profit','stop_loss'))
);

CREATE INDEX IF NOT EXISTS idx_futures_uid_status ON futures_positions (uid, status);
CREATE INDEX IF NOT EXISTS idx_futures_symbol     ON futures_positions (symbol) WHERE status = 'open';

ALTER TABLE futures_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own futures"
  ON futures_positions FOR SELECT USING (uid = (SELECT uid FROM users WHERE id = auth.uid()::uuid LIMIT 1));

CREATE POLICY "Service role manages futures"
  ON futures_positions FOR ALL USING (auth.role() = 'service_role');

-- ── Futures orders (pending limit orders) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS futures_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid             UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('long', 'short')),
  order_type      TEXT NOT NULL CHECK (order_type IN ('market','limit','stop_market','stop_limit')),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','filled','cancelled','rejected')),
  leverage        INTEGER NOT NULL DEFAULT 10,
  margin          NUMERIC(36,8) NOT NULL,
  trigger_price   NUMERIC(36,8),              -- for limit/stop orders
  take_profit     NUMERIC(36,8),
  stop_loss       NUMERIC(36,8),
  filled_price    NUMERIC(36,8),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filled_at       TIMESTAMPTZ,
  position_id     UUID REFERENCES futures_positions(id)
);

ALTER TABLE futures_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own futures_orders"
  ON futures_orders FOR SELECT USING (uid = (SELECT uid FROM users WHERE id = auth.uid()::uuid LIMIT 1));

CREATE POLICY "Service role manages futures_orders"
  ON futures_orders FOR ALL USING (auth.role() = 'service_role');

-- ── Deposit reconciliation log ────────────────────────────────────────────────
-- Every deposit write is logged here so we can detect manipulation or double-credits
CREATE TABLE IF NOT EXISTS deposit_reconciliation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id      UUID NOT NULL REFERENCES deposits(id) ON DELETE CASCADE,
  uid             UUID NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('mpesa_callback', 'admin_credit', 'manual')),
  amount_kes      NUMERIC(18,2) NOT NULL,
  usdt_credited   NUMERIC(36,8) NOT NULL,
  kes_per_usd     TEXT NOT NULL,
  mpesa_code      TEXT,
  balance_before  NUMERIC(36,8) NOT NULL,
  balance_after   NUMERIC(36,8) NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified        BOOLEAN DEFAULT false,      -- set true by reconciliation job
  note            TEXT
);

CREATE INDEX IF NOT EXISTS idx_recon_deposit_id ON deposit_reconciliation (deposit_id);
CREATE INDEX IF NOT EXISTS idx_recon_uid        ON deposit_reconciliation (uid, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_unverified ON deposit_reconciliation (verified) WHERE NOT verified;

ALTER TABLE deposit_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages reconciliation"
  ON deposit_reconciliation FOR ALL USING (auth.role() = 'service_role');

-- Admin can read all
CREATE POLICY "Admins read reconciliation"
  ON deposit_reconciliation FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE uid = auth.uid()::uuid));

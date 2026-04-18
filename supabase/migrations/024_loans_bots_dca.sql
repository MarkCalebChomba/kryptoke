-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 024: Crypto Loans, Trading Bots, DCA Plans
-- Run after 023 in Supabase SQL Editor
-- Creates tables used by server/routes/account.ts
-- ─────────────────────────────────────────────────────────────────────────────

-- ── crypto_loans ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crypto_loans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid               UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  collateral_asset  TEXT NOT NULL,
  collateral_amount NUMERIC(36,18) NOT NULL,
  loan_asset        TEXT NOT NULL DEFAULT 'USDT',
  loan_amount       NUMERIC(36,18) NOT NULL,
  interest_accrued  NUMERIC(36,18) NOT NULL DEFAULT 0,
  daily_rate        NUMERIC(10,8)  NOT NULL,
  max_ltv           NUMERIC(6,4)   NOT NULL,
  liquidation_ltv   NUMERIC(6,4)   NOT NULL,
  current_ltv       NUMERIC(6,4)   NOT NULL,
  duration_days     INTEGER NOT NULL DEFAULT 30,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','repaid','liquidated','overdue')),
  due_at            TIMESTAMPTZ NOT NULL,
  repaid_at         TIMESTAMPTZ,
  liquidated_at     TIMESTAMPTZ,
  liquidation_price NUMERIC(36,8),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_uid_status ON crypto_loans (uid, status);
CREATE INDEX IF NOT EXISTS idx_loans_due_at     ON crypto_loans (due_at) WHERE status = 'active';

ALTER TABLE crypto_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loans_read_own" ON crypto_loans
  FOR SELECT USING (get_app_uid() = uid);

-- ── dca_plans ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dca_plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid              UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  asset            TEXT NOT NULL,
  amount_per_cycle NUMERIC(36,18) NOT NULL,
  frequency        TEXT NOT NULL CHECK (frequency IN ('hourly','daily','weekly','biweekly','monthly')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  total_invested   NUMERIC(36,18) NOT NULL DEFAULT 0,
  total_units      NUMERIC(36,18) NOT NULL DEFAULT 0,
  executions       INTEGER NOT NULL DEFAULT 0,
  last_run_at      TIMESTAMPTZ,
  next_run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dca_uid        ON dca_plans (uid);
CREATE INDEX IF NOT EXISTS idx_dca_next_run   ON dca_plans (next_run_at) WHERE status = 'active';

ALTER TABLE dca_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dca_read_own" ON dca_plans
  FOR SELECT USING (get_app_uid() = uid);

-- ── trading_bots ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trading_bots (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid         UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('grid','dca','rebalance')),
  pair        TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  state       JSONB NOT NULL DEFAULT '{}',    -- runtime state (grid orders, last tick, etc.)
  status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','stopped','error')),
  pnl_usdt    NUMERIC(36,8) NOT NULL DEFAULT 0,
  executions  INTEGER NOT NULL DEFAULT 0,
  last_tick   TIMESTAMPTZ,
  error_msg   TEXT,
  stopped_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bots_uid    ON trading_bots (uid);
CREATE INDEX IF NOT EXISTS idx_bots_status ON trading_bots (status) WHERE status = 'running';

ALTER TABLE trading_bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bots_read_own" ON trading_bots
  FOR SELECT USING (get_app_uid() = uid);

-- ── updated_at triggers ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS crypto_loans_updated_at  ON crypto_loans;
CREATE TRIGGER crypto_loans_updated_at
  BEFORE UPDATE ON crypto_loans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS dca_plans_updated_at ON dca_plans;
CREATE TRIGGER dca_plans_updated_at
  BEFORE UPDATE ON dca_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trading_bots_updated_at ON trading_bots;
CREATE TRIGGER trading_bots_updated_at
  BEFORE UPDATE ON trading_bots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

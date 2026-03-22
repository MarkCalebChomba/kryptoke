-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Withdrawal queue, NEAR/FIL chains, corrected fee defaults
-- Run after 004_multichain_v2.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── User per-chain deposit addresses (lazy-derived, permanent) ────────────────
-- EVM address is already in users.deposit_address
-- This table stores non-EVM chain addresses derived on-demand
CREATE TABLE IF NOT EXISTS user_chain_addresses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid         UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  chain       TEXT NOT NULL,           -- e.g. "BTC", "SOL", "TRON"
  address     TEXT NOT NULL,
  memo        TEXT,                    -- for memo-based chains (XRP/TON/XLM = shared hot wallet)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (uid, chain)
);

CREATE INDEX IF NOT EXISTS user_chain_addresses_uid_idx ON user_chain_addresses(uid);
CREATE INDEX IF NOT EXISTS user_chain_addresses_addr_idx ON user_chain_addresses(address);

-- RLS: users can only see their own addresses
ALTER TABLE user_chain_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uca_select_own ON user_chain_addresses;
CREATE POLICY uca_select_own ON user_chain_addresses
  FOR SELECT USING (uid = auth.uid()::uuid OR current_setting('role', true) = 'service_role');

DROP POLICY IF EXISTS uca_insert_service ON user_chain_addresses;
CREATE POLICY uca_insert_service ON user_chain_addresses
  FOR INSERT WITH CHECK (current_setting('role', true) = 'service_role');

ANALYZE public.user_chain_addresses;


-- ── Withdrawal queue ──────────────────────────────────────────────────────────
-- Holds crypto withdrawals before broadcasting.
-- status flow:
--   pending_cancel  → user can still cancel (within 10 min window)
--   queued          → cancel window expired, waiting to broadcast
--   broadcasting    → tx submitted to chain
--   completed       → tx confirmed
--   failed          → tx failed (balance refunded)
--   awaiting_admin  → above $500 USD equivalent, waiting for admin approval
--   rejected        → admin rejected (balance refunded)

CREATE TABLE IF NOT EXISTS withdrawal_queue (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid               UUID NOT NULL REFERENCES users(uid) ON DELETE RESTRICT,

  -- What is being withdrawn
  asset_symbol      TEXT NOT NULL,            -- "USDT", "BTC", "SOL", etc.
  chain_id          TEXT NOT NULL,            -- "56", "TRON", "BTC", "SOL", etc.
  chain_name        TEXT NOT NULL,

  -- Amounts (all in the asset's native units)
  gross_amount      NUMERIC(36,18) NOT NULL CHECK (gross_amount > 0),
  fee_amount        NUMERIC(36,18) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount        NUMERIC(36,18) NOT NULL CHECK (net_amount > 0),
  fee_asset         TEXT NOT NULL,            -- usually same as asset_symbol

  -- USD equivalent at submission time (for $500 threshold check)
  usd_equivalent    NUMERIC(18,2),

  -- Destination
  to_address        TEXT NOT NULL,
  memo              TEXT,                     -- for XRP/Stellar/TON tag/memo

  -- Status
  status            TEXT NOT NULL DEFAULT 'pending_cancel'
                      CHECK (status IN (
                        'pending_cancel','queued','broadcasting',
                        'completed','failed','awaiting_admin','rejected'
                      )),
  cancel_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),

  -- Outcome
  tx_hash           TEXT,
  block_number      BIGINT,
  admin_uid         TEXT,                     -- who approved/rejected
  admin_notes       TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wq_uid_idx         ON withdrawal_queue(uid);
CREATE INDEX IF NOT EXISTS wq_status_idx      ON withdrawal_queue(status);
CREATE INDEX IF NOT EXISTS wq_expires_idx     ON withdrawal_queue(cancel_expires_at) WHERE status = 'pending_cancel';
CREATE INDEX IF NOT EXISTS wq_admin_pending   ON withdrawal_queue(created_at) WHERE status = 'awaiting_admin';

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_withdrawal_queue_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_wq_updated_at ON withdrawal_queue;
CREATE TRIGGER trg_wq_updated_at
  BEFORE UPDATE ON withdrawal_queue
  FOR EACH ROW EXECUTE FUNCTION update_withdrawal_queue_ts();

-- Enable realtime so frontend can watch withdrawal status
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE withdrawal_queue;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ── Add NEAR and FIL to non_evm_chains ────────────────────────────────────────
INSERT INTO non_evm_chains (id, name, coin_type, symbol, decimals, explorer_url, explorer_tx,
  deposit_enabled, withdraw_enabled, min_deposit, min_withdraw, confirmations, arrival_time, sort_order)
VALUES
  ('NEAR',  'NEAR Protocol',  397, 'NEAR', 24, 'https://nearblocks.io',    '/txns/',   true, true, 0.1,  0.1,  1, '~2 seconds',  10),
  ('FIL',   'Filecoin',       461, 'FIL',  18, 'https://filfox.info/en',   '/message/',true, true, 0.1,  0.1,  1, '~30 seconds', 11)
ON CONFLICT (id) DO NOTHING;

-- ── Fix chain_fees to match 2x Binance rates (correct defaults) ───────────────
-- USDT withdrawal fees (flat, in USDT)
INSERT INTO chain_fees (chain_id, chain_name, withdraw_flat, withdraw_pct, min_withdraw) VALUES
  ('56',    'BNB Smart Chain', 0.30,  0, 1),
  ('1',     'Ethereum',        6.00,  0, 10),
  ('137',   'Polygon',         0.30,  0, 1),
  ('42161', 'Arbitrum One',    0.30,  0, 1),
  ('10',    'Optimism',        0.30,  0, 1),
  ('8453',  'Base',            0.30,  0, 1),
  ('43114', 'Avalanche',       0.30,  0, 1),
  ('TRON',  'TRON',            2.00,  0, 2),
  ('SOL',   'Solana',          0.30,  0, 1),
  ('BTC',   'Bitcoin',         0,     0, 0.0001),
  ('LTC',   'Litecoin',        0,     0, 0.01),
  ('DOGE',  'Dogecoin',        0,     0, 5),
  ('BCH',   'Bitcoin Cash',    0,     0, 0.001),
  ('XRP',   'XRP Ledger',      0,     0, 1),
  ('TON',   'TON',             0,     0, 0.1),
  ('XLM',   'Stellar',         0,     0, 1),
  ('NEAR',  'NEAR Protocol',   0,     0, 0.1),
  ('FIL',   'Filecoin',        0,     0, 0.1)
ON CONFLICT (chain_id) DO UPDATE SET
  chain_name    = EXCLUDED.chain_name,
  withdraw_flat = EXCLUDED.withdraw_flat,
  withdraw_pct  = EXCLUDED.withdraw_pct,
  min_withdraw  = EXCLUDED.min_withdraw,
  updated_at    = NOW();

-- ── Per-chain native coin fees (stored as separate system_config entries) ──────
-- Format: fee_native_{CHAIN} = flat fee in that chain's native coin
INSERT INTO system_config (key, value) VALUES
  ('fee_native_BTC',  '0.0002'),
  ('fee_native_LTC',  '0.002'),
  ('fee_native_DOGE', '2'),
  ('fee_native_BCH',  '0.001'),
  ('fee_native_XRP',  '0.5'),
  ('fee_native_SOL',  '0.01'),
  ('fee_native_TRX',  '2'),
  ('fee_native_TON',  '0.05'),
  ('fee_native_XLM',  '0.02'),
  ('fee_native_NEAR', '0.01'),
  ('fee_native_FIL',  '0.1'),
  -- Admin settings
  ('large_withdrawal_threshold_usd', '500'),
  ('admin_notification_email', ''),
  ('kes_deposit_spread',  '5'),
  ('kes_withdraw_spread', '3'),
  -- Withdrawal queue processor secret
  ('cron_secret', 'change-this-in-production')
ON CONFLICT (key) DO NOTHING;

-- ── Add withdrawal queue approval log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawal_approvals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  withdrawal_id   UUID NOT NULL REFERENCES withdrawal_queue(id),
  admin_uid       UUID NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('approved','rejected')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS: users can only see their own withdrawal_queue entries ─────────────────
ALTER TABLE withdrawal_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wq_select_own ON withdrawal_queue;
CREATE POLICY wq_select_own ON withdrawal_queue
  FOR SELECT USING (uid = auth.uid()::uuid OR current_setting('role', true) = 'service_role');

DROP POLICY IF EXISTS wq_insert_own ON withdrawal_queue;
CREATE POLICY wq_insert_own ON withdrawal_queue
  FOR INSERT WITH CHECK (uid = auth.uid()::uuid OR current_setting('role', true) = 'service_role');

DROP POLICY IF EXISTS wq_update_service ON withdrawal_queue;
CREATE POLICY wq_update_service ON withdrawal_queue
  FOR UPDATE USING (current_setting('role', true) = 'service_role');

ANALYZE public.withdrawal_queue;
ANALYZE public.withdrawal_approvals;

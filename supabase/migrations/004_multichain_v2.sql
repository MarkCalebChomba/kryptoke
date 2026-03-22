-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Full multi-chain v2
-- Adds: non-EVM chain registry, per-chain fees, per-token-per-chain freeze,
--       deposit scanner tracking, KES spread config, crypto deposits table
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Non-EVM chain registry ────────────────────────────────────────────────────
-- Stores config for non-EVM chains (BTC, SOL, TRON, XRP, TON, etc.)
CREATE TABLE IF NOT EXISTS non_evm_chains (
  id              TEXT PRIMARY KEY,          -- e.g. "BTC", "SOL", "TRON"
  name            TEXT NOT NULL,
  coin_type       INTEGER NOT NULL,          -- BIP44 coin type
  symbol          TEXT NOT NULL,             -- native asset symbol
  decimals        INTEGER NOT NULL DEFAULT 8,
  explorer_url    TEXT NOT NULL,
  explorer_tx     TEXT NOT NULL DEFAULT '/tx/',
  rpc_url         TEXT,                      -- optional RPC/API endpoint
  deposit_enabled BOOLEAN NOT NULL DEFAULT true,
  withdraw_enabled BOOLEAN NOT NULL DEFAULT true,
  min_deposit     NUMERIC(36,18) NOT NULL DEFAULT 0,
  min_withdraw    NUMERIC(36,18) NOT NULL DEFAULT 0,
  confirmations   INTEGER NOT NULL DEFAULT 1,
  arrival_time    TEXT NOT NULL DEFAULT '~5 minutes',
  sort_order      INTEGER NOT NULL DEFAULT 99,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the initial non-EVM chains
INSERT INTO non_evm_chains (id, name, coin_type, symbol, decimals, explorer_url, explorer_tx, deposit_enabled, withdraw_enabled, min_deposit, min_withdraw, confirmations, arrival_time, sort_order) VALUES
  ('TRON',  'TRON',       195, 'TRX',  6,  'https://tronscan.org',          '/#/transaction/', true,  true,  1,    1,    19, '~1 minute',   1),
  ('BTC',   'Bitcoin',    0,   'BTC',  8,  'https://blockstream.info',       '/tx/',            true,  true,  0.0001, 0.0001, 3, '~30 minutes', 2),
  ('LTC',   'Litecoin',   2,   'LTC',  8,  'https://ltc.blockscout.com',    '/tx/',            true,  true,  0.01, 0.01, 2, '~5 minutes',  3),
  ('DOGE',  'Dogecoin',   3,   'DOGE', 8,  'https://dogechain.info',        '/tx/',            true,  true,  5,    5,    2, '~5 minutes',  4),
  ('BCH',   'Bitcoin Cash',145,'BCH',  8,  'https://explorer.bitcoin.com/bch','/tx/',           true,  true,  0.001,0.001,2, '~10 minutes', 5),
  ('SOL',   'Solana',     501, 'SOL',  9,  'https://solscan.io',            '/tx/',            true,  true,  0.01, 0.01, 1, '~30 seconds', 6),
  ('XRP',   'XRP Ledger', 144, 'XRP',  6,  'https://xrpscan.com',           '/tx/',            true,  true,  1,    1,    1, '~5 seconds',  7),
  ('TON',   'TON',        607, 'TON',  9,  'https://tonviewer.com',         '/transaction/',  true,  true,  0.1,  0.1,  1, '~5 seconds',  8),
  ('XLM',   'Stellar',    148, 'XLM',  7,  'https://stellarchain.io',       '/tx/',            true,  true,  1,    1,    1, '~5 seconds',  9)
ON CONFLICT (id) DO NOTHING;

-- ── Per-chain fee configuration (both EVM and non-EVM) ───────────────────────
CREATE TABLE IF NOT EXISTS chain_fees (
  chain_id         TEXT PRIMARY KEY,  -- EVM: "56", "1", "137"; non-EVM: "BTC", "SOL"
  chain_name       TEXT NOT NULL,
  withdraw_flat    NUMERIC(18,6) NOT NULL DEFAULT 0,  -- flat fee in USDT
  withdraw_pct     NUMERIC(6,4)  NOT NULL DEFAULT 0,  -- percentage (0.005 = 0.5%)
  min_withdraw     NUMERIC(36,18) NOT NULL DEFAULT 0,
  max_withdraw     NUMERIC(36,18),                    -- NULL = unlimited
  deposit_enabled  BOOLEAN NOT NULL DEFAULT true,
  withdraw_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default chain fees
INSERT INTO chain_fees (chain_id, chain_name, withdraw_flat, withdraw_pct) VALUES
  ('56',    'BNB Smart Chain', 0.50,  0.000),
  ('1',     'Ethereum',        2.00,  0.000),
  ('137',   'Polygon',         0.10,  0.000),
  ('42161', 'Arbitrum',        0.30,  0.000),
  ('10',    'Optimism',        0.30,  0.000),
  ('8453',  'Base',            0.30,  0.000),
  ('43114', 'Avalanche',       0.20,  0.000),
  ('TRON',  'TRON',            1.00,  0.000),
  ('BTC',   'Bitcoin',         2.00,  0.000),
  ('LTC',   'Litecoin',        0.50,  0.000),
  ('DOGE',  'Dogecoin',        1.00,  0.000),
  ('BCH',   'Bitcoin Cash',    0.50,  0.000),
  ('SOL',   'Solana',          0.20,  0.000),
  ('XRP',   'XRP Ledger',      0.20,  0.000),
  ('TON',   'TON',             0.20,  0.000),
  ('XLM',   'Stellar',         0.10,  0.000)
ON CONFLICT (chain_id) DO NOTHING;

-- ── Per-token-per-chain freeze table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_chain_freeze (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_symbol     TEXT NOT NULL,       -- e.g. "USDT", "BTC"
  chain_id         TEXT NOT NULL,       -- EVM chain ID or non-EVM id
  deposit_frozen   BOOLEAN NOT NULL DEFAULT false,
  withdraw_frozen  BOOLEAN NOT NULL DEFAULT false,
  freeze_reason    TEXT,
  frozen_by        TEXT,                -- admin UID
  frozen_at        TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token_symbol, chain_id)
);

CREATE INDEX IF NOT EXISTS token_chain_freeze_lookup
  ON token_chain_freeze(token_symbol, chain_id);

-- ── Crypto deposits table (non-M-Pesa, on-chain deposits) ────────────────────
CREATE TABLE IF NOT EXISTS crypto_deposits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid             UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  chain_id        TEXT NOT NULL,         -- "56", "BTC", "SOL", etc.
  chain_name      TEXT NOT NULL,
  asset_symbol    TEXT NOT NULL,         -- "USDT", "BTC", "SOL"
  asset_address   TEXT,                  -- contract address for EVM tokens, NULL for native
  amount          NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  amount_credited NUMERIC(36,18),        -- after spread applied
  spread_offset   NUMERIC(18,6),         -- KES offset per USD applied at credit time
  tx_hash         TEXT UNIQUE,
  from_address    TEXT,
  to_address      TEXT NOT NULL,         -- the user's deposit address
  block_number    BIGINT,
  confirmations   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirming','completed','failed')),
  credited_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crypto_deposits_uid_idx ON crypto_deposits(uid);
CREATE INDEX IF NOT EXISTS crypto_deposits_tx_hash_idx ON crypto_deposits(tx_hash);
CREATE INDEX IF NOT EXISTS crypto_deposits_status_idx ON crypto_deposits(status);
CREATE INDEX IF NOT EXISTS crypto_deposits_to_address_idx ON crypto_deposits(to_address);

-- ── Deposit scanner state (last scanned block per chain) ─────────────────────
CREATE TABLE IF NOT EXISTS scanner_state (
  chain_id      TEXT PRIMARY KEY,
  last_block    BIGINT NOT NULL DEFAULT 0,
  last_scan_at  TIMESTAMPTZ,
  is_running    BOOLEAN NOT NULL DEFAULT false,
  error_count   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT
);

INSERT INTO scanner_state (chain_id, last_block) VALUES
  ('56', 0), ('1', 0), ('137', 0), ('42161', 0), ('10', 0), ('8453', 0), ('43114', 0),
  ('TRON', 0), ('BTC', 0), ('LTC', 0), ('DOGE', 0), ('BCH', 0),
  ('SOL', 0), ('XRP', 0), ('TON', 0), ('XLM', 0)
ON CONFLICT (chain_id) DO NOTHING;

-- ── KES spread config in system_config ───────────────────────────────────────
INSERT INTO system_config (key, value) VALUES
  ('kes_deposit_spread',   '5'),   -- KES per USD deducted on deposit
  ('kes_withdraw_spread',  '5'),   -- KES per USD added on withdrawal
  ('mpesa_to_crypto_enabled', 'true'),
  ('crypto_to_mpesa_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- ── Add non-EVM deposit address column to users ───────────────────────────────
-- EVM address is already in users.deposit_address
-- For non-EVM chains, we derive from same HD index using chain-specific BIP44
-- No separate column needed — we derive on the fly from hd_index

-- ── Realtime on new tables ────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE crypto_deposits; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ANALYZE public.crypto_deposits;
ANALYZE public.chain_fees;
ANALYZE public.token_chain_freeze;

-- ─────────────────────────────────────────────────────────────────────────────
-- KryptoKe Migration 009 — Tokens table rebuild + exchange pairs
-- IDEMPOTENT — safe to run multiple times, handles partial previous runs
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old/partial tables so we start clean
DROP TABLE IF EXISTS token_exchange_pairs CASCADE;
DROP TABLE IF EXISTS tokens CASCADE;

-- ── Master coin list ──────────────────────────────────────────────────────────
CREATE TABLE tokens (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cmc_id              INTEGER NOT NULL UNIQUE,
  symbol              TEXT NOT NULL,
  name                TEXT NOT NULL,
  logo_url            TEXT NOT NULL,
  cmc_rank            INTEGER NOT NULL,
  description         TEXT,
  whitepaper_url      TEXT,
  website_url         TEXT,
  twitter_url         TEXT,
  telegram_url        TEXT,
  reddit_url          TEXT,
  explorer_urls       TEXT[],
  ath                 NUMERIC(36, 10),
  ath_date            TIMESTAMPTZ,
  atl                 NUMERIC(36, 10),
  atl_date            TIMESTAMPTZ,
  circulating_supply  NUMERIC(36, 4),
  max_supply          NUMERIC(36, 4),
  chain_ids           TEXT[],
  is_depositable      BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tokens_symbol     ON tokens (symbol);
CREATE INDEX idx_tokens_cmc_rank   ON tokens (cmc_rank);
CREATE INDEX idx_tokens_is_active  ON tokens (is_active) WHERE is_active = true;

-- ── Exchange pair mapping ─────────────────────────────────────────────────────
CREATE TABLE token_exchange_pairs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id     UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  exchange     TEXT NOT NULL CHECK (exchange IN ('binance','okx','bybit','bitget')),
  pair_symbol  TEXT NOT NULL,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token_id, exchange)
);

CREATE INDEX idx_tep_token_id  ON token_exchange_pairs (token_id);
CREATE INDEX idx_tep_exchange  ON token_exchange_pairs (exchange);
CREATE INDEX idx_tep_primary   ON token_exchange_pairs (token_id) WHERE is_primary = true;

-- ── Market cache (safe — keeps existing data if table already exists) ─────────
CREATE TABLE IF NOT EXISTS market_cache (
  symbol        TEXT PRIMARY KEY,
  price_usd     NUMERIC(36, 10) NOT NULL DEFAULT 0,
  change_24h    NUMERIC(10, 4)  NOT NULL DEFAULT 0,
  change_1h     NUMERIC(10, 4)  NOT NULL DEFAULT 0,
  volume_24h    NUMERIC(36, 4)  NOT NULL DEFAULT 0,
  high_24h      NUMERIC(36, 10) NOT NULL DEFAULT 0,
  low_24h       NUMERIC(36, 10) NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'coingecko',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_cache_updated ON market_cache (updated_at);

-- ── Fear & greed history ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fear_greed_history (
  date         DATE PRIMARY KEY,
  value        INTEGER NOT NULL CHECK (value BETWEEN 0 AND 100),
  label        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE tokens               ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_exchange_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_cache         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fear_greed_history   ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist from a previous run, then recreate
DROP POLICY IF EXISTS "service_all" ON tokens;
DROP POLICY IF EXISTS "service_all" ON token_exchange_pairs;
DROP POLICY IF EXISTS "service_all" ON market_cache;
DROP POLICY IF EXISTS "service_all" ON fear_greed_history;

CREATE POLICY "service_all" ON tokens               FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON token_exchange_pairs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON market_cache         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON fear_greed_history   FOR ALL TO service_role USING (true) WITH CHECK (true);

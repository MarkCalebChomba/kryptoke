-- ─────────────────────────────────────────────────────────────────────────────
-- KryptoKe Migration 009 — Tokens table rebuild + exchange pairs
-- Run in Supabase SQL editor AFTER backing up existing tokens if needed
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old tokens table and all dependents
DROP TABLE IF EXISTS token_exchange_pairs CASCADE;
DROP TABLE IF EXISTS tokens CASCADE;

-- ── Master coin list (imported once from CoinMarketCap) ───────────────────────
CREATE TABLE tokens (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cmc_id              INTEGER NOT NULL UNIQUE,          -- CoinMarketCap numeric ID
  symbol              TEXT NOT NULL,                    -- e.g. "BTC"
  name                TEXT NOT NULL,                    -- e.g. "Bitcoin"
  logo_url            TEXT NOT NULL,                    -- CMC CDN logo URL
  cmc_rank            INTEGER NOT NULL,                 -- Market cap rank at import time
  description         TEXT,                             -- From CMC metadata
  whitepaper_url      TEXT,
  website_url         TEXT,
  twitter_url         TEXT,
  telegram_url        TEXT,
  reddit_url          TEXT,
  explorer_urls       TEXT[],                           -- Array of block explorer URLs
  ath                 NUMERIC(36, 10),                  -- All-time high in USD
  ath_date            TIMESTAMPTZ,
  atl                 NUMERIC(36, 10),                  -- All-time low in USD
  atl_date            TIMESTAMPTZ,
  circulating_supply  NUMERIC(36, 4),
  max_supply          NUMERIC(36, 4),
  chain_ids           TEXT[],                           -- Supported chain IDs, e.g. ["1","56","TRON"]
  is_depositable      BOOLEAN NOT NULL DEFAULT false,   -- Has wallet infrastructure on KryptoKe
  is_active           BOOLEAN NOT NULL DEFAULT true,    -- False if any critical data missing
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tokens_symbol       ON tokens (symbol);
CREATE INDEX idx_tokens_cmc_rank     ON tokens (cmc_rank);
CREATE INDEX idx_tokens_is_active    ON tokens (is_active) WHERE is_active = true;

-- ── Exchange pair mapping ─────────────────────────────────────────────────────
-- Maps each active token to which exchange carries it and the exact pair symbol
CREATE TABLE token_exchange_pairs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id     UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  exchange     TEXT NOT NULL CHECK (exchange IN ('binance','okx','bybit','bitget')),
  pair_symbol  TEXT NOT NULL,   -- Exchange-specific symbol, e.g. "BTCUSDT" or "BTC-USDT"
  is_primary   BOOLEAN NOT NULL DEFAULT false,  -- Price source priority
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token_id, exchange)
);

CREATE INDEX idx_tep_token_id    ON token_exchange_pairs (token_id);
CREATE INDEX idx_tep_exchange    ON token_exchange_pairs (exchange);
CREATE INDEX idx_tep_primary     ON token_exchange_pairs (token_id) WHERE is_primary = true;

-- ── Pre-computed market data cache table (written by cron, read by API) ───────
-- This avoids a Redis cold start — data survives restarts and is queryable via SQL
CREATE TABLE market_cache (
  symbol        TEXT PRIMARY KEY,
  price_usd     NUMERIC(36, 10) NOT NULL DEFAULT 0,
  change_24h    NUMERIC(10, 4)  NOT NULL DEFAULT 0,   -- percent
  change_1h     NUMERIC(10, 4)  NOT NULL DEFAULT 0,   -- percent
  volume_24h    NUMERIC(36, 4)  NOT NULL DEFAULT 0,   -- USDT volume
  high_24h      NUMERIC(36, 10) NOT NULL DEFAULT 0,
  low_24h       NUMERIC(36, 10) NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'binance',      -- which exchange supplied the price
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_market_cache_updated ON market_cache (updated_at);

-- ── Fear & greed history (30 days, written by cron once per day) ──────────────
CREATE TABLE fear_greed_history (
  date         DATE PRIMARY KEY,
  value        INTEGER NOT NULL CHECK (value BETWEEN 0 AND 100),
  label        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS — service role bypasses, anon has no access ──────────────────────────
ALTER TABLE tokens               ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_exchange_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_cache         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fear_greed_history   ENABLE ROW LEVEL SECURITY;

-- Service role (used by server) can do everything
CREATE POLICY "service_all" ON tokens               FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON token_exchange_pairs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON market_cache         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON fear_greed_history   FOR ALL TO service_role USING (true) WITH CHECK (true);

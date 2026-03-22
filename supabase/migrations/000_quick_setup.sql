-- ─────────────────────────────────────────────────────────────────────────────
-- KryptoKe Quick Setup — run this FIRST if you haven't run 001_initial_schema.sql
-- This creates just enough for registration and login to work.
-- After this, run 001_initial_schema.sql for the full schema.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- HD counter (required for wallet address derivation)
CREATE TABLE IF NOT EXISTS hd_counter (
  id    INTEGER PRIMARY KEY DEFAULT 1,
  value INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO hd_counter (id, value) VALUES (1, 0) ON CONFLICT DO NOTHING;

-- Users table (required for registration)
CREATE TABLE IF NOT EXISTS users (
  uid               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             TEXT NOT NULL UNIQUE,
  phone             TEXT UNIQUE,
  display_name      TEXT,
  avatar_url        TEXT,
  password_hash     TEXT NOT NULL,
  hd_index          INTEGER NOT NULL UNIQUE,
  deposit_address   TEXT NOT NULL UNIQUE,
  kyc_status        TEXT NOT NULL DEFAULT 'pending',
  asset_pin_hash    TEXT,
  language          TEXT NOT NULL DEFAULT 'en',
  data_saver        BOOLEAN NOT NULL DEFAULT false,
  auto_earn         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Balances table (required for registration)
CREATE TABLE IF NOT EXISTS balances (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid        UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  asset      TEXT NOT NULL,
  account    TEXT NOT NULL DEFAULT 'funding',
  amount     NUMERIC(36,18) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (uid, asset, account)
);

-- Admin users table (required for admin dashboard)
CREATE TABLE IF NOT EXISTS admin_users (
  uid        UUID PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atomic HD counter increment function
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
  RETURN new_index - 1;
END;
$$;

-- After this runs, registration and login will work.
-- Run 001_initial_schema.sql for deposits, withdrawals, trades, etc.

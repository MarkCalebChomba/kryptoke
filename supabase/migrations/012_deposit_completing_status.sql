-- Migration 012: Add 'completing' transient status to deposits tables
-- Purpose: Atomic double-credit prevention — processCallback claims a deposit
--          by setting status='completing' before writing the balance. Any concurrent
--          callback or polling handler that tries the same claim gets 0 rows back
--          and aborts. The record is then immediately updated to 'completed'.
--
-- [NEXUS] 2026-04-08

-- Deposits (M-Pesa)
ALTER TABLE deposits
  DROP CONSTRAINT IF EXISTS deposits_status_check;

ALTER TABLE deposits
  ADD CONSTRAINT deposits_status_check
    CHECK (status IN ('pending', 'processing', 'completing', 'completed', 'failed', 'cancelled'));

-- Crypto deposits
ALTER TABLE crypto_deposits
  DROP CONSTRAINT IF EXISTS crypto_deposits_status_check;

-- Re-add with completing (check existing constraint name first — use DO block for safety)
DO $$
BEGIN
  ALTER TABLE crypto_deposits
    ADD CONSTRAINT crypto_deposits_status_check
      CHECK (status IN ('pending', 'detected', 'completing', 'credited', 'failed', 'swept'));
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists, alter it
  ALTER TABLE crypto_deposits DROP CONSTRAINT crypto_deposits_status_check;
  ALTER TABLE crypto_deposits
    ADD CONSTRAINT crypto_deposits_status_check
      CHECK (status IN ('pending', 'detected', 'completing', 'credited', 'failed', 'swept'));
END;
$$;

-- Index: fast lookup of stuck 'completing' deposits for a recovery cron
-- (deposits stuck in 'completing' > 5 minutes indicate a crashed handler)
CREATE INDEX IF NOT EXISTS idx_deposits_completing
  ON deposits (status, updated_at)
  WHERE status = 'completing';

-- Add updated_at to deposits if it doesn't exist (needed for the index above)
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deposits_updated_at ON deposits;
CREATE TRIGGER deposits_updated_at
  BEFORE UPDATE ON deposits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

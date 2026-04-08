-- 014_trades_spot_and_convert.sql
-- Extends trades table for CEX spot order routing + internal convert

-- 1. Add new columns
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS exchange_order_id TEXT,
  ADD COLUMN IF NOT EXISTS exchange_name      TEXT,
  ADD COLUMN IF NOT EXISTS note               TEXT,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Extend status CHECK to include 'executing'
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_status_check;
ALTER TABLE trades
  ADD CONSTRAINT trades_status_check CHECK (
    status IN (
      'pending', 'pending_fulfillment', 'processing',
      'executing', 'completed', 'failed', 'cancelled'
    )
  );

-- 3. Extend fulfillment_type CHECK to include 'exchange' and 'internal'
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_fulfillment_type_check;
ALTER TABLE trades
  ADD CONSTRAINT trades_fulfillment_type_check CHECK (
    fulfillment_type IN ('manual', 'auto', 'exchange', 'internal')
  );

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trades_updated_at ON trades;
CREATE TRIGGER trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Index for exchange order lookups
CREATE INDEX IF NOT EXISTS idx_trades_exchange_order ON trades (exchange_name, exchange_order_id)
  WHERE exchange_order_id IS NOT NULL;

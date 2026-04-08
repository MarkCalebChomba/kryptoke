-- 013_withdrawal_timed_out_and_evm_scanner.sql
-- [NEXUS] 2026-04-08
--
-- 1. Add 'timed_out' to withdrawals status CHECK constraint
--    Allows B2C timeout handler to mark withdrawals immediately,
--    so b2c-recovery.ts picks them up before the 30-min processing threshold.
--
-- 2. Ensure crypto_deposits table has correct structure
--    (chain_id as TEXT to support both numeric EVM chain IDs and string non-EVM IDs)
--
-- 3. Ensure scanner_state table exists for XRP/TON/Stellar ledger position tracking
--
-- 4. Add index on crypto_deposits(tx_hash, chain_id) for fast idempotency checks

-- ── 1. withdrawals status constraint ─────────────────────────────────────────

-- Drop the existing CHECK constraint on withdrawals.status
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'withdrawals'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE withdrawals DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE withdrawals
  ADD CONSTRAINT withdrawals_status_check
  CHECK (status IN (
    'pending', 'processing', 'timed_out', 'completed', 'failed', 'refunded'
  ));

-- ── 2. scanner_state table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scanner_state (
  chain_id     TEXT PRIMARY KEY,
  last_block   BIGINT NOT NULL DEFAULT 0,
  last_scan_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. crypto_deposits — ensure chain_id is TEXT ──────────────────────────────

-- chain_id must accept both '56' (EVM) and 'TRON', 'SOL', etc.
-- If it exists as INTEGER, cast it; otherwise ensure it's TEXT.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crypto_deposits' AND column_name = 'chain_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE crypto_deposits ALTER COLUMN chain_id TYPE TEXT USING chain_id::TEXT;
  END IF;
END $$;

-- ── 4. Indexes ────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS crypto_deposits_tx_hash_chain_id_idx
  ON crypto_deposits (tx_hash, chain_id);

CREATE INDEX IF NOT EXISTS crypto_deposits_uid_status_idx
  ON crypto_deposits (uid, status);

CREATE INDEX IF NOT EXISTS withdrawals_b2c_conversation_id_idx
  ON withdrawals (b2c_conversation_id)
  WHERE b2c_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS withdrawals_status_created_at_idx
  ON withdrawals (status, created_at);

-- ── 5. updated_at trigger on withdrawals ──────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawals_updated_at ON withdrawals;
CREATE TRIGGER withdrawals_updated_at
  BEFORE UPDATE ON withdrawals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

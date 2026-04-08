-- 015_payment_provider_column.sql
-- [NEXUS] 2026-04-08 — N-A: Payment Provider Registry
--
-- Adds provider_id to deposits and withdrawals tables so every transaction
-- is tagged with the payment method used (mpesa, airtel_ke, card_global, etc.).
-- Defaults to 'mpesa' for all existing rows and new rows where not specified.
--
-- The provider_id values come from server/services/paymentProviders.ts

ALTER TABLE deposits
  ADD COLUMN IF NOT EXISTS provider_id TEXT NOT NULL DEFAULT 'mpesa';

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS provider_id TEXT NOT NULL DEFAULT 'mpesa';

-- Indexes for analytics / filtering by provider
CREATE INDEX IF NOT EXISTS deposits_provider_id_idx    ON deposits    (provider_id);
CREATE INDEX IF NOT EXISTS withdrawals_provider_id_idx ON withdrawals (provider_id);

-- Backfill existing rows
UPDATE deposits    SET provider_id = 'mpesa' WHERE provider_id IS NULL;
UPDATE withdrawals SET provider_id = 'mpesa' WHERE provider_id IS NULL;

COMMENT ON COLUMN deposits.provider_id    IS 'Payment provider used. See server/services/paymentProviders.ts for valid IDs.';
COMMENT ON COLUMN withdrawals.provider_id IS 'Payment provider used. See server/services/paymentProviders.ts for valid IDs.';

-- ── Account suspension ───────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_until  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_suspended ON users (suspended_until)
  WHERE suspended_until IS NOT NULL;

-- ── Transaction revocations audit log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_revocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id uuid NOT NULL,
  uid             uuid NOT NULL,
  admin_uid       uuid NOT NULL,
  reason          text NOT NULL,
  amount_reversed text NOT NULL,
  asset           text NOT NULL,
  reversed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tx_revocations_uid  ON transaction_revocations (uid);
CREATE INDEX IF NOT EXISTS tx_revocations_led  ON transaction_revocations (ledger_entry_id);

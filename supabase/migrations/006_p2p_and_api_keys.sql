-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: P2P transfers index + API keys table
-- Run in Supabase SQL editor after 005
-- ─────────────────────────────────────────────────────────────────────────────

-- Index on ledger_entries for fast P2P transfer history lookup
CREATE INDEX IF NOT EXISTS idx_ledger_p2p
  ON ledger_entries (uid, type, created_at DESC)
  WHERE type = 'transfer';

-- ── API Keys table ────────────────────────────────────────────────────────────
-- Allows users to create HMAC-signed API keys for external bots/integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid          UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  name         TEXT NOT NULL,                    -- user-defined label e.g. "My trading bot"
  key_hash     TEXT NOT NULL UNIQUE,             -- SHA-256 hash of the actual key (never stored plain)
  key_prefix   TEXT NOT NULL,                    -- first 8 chars of key shown in UI for identification
  permissions  TEXT[] NOT NULL DEFAULT '{"read"}', -- 'read', 'trade', 'withdraw'
  ip_whitelist TEXT[],                           -- optional IP whitelist, NULL = any IP
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,                      -- NULL = never expires
  revoked      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_uid ON api_keys (uid) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash) WHERE NOT revoked;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own API keys
CREATE POLICY "Users read own api_keys"
  ON api_keys FOR SELECT
  USING (uid = auth.uid()::uuid OR
         uid = (SELECT uid FROM users WHERE id = auth.uid()::uuid LIMIT 1));

-- Only service role can insert/update (done via backend)
CREATE POLICY "Service role manages api_keys"
  ON api_keys FOR ALL
  USING (auth.role() = 'service_role');

-- ── Transfer history view ─────────────────────────────────────────────────────
-- Useful for showing P2P send/receive history
CREATE OR REPLACE VIEW v_transfer_history AS
SELECT
  le.id,
  le.uid,
  le.asset,
  le.amount,
  le.note,
  le.created_at,
  u.display_name,
  u.email
FROM ledger_entries le
LEFT JOIN users u ON u.uid = le.uid
WHERE le.type = 'transfer';

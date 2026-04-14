-- Migration 024: API keys for developer/bot access
-- Key is stored hashed (sha256). key_prefix shown in the UI.
-- RLS: users only see their own keys.

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid          UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  label        TEXT NOT NULL CHECK (char_length(label) <= 50),
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,            -- first 15 chars, shown in UI
  permissions  TEXT[] NOT NULL DEFAULT ARRAY['read'],
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_uid ON api_keys(uid);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_owner" ON api_keys
  USING (uid = get_app_uid())
  WITH CHECK (uid = get_app_uid());

COMMENT ON TABLE api_keys IS 'User-created API keys for trading bot / developer access.';

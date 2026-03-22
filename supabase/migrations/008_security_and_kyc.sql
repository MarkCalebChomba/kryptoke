-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: Security features + KYC document uploads
-- Run in Supabase SQL editor after 007
-- ─────────────────────────────────────────────────────────────────────────────

-- ── TOTP / 2FA columns on users ──────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret      TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anti_phishing_code TEXT;

-- ── Login sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid          UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  ip_address   TEXT,
  user_agent   TEXT,
  country      TEXT,
  city         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current   BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_uid ON login_sessions (uid);
CREATE INDEX IF NOT EXISTS idx_login_sessions_created ON login_sessions (uid, created_at DESC);

ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own sessions"
  ON login_sessions FOR SELECT USING (auth.uid()::text = uid::text);

CREATE POLICY "Service role manages sessions"
  ON login_sessions FOR ALL USING (auth.role() = 'service_role');

-- ── KYC document submissions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid             UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL CHECK (doc_type IN ('national_id','passport','drivers_license')),
  front_url       TEXT NOT NULL,
  back_url        TEXT,
  selfie_url      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES admin_users(uid)
);

CREATE INDEX IF NOT EXISTS idx_kyc_uid ON kyc_submissions (uid);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions (status);

ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own kyc"
  ON kyc_submissions FOR SELECT USING (auth.uid()::text = uid::text);

CREATE POLICY "Service role manages kyc"
  ON kyc_submissions FOR ALL USING (auth.role() = 'service_role');

-- ── Withdrawal address whitelist ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawal_whitelist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid          UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  asset        TEXT NOT NULL,
  chain        TEXT NOT NULL,
  address      TEXT NOT NULL,
  memo         TEXT,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 24h cooling off before address can be used
  usable_from  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_whitelist_uid ON withdrawal_whitelist (uid);

ALTER TABLE withdrawal_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own whitelist"
  ON withdrawal_whitelist FOR ALL USING (auth.uid()::text = uid::text);

CREATE POLICY "Service role manages whitelist"
  ON withdrawal_whitelist FOR ALL USING (auth.role() = 'service_role');

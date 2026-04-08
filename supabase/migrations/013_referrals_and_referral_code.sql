-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013: Referrals table + referral_code column on users
-- Run after 012 in Supabase SQL Editor
--
-- Creates the referrals table used by:
--   server/routes/referral.ts  — /stats, /claim
--   server/routes/auth.ts      — fire-and-forget referral insert on register
--
-- Also adds referral_code to users table if not already present.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── referral_code on users ───────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code)
  WHERE referral_code IS NOT NULL;

-- ── referrals table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_uid     UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  referee_uid      UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  referral_code    TEXT,                               -- code used at signup
  commission_rate  NUMERIC(5,4) NOT NULL DEFAULT 0.20, -- 20% of referee trading fees
  rebate_rate      NUMERIC(5,4) NOT NULL DEFAULT 0.10, -- 10% rebate to referee
  total_earned_usdt NUMERIC(36,8) NOT NULL DEFAULT 0,
  claimed_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referee_uid)  -- each user can only be referred once
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_uid);
CREATE INDEX IF NOT EXISTS idx_referrals_referee  ON referrals (referee_uid);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Referrers can see their own referral records
CREATE POLICY "referrals_referrer_read" ON referrals
  FOR SELECT USING (get_app_uid() = referrer_uid);

-- Referees can see their own record (so they know they used a code)
CREATE POLICY "referrals_referee_read" ON referrals
  FOR SELECT USING (get_app_uid() = referee_uid);

-- Only backend (service role) can insert/update — no client-side writes
-- (The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS)

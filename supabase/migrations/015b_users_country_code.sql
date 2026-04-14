-- Migration 015: Add country_code to users table
-- Supports international UX — determines local currency, payment methods, etc.
-- Default 'KE' (Kenya) keeps all existing users unchanged.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'KE';

-- Index for analytics / payment method routing queries
CREATE INDEX IF NOT EXISTS idx_users_country_code ON users(country_code);

COMMENT ON COLUMN users.country_code IS
  'ISO 3166-1 alpha-2 country code. Used for local currency display and payment method routing.';

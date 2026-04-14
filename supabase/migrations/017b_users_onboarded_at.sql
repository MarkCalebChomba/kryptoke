-- Migration 017: Add onboarded_at to users
-- NULL = not yet onboarded; TIMESTAMPTZ = completed at that time.
-- Used to show the post-register wizard exactly once.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN users.onboarded_at IS
  'Set when user completes the post-register onboarding wizard. NULL = not yet shown.';

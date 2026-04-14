-- 022_airdrops.sql
-- [NEXUS] Wave 4 N-D — Airdrop tracking table
--
-- Records every airdrop event (admin-initiated or automatic welcome bonus).
-- Admin endpoint: POST /admin/airdrop
-- Welcome bonus: fires on every new user registration (100 KKE by default)

CREATE TABLE IF NOT EXISTS airdrops (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment          TEXT NOT NULL,                -- 'all' | 'kyc_verified' | 'new_users_7d' | 'single' | 'welcome_bonus'
  asset            TEXT NOT NULL DEFAULT 'KKE',
  amount_per_user  NUMERIC(30, 18) NOT NULL,
  recipient_count  INT NOT NULL DEFAULT 0,
  total_amount     NUMERIC(30, 18) NOT NULL DEFAULT 0,
  note             TEXT,
  created_by_uid   UUID REFERENCES users(uid) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS airdrops_asset_idx        ON airdrops (asset);
CREATE INDEX IF NOT EXISTS airdrops_segment_idx      ON airdrops (segment);
CREATE INDEX IF NOT EXISTS airdrops_created_at_idx   ON airdrops (created_at DESC);

-- Admin-only — no client access
ALTER TABLE airdrops ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'airdrops' AND policyname = 'admin_only') THEN
    CREATE POLICY "admin_only" ON airdrops USING (false);
  END IF;
END $$;

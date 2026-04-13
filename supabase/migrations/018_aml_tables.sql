-- 018_aml_tables.sql
-- [NEXUS] 2026-04-08
-- AML compliance infrastructure:
--   blocked_addresses  — internal blocklist (manual + auto-populated from Chainalysis)
--   compliance_alerts  — audit log of blocked tx events and AML flags

-- ── blocked_addresses ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blocked_addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address     TEXT NOT NULL,
  chain       TEXT NOT NULL,           -- chain ID ('TRON','BTC','56', etc.) or '*' for all chains
  risk_level  TEXT NOT NULL CHECK (risk_level IN ('sanctions','high_risk','darknet','mixer')),
  source      TEXT NOT NULL,           -- 'manual', 'chainalysis:NAME', 'ofac_sdn', etc.
  notes       TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by_uid UUID REFERENCES users(uid) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS blocked_addresses_addr_chain_idx
  ON blocked_addresses (lower(address), chain);

CREATE INDEX IF NOT EXISTS blocked_addresses_chain_idx
  ON blocked_addresses (chain);

-- ── compliance_alerts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid             UUID REFERENCES users(uid) ON DELETE SET NULL,
  alert_type      TEXT NOT NULL,   -- 'blocked_deposit','blocked_withdrawal','aml_flag'
  details         JSONB NOT NULL DEFAULT '{}',
  severity        TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','reviewed','closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by_uid UUID REFERENCES users(uid) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS compliance_alerts_uid_idx
  ON compliance_alerts (uid, created_at DESC);

CREATE INDEX IF NOT EXISTS compliance_alerts_status_idx
  ON compliance_alerts (status, severity, created_at DESC);

-- ── RLS — admin-only (no client access) ──────────────────────────────────────

ALTER TABLE blocked_addresses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_alerts    ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS. These deny-all policies block direct client access.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'blocked_addresses' AND policyname = 'admin_only'
  ) THEN
    CREATE POLICY "admin_only" ON blocked_addresses USING (false);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'compliance_alerts' AND policyname = 'admin_only'
  ) THEN
    CREATE POLICY "admin_only" ON compliance_alerts USING (false);
  END IF;
END $$;

-- ── Initial blocklist population ─────────────────────────────────────────────
-- The blocklist is NOT seeded with hardcoded addresses in this migration.
-- Instead, run the sync-blocklist cron immediately after migration to pull
-- the live OFAC SDN XML (1000+ addresses) and community sanction lists.
--
-- To trigger the initial sync after applying this migration:
--   curl -X POST https://kryptoke-mu.vercel.app/api/v1/cron/sync-blocklist \
--        -H "X-Cron-Secret: $CRON_SECRET"
--
-- Or from the admin panel: Compliance → Blocked Addresses → Sync Now
--
-- The sync endpoint:  POST /api/v1/cron/sync-blocklist
-- The cron schedule:  Daily at 02:00 UTC via cron-job.org
--
-- Sources pulled:
--   - OFAC SDN XML       https://sanctionslist.ofac.treas.gov/
--   - ETH community list https://github.com/ultrasoundmoney/eth-analysis-rs
--   - NiceHash mixer list https://github.com/nicehash/NiceHashQuickMiner
--   - Auto-populated from Chainalysis/TRM/AMLBot API hits at runtime
--
-- Benefits vs hardcoded:
--   - Always current (OFAC updates weekly)
--   - 1000s of addresses vs 20
--   - No deploy needed when new sanctioned addresses are added
--   - Admin can add individual addresses immediately via admin panel

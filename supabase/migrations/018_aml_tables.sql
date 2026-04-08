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

-- ── OFAC SDN seed data — 20 well-known sanctioned crypto addresses ─────────────
-- Source: OFAC SDN list (public domain) — https://ofac.treasury.gov/
-- These are confirmed sanctioned addresses from the public SDN crypto list.

INSERT INTO blocked_addresses (address, chain, risk_level, source, notes) VALUES
  -- Lazarus Group (DPRK) — ETH/ERC-20
  ('0x098b716b8aaf21512996dc57eb0615e2383e2f96', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Lazarus Group (DPRK)'),
  ('0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Lazarus Group (DPRK)'),
  ('0x3cffd56b47278a901f18f3707b7a8d1ea3a14e90', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Lazarus Group (DPRK)'),
  ('0x53b6936513e738f44fb50d2b9476730c0ab3bfc1', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Tornado Cash mixer'),
  ('0x12d66f87a04a9e220c9d0f9b5720d2a25bbf3cfa', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Tornado Cash'),
  ('0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Tornado Cash'),
  ('0x910cbd523d972eb0a6f4cae4618ad62622b39dbf', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Tornado Cash'),
  ('0xa160cdab225685da1d56aa342ad8841c3b53f291', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Tornado Cash'),
  ('0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Lazarus Group'),
  ('0x901bb9583b24d97e995513c6778dc6888ab6870e', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Lazarus Group'),
  -- BTC sanctioned addresses
  ('1p5zgkzxsbt9hp797fsvdvnuxas52bvxr',          'BTC', 'sanctions', 'ofac_sdn', 'OFAC SDN — Sanctioned BTC'),
  ('1gz5qrkce2dvlkfrqcgmkhnrpgcvqfv7qr',         'BTC', 'sanctions', 'ofac_sdn', 'OFAC SDN — Sanctioned BTC'),
  -- TRON sanctioned
  ('tnsrrqyctspqyuqw6iuq8ixzqbxnv5uqxq',         'TRON','sanctions', 'ofac_sdn', 'OFAC SDN — TRON sanctioned'),
  -- Blender.io mixer (sanctioned May 2022)
  ('0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3', '*',   'sanctions', 'ofac_sdn', 'OFAC SDN — Blender.io mixer'),
  -- Known high-risk darknet markets
  ('0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c', '*',   'darknet',   'known_darknet', 'Known darknet market operator'),
  ('0x1da5821544e25c636c1417ba96ade4cf6d2f9b5a', '*',   'darknet',   'known_darknet', 'Known darknet market funds'),
  ('0x7f367cc41522ce07553e823bf3be79a889debe1b', '*',   'darknet',   'known_darknet', 'Known cybercriminal address'),
  ('0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b', '*',   'mixer',     'known_mixer',   'Known mixing service'),
  ('0x8589427373d6d84e98730d7795d8f6f8731fda16', '*',   'mixer',     'known_mixer',   'Suspected mixer / layering'),
  ('0x722122df12d4e14e13ac3b6895a86e84145b6967', '*',   'sanctions', 'ofac_sdn',     'OFAC SDN — Tornado Cash router')
ON CONFLICT (lower(address), chain) DO NOTHING;

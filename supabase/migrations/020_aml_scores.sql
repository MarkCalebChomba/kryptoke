-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 020: AML Risk Scoring Tables
-- Run after 019 in Supabase SQL Editor
-- Depends on: migrations 018 (compliance_alerts), 011 (users.suspended_until)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── aml_risk_scores ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aml_risk_scores (
  uid              UUID PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  score            INT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  signals          JSONB NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'normal'
                     CHECK (status IN ('normal', 'review', 'restricted', 'suspended')),
  scored_at        TIMESTAMPTZ DEFAULT NOW(),
  manual_override  INT CHECK (manual_override BETWEEN 0 AND 100),
  override_by_uid  UUID REFERENCES users(uid),
  override_reason  TEXT
);

-- ── compliance_actions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_actions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid              UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  action           TEXT NOT NULL,
  reason           TEXT NOT NULL,
  score_at_action  INT,
  signals          JSONB,
  performed_by     TEXT NOT NULL DEFAULT 'system',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_actions_uid ON compliance_actions (uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aml_scores_status ON aml_risk_scores (status);

-- ── RLS — admin only (service role bypasses) ─────────────────────────────────
ALTER TABLE aml_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_actions ENABLE ROW LEVEL SECURITY;

-- Block all anon/authenticated client access — only service role reads/writes
CREATE POLICY "admin_only" ON aml_risk_scores USING (false);
CREATE POLICY "admin_only" ON compliance_actions USING (false);

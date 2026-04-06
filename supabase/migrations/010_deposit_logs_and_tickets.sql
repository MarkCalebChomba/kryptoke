-- ── Deposit attempt logs — every phase recorded ────────────────────────────
CREATE TABLE IF NOT EXISTS deposit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id    uuid REFERENCES deposits(id) ON DELETE CASCADE,
  uid           uuid NOT NULL,
  phase         text NOT NULL, -- initiated, stk_sent, stk_failed, callback_received, callback_failed, completed, failed, polling_check
  detail        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deposit_logs_deposit_id_idx ON deposit_logs (deposit_id);
CREATE INDEX IF NOT EXISTS deposit_logs_uid_idx ON deposit_logs (uid);

-- ── Support tickets — users raise tickets on failed transactions ───────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid           uuid NOT NULL,
  type          text NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'trade', 'other')),
  reference_id  uuid,           -- deposit id or withdrawal id
  subject       text NOT NULL,
  description   text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
  priority      text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  admin_notes   text,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_uid_idx    ON support_tickets (uid);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_type_idx   ON support_tickets (type);

-- RLS
ALTER TABLE deposit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_deposit_logs"    ON deposit_logs;
DROP POLICY IF EXISTS "users_read_own_tickets"         ON support_tickets;
DROP POLICY IF EXISTS "users_insert_own_tickets"       ON support_tickets;
DROP POLICY IF EXISTS "service_all_deposit_logs"       ON deposit_logs;
DROP POLICY IF EXISTS "service_all_tickets"            ON support_tickets;

CREATE POLICY "users_read_own_deposit_logs"  ON deposit_logs     FOR SELECT USING (auth.uid() = uid);
CREATE POLICY "users_read_own_tickets"       ON support_tickets  FOR SELECT USING (auth.uid() = uid);
CREATE POLICY "users_insert_own_tickets"     ON support_tickets  FOR INSERT WITH CHECK (auth.uid() = uid);
CREATE POLICY "service_all_deposit_logs"     ON deposit_logs     USING (auth.role() = 'service_role');
CREATE POLICY "service_all_tickets"          ON support_tickets  USING (auth.role() = 'service_role');

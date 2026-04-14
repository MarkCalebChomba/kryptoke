-- 023_futures_rls_fix.sql
-- Fix futures RLS policies to use get_app_uid() (custom JWT compatible)
-- Add margin_mode column to futures_positions

-- ── RLS fix ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users read own futures"        ON futures_positions;
DROP POLICY IF EXISTS "Service role manages futures"  ON futures_positions;
DROP POLICY IF EXISTS "Users read own futures_orders" ON futures_orders;
DROP POLICY IF EXISTS "futures_read_own"              ON futures_positions;
DROP POLICY IF EXISTS "futures_orders_read_own"       ON futures_orders;

CREATE POLICY "futures_read_own"
  ON futures_positions FOR SELECT USING (get_app_uid() = uid);

CREATE POLICY "futures_orders_read_own"
  ON futures_orders FOR SELECT USING (get_app_uid() = uid);

-- Writes are service-role only (bypasses RLS)

-- ── margin_mode column ────────────────────────────────────────────────────────

ALTER TABLE futures_positions
  ADD COLUMN IF NOT EXISTS margin_mode TEXT NOT NULL DEFAULT 'isolated'
  CHECK (margin_mode IN ('isolated', 'cross'));

-- ── updated_at trigger on futures_positions ───────────────────────────────────

ALTER TABLE futures_positions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS futures_positions_updated_at ON futures_positions;
CREATE TRIGGER futures_positions_updated_at
  BEFORE UPDATE ON futures_positions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

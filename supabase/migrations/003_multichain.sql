-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Multi-chain support
-- Run after 001_initial_schema.sql and 002_rls_and_indexes.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Grant increment_hd_counter to all roles that need it ─────────────────────
CREATE OR REPLACE FUNCTION public.increment_hd_counter()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_index integer;
BEGIN
  UPDATE public.hd_counter
  SET value = value + 1
  WHERE id = 1
  RETURNING value - 1 INTO current_index;
  RETURN current_index;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_hd_counter() TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_hd_counter() TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_hd_counter() TO anon;

-- ── chain_id on deposits ──────────────────────────────────────────────────────
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS chain_id   integer DEFAULT 56,
  ADD COLUMN IF NOT EXISTS chain_name text    DEFAULT 'BNB Smart Chain';

CREATE INDEX IF NOT EXISTS deposits_chain_id_idx ON public.deposits(chain_id);

-- ── chain_id on withdrawals ───────────────────────────────────────────────────
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS chain_id   integer DEFAULT 56,
  ADD COLUMN IF NOT EXISTS chain_name text    DEFAULT 'BNB Smart Chain';

CREATE INDEX IF NOT EXISTS withdrawals_chain_id_idx ON public.withdrawals(chain_id);

-- ── Multi-chain address map on tokens ────────────────────────────────────────
-- chain_ids: which EVM chain IDs this token exists on
-- addresses: jsonb map of chainId (string) → token contract address
ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS chain_ids integer[] DEFAULT ARRAY[56],
  ADD COLUMN IF NOT EXISTS addresses jsonb     DEFAULT '{}';

-- USDT — canonical addresses across all Phase 1 chains
UPDATE public.tokens SET
  chain_ids = ARRAY[1, 56, 137, 42161, 10, 8453, 250, 43114, 59144, 324, 534352, 5000],
  addresses = '{
    "1":      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "56":     "0x55d398326f99059fF775485246999027B3197955",
    "137":    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    "42161":  "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    "10":     "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    "8453":   "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    "250":    "0x049d68029688eAbF473097a2fC38ef61633A3C7A",
    "43114":  "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    "59144":  "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
    "324":    "0x493257fD37EDB34451f62EDf8D2a0C418852bA4C",
    "534352": "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df",
    "5000":   "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE"
  }'
WHERE symbol = 'USDT';

-- USDC — canonical addresses across all Phase 1 chains
UPDATE public.tokens SET
  chain_ids = ARRAY[1, 56, 137, 42161, 10, 8453, 250, 43114, 59144, 324, 534352, 5000, 100, 42220],
  addresses = '{
    "1":      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "56":     "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    "137":    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "42161":  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "10":     "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    "8453":   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "250":    "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
    "43114":  "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    "59144":  "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
    "324":    "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4",
    "534352": "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
    "5000":   "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    "100":    "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
    "42220":  "0xcebA9300f2b948710d2653dD7B07f33A8B32118C"
  }'
WHERE symbol = 'USDC';

-- ── Enable Realtime on all required tables ────────────────────────────────────
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE deposits;      EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE withdrawals;   EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE balances;      EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE announcements; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE events;        EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE trades;        EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE ledger_entries;EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ANALYZE public.deposits;
ANALYZE public.withdrawals;
ANALYZE public.tokens;

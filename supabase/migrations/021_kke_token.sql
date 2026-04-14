-- 021_kke_token.sql
-- [NEXUS] Wave 4 N-D — KryptoKe Exchange Token (KKE)
--
-- KKE is the native platform token. It lives in the balances table like any
-- other asset (asset = 'KKE', account = 'funding'). It is:
--   - Airdropped 100 KKE on new user registration (welcome bonus)
--   - Earned through gamification milestones and rewards tasks
--   - Tracked by the exchange itself for future KKE/USDT trading
--
-- KKE is internal-only at launch:
--   - No deposit address (users cannot send KKE in from external wallets)
--   - No withdrawal queue (users cannot withdraw KKE to external wallets yet)
--   - Admin airdrop and the welcome_bonus ledger entry are the only mint paths
--
-- To freeze external KKE deposits/withdrawals, insert a token_chain_freeze row
-- (done at the bottom of this migration).

-- ── Insert KKE into tokens table ─────────────────────────────────────────────

INSERT INTO tokens (
  symbol, name, decimals, chain, logo_url,
  is_native_token, total_supply, circulating_supply,
  coingecko_id, is_active
)
VALUES (
  'KKE',
  'KryptoKe Token',
  18,
  'INTERNAL',
  '/icon-192.png',
  true,
  '1000000000',   -- 1 billion total supply
  '0',            -- updated by airdrop cron / admin
  NULL,           -- no CoinGecko ID (internal token)
  true
)
ON CONFLICT (symbol) DO UPDATE
  SET
    name              = EXCLUDED.name,
    is_native_token   = true,
    total_supply      = EXCLUDED.total_supply,
    logo_url          = EXCLUDED.logo_url,
    is_active         = true;

-- ── Freeze KKE deposits and withdrawals on all chains ───────────────────────
-- Prevents users from seeing a deposit address for KKE and stops withdraw routing.
-- Remove these rows when KKE launches on-chain.

INSERT INTO token_chain_freeze (token_symbol, chain_id, deposit_frozen, withdraw_frozen)
VALUES ('KKE', '*', true, true)
ON CONFLICT (token_symbol, chain_id) DO UPDATE
  SET deposit_frozen = true, withdraw_frozen = true;

-- ── Insert system_config rows for the rewards pool ───────────────────────────
-- rewards_enabled: set to 'true' when ready to pay out USDT rewards
-- rewards_budget_remaining_usdt: fund this when activating USDT payouts

INSERT INTO system_config (key, value) VALUES ('rewards_enabled', 'false')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO system_config (key, value) VALUES ('rewards_budget_remaining_usdt', '0')
  ON CONFLICT (key) DO NOTHING;

-- ── KKE welcome airdrop amount ────────────────────────────────────────────────
INSERT INTO system_config (key, value) VALUES ('kke_welcome_bonus', '100')
  ON CONFLICT (key) DO NOTHING;

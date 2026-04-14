# Migrations

Run in filename order against Supabase SQL Editor. Files ending in `b` run after their base number.

**Example order:** `012_deposit_completing_status.sql` → `012b_rls_custom_jwt.sql` → `013_referrals_and_referral_code.sql` → `013b_withdrawal_timed_out_and_evm_scanner.sql` → …

## Rules

- **Never re-number** existing migrations once applied to production — it breaks audit trails.
- **Only rename** files that have NOT yet been applied to production.
- Files with the same numeric prefix run in alphabetical order (`012` before `012b`).
- Every migration must be idempotent where possible (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).

## Full Run Order (apply to a fresh DB)

```
000_quick_setup.sql
001_initial_schema.sql
002_rls_and_indexes.sql
003_multichain.sql
004_multichain_v2.sql
005_withdrawal_queue_and_fixes.sql
006_p2p_and_api_keys.sql
007_futures_and_reconciliation.sql
008_security_and_kyc.sql
009_tokens_rebuild.sql
010_deposit_logs_and_tickets.sql
011_suspension_and_revocation.sql
012_deposit_completing_status.sql
012b_rls_custom_jwt.sql
013_referrals_and_referral_code.sql
013b_withdrawal_timed_out_and_evm_scanner.sql
014_trades_spot_and_convert.sql
015_payment_provider_column.sql
015b_users_country_code.sql
016_p2p_messages.sql
017_gamification.sql
017b_users_onboarded_at.sql
018_aml_tables.sql
019_rls_lockdown.sql
020_aml_scores.sql
021_kke_token.sql
022_airdrops.sql
023_futures_rls_fix.sql
```

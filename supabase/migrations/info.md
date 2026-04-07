# supabase/migrations/ — Database Migrations

> **Last updated:** 2026-04-07
> **Add to this file** whenever a new migration file is created.

## Overview

Ordered SQL migration files for the Supabase (PostgreSQL) database. Run in the **Supabase SQL Editor** in numeric order. Each migration is **append-only and idempotent** — never edit a committed migration; create a new one instead.

## How to Apply

1. Open your Supabase project → SQL Editor
2. Run each file in order:

```
000_quick_setup.sql
001_initial_schema.sql
002_rls_and_indexes.sql
003_multichain.sql
004_multichain_v2.sql
005_withdrawal_queue_and_fixes.sql
```

> **Tip:** You can paste the file contents directly or use the Supabase CLI: `supabase db push`

## Migration Files

### `000_quick_setup.sql`

**Purpose:** Extensions and pre-requisites.

- Enables `uuid-ossp` extension (for `uuid_generate_v4()`)
- Enables `pgcrypto` extension
- Sets `search_path` to `public`
- Creates helper functions used by later migrations

---

### `001_initial_schema.sql`

**Purpose:** Core tables for users, wallets, transactions, and tokens.

**Tables created:**

| Table | Description |
|---|---|
| `users` | User accounts — `id` (UUID), `phone` (unique), `display_name`, `kyc_status`, `wallet_index`, `created_at` |
| `wallet_addresses` | Per-user deposit addresses — `user_id`, `chain`, `address`, `memo` |
| `tokens` | Supported assets — `symbol`, `name`, `decimals`, `logo_url`, `chains[]`, `contract_addresses` (jsonb), `coingecko_id`, `is_native` |
| `balances` | User holdings — `user_id`, `asset` (symbol), `amount` (numeric), `updated_at` |
| `transactions` | All monetary events — `id`, `user_id`, `type` (deposit/withdrawal/trade), `status`, `chain`, `asset`, `amount`, `amount_kes`, `fee`, `tx_hash`, `mpesa_ref`, `created_at`, `confirmed_at` |
| `orders` | Trade orders — `id`, `user_id`, `pair`, `side`, `type`, `price`, `quantity`, `filled_quantity`, `status`, `created_at` |
| `otp_sessions` | OTP verification — `phone`, `otp_hash`, `expires_at`, `attempts` |

---

### `002_rls_and_indexes.sql`

**Purpose:** Row-Level Security policies and performance indexes.

**RLS policies:**
- `users` — users can only read/update their own row
- `wallet_addresses` — users can only read their own addresses
- `balances` — users can only read their own balances
- `transactions` — users can only read their own transactions
- `orders` — users can only read/create/cancel their own orders
- `tokens` — public read, no write from client
- `otp_sessions` — server-only (service role) via admin client

**Indexes:**
- `transactions(user_id, created_at DESC)` — history queries
- `transactions(tx_hash)` — deposit monitor deduplication
- `transactions(mpesa_ref)` — M-Pesa callback lookup
- `orders(user_id, status)` — open orders query
- `wallet_addresses(user_id, chain)` — address lookup
- `balances(user_id, asset)` — portfolio query

---

### `003_multichain.sql`

**Purpose:** Adds support for non-EVM chains and memo-based deposits.

**Changes:**
- Adds `memo` column to `wallet_addresses` (nullable — used by XRP, TON, XLM)
- Adds `Chain` type enum with all supported chain values
- Adds `deposit_monitors` table — tracks last-checked block/slot per chain per user for efficient scanning
- Adds `hot_wallet_deposits` table — for memo-based chains: `chain`, `memo`, `tx_hash`, `amount`, `status`

---

### `004_multichain_v2.sql`

**Purpose:** Enhancements and corrections to multi-chain schema.

**Changes:**
- Adds `contract_address` column to `transactions` (for ERC-20 transfers)
- Adds `raw_tx` (jsonb) to `transactions` for full decoded tx storage
- Adds `network_fee` separate from `platform_fee` in `transactions`
- Adds `slippage` to `orders` table
- Adds `kes_rate_at_time` to `transactions` (KES/USD rate snapshot)
- Updates RLS on `hot_wallet_deposits` (service role only)

---

### `005_withdrawal_queue_and_fixes.sql`

**Purpose:** Withdrawal queue system and bug fixes.

**Changes:**
- Creates `withdrawal_queue` table — `id`, `user_id`, `asset`, `chain`, `to_address`, `amount`, `fee`, `status` (pending/processing/completed/failed), `tx_hash`, `created_at`, `processed_at`
- Adds index `withdrawal_queue(status, created_at)` for queue processing
- Adds `sweep_transactions` table — records automated hot-wallet sweep txns
- Fixes: corrects `balances.amount` column type from `float8` to `numeric(36,18)` (precision fix)
- Adds `CHECK (amount > 0)` constraint on `balances`

---

## Adding a New Migration

1. Name it `006_<description>.sql` (increment prefix)
2. Use `IF NOT EXISTS` / `IF EXISTS` guards on all DDL
3. Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for column additions
4. Test on a dev Supabase project first
5. Document the migration in this file
6. Update `SETUP.md` migration list

## Database Overview (all tables)

```
users
wallet_addresses
tokens
balances
transactions
orders
otp_sessions
deposit_monitors
hot_wallet_deposits
withdrawal_queue
sweep_transactions
```

## Notes for Editing

- **Never** modify a migration that has been applied to production — always add a new one.
- All `amount` fields use `numeric(36,18)` — never `float` or `double precision`.
- RLS is enabled on all user-data tables — service role bypasses RLS, anon key does not.
- `wallet_index` in `users` is auto-incremented on the application side (not DB sequence) to ensure uniqueness across all chains.

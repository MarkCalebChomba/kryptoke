# scripts/ — Developer and Operations Scripts

> **Last updated:** 2026-04-07
> **Add to this file** whenever a new script is added.

## Overview

One-off and utility scripts for seeding data, maintaining the DB, and local development tasks. Scripts run via `tsx` and `dotenv-cli` so they have access to `.env.local` variables without a full Next.js boot.

## Files

```
scripts/
└── seed-tokens.mts    # Seed the supported token/asset list into Supabase
```

## Usage

All scripts are run with:

```bash
pnpm seed:tokens
# expands to: dotenv -e .env.local -- tsx scripts/seed-tokens.mts
```

## seed-tokens.mts

**Purpose:** Populates the `tokens` table in Supabase with the full list of supported cryptocurrencies, their metadata (symbol, name, decimals, logo URL, supported chains).

**When to run:** Once after initial DB setup, or when adding new supported tokens.

**What it does:**
1. Connects to Supabase using `SUPABASE_SERVICE_ROLE_KEY`
2. Upserts each token record (by `symbol`) into the `tokens` table
3. Logs success/failure per token

**Token data includes:**
- `symbol` — e.g. `'BTC'`, `'ETH'`, `'USDT'`
- `name` — e.g. `'Bitcoin'`
- `decimals` — e.g. `8` for BTC, `18` for ETH, `6` for USDT
- `logoUrl` — CoinGecko or CoinMarketCap image URL
- `chains` — array of `Chain` enum values where this token is supported
- `contractAddresses` — map of `Chain → contract address` (for ERC-20 / SPL / TRC-20 tokens)
- `isNative` — whether it's the chain's native asset (no contract)
- `coingeckoId` — for price lookups

**Example token entry:**
```typescript
{
  symbol: 'USDT',
  name: 'Tether USD',
  decimals: 6,
  isNative: false,
  coingeckoId: 'tether',
  chains: ['eth', 'bsc', 'polygon', 'sol', 'trx', ...],
  contractAddresses: {
    eth:     '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    bsc:     '0x55d398326f99059fF775485246999027B3197955',
    trx:     'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    sol:     'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  }
}
```

## Adding a New Script

1. Create `scripts/your-script.mts` (use `.mts` for ESM + TypeScript)
2. Add a pnpm script to `package.json`:
   ```json
   "your-script": "dotenv -e .env.local -- tsx scripts/your-script.mts"
   ```
3. Document it in this file.

## Notes for Editing

- Always use `.mts` extension for ESM compatibility with `tsx`.
- Scripts should be idempotent — safe to run multiple times (use `upsert` not `insert`).
- Never commit real secrets to script files — always read from environment variables.
- Scripts run outside the Next.js runtime — do not import from `next/*`.

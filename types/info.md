# types/ — Shared TypeScript Type Definitions

> **Last updated:** 2026-04-07
> **Add to this file** whenever a new type file is added or a major type is changed.

## Overview

All shared TypeScript interfaces, enums, and type aliases live here. These are imported by both frontend (`app/`, `components/`) and backend (`server/`, `lib/`) code. No runtime logic — pure type definitions only.

## Directory Structure

```
types/
├── index.ts          # Re-exports all types (barrel file)
├── user.ts           # User profile, KYC status, session
├── transaction.ts    # Transaction, deposit, withdrawal types
├── wallet.ts         # Chain types, addresses, balances
├── trade.ts          # Orders, pairs, OHLCV, order book
├── market.ts         # Token price data, market stats
├── mpesa.ts          # M-Pesa API request/response shapes
├── api.ts            # API response wrappers (ApiResponse<T>, PaginatedResponse<T>)
└── env.d.ts          # Environment variable type declarations
```

## Key Types

### user.ts

```typescript
interface User {
  id: string               // Supabase UUID
  phone: string            // Kenyan phone number (+2547...)
  displayName: string | null
  kycStatus: KycStatus
  createdAt: string        // ISO date
  walletIndex: number      // HD wallet derivation index
}

enum KycStatus {
  Unverified = 'unverified',
  Pending    = 'pending',
  Verified   = 'verified',
  Rejected   = 'rejected',
}

interface Session {
  userId: string
  phone: string
  token: string            // JWT
  expiresAt: number        // Unix timestamp
}
```

### transaction.ts

```typescript
interface Transaction {
  id: string
  userId: string
  type: TransactionType
  status: TransactionStatus
  chain: Chain
  asset: string            // e.g. 'USDT', 'BTC', 'ETH'
  amount: string           // big.js string — never number
  amountKes: string        // KES equivalent at time of tx
  fee: string
  txHash: string | null    // on-chain hash
  mpesaRef: string | null  // M-Pesa reference
  createdAt: string
  confirmedAt: string | null
}

enum TransactionType {
  Deposit    = 'deposit',
  Withdrawal = 'withdrawal',
  Trade      = 'trade',
}

enum TransactionStatus {
  Pending   = 'pending',
  Confirmed = 'confirmed',
  Failed    = 'failed',
  Cancelled = 'cancelled',
}
```

### wallet.ts

```typescript
enum Chain {
  // EVM
  ETH       = 'eth',
  BSC       = 'bsc',
  Polygon   = 'polygon',
  Arbitrum  = 'arbitrum',
  Optimism  = 'optimism',
  Base      = 'base',
  Avalanche = 'avalanche',
  Fantom    = 'fantom',
  Linea     = 'linea',
  ZkSync    = 'zksync',
  Scroll    = 'scroll',
  Mantle    = 'mantle',
  Gnosis    = 'gnosis',
  Celo      = 'celo',
  // Non-EVM
  Bitcoin   = 'btc',
  Litecoin  = 'ltc',
  Dogecoin  = 'doge',
  BitcoinCash = 'bch',
  Solana    = 'sol',
  Tron      = 'trx',
  XRP       = 'xrp',
  TON       = 'ton',
  Stellar   = 'xlm',
  NEAR      = 'near',
  Filecoin  = 'fil',
}

interface WalletAddress {
  chain: Chain
  address: string
  memo: string | null    // For XRP, TON, XLM
}

interface AssetBalance {
  chain: Chain
  asset: string
  balance: string        // big.js string
  balanceKes: string
  balanceUsd: string
}
```

### trade.ts

```typescript
interface TradingPair {
  base: string           // e.g. 'BTC'
  quote: string          // e.g. 'USDT' or 'KES'
  symbol: string         // 'BTCUSDT'
  minOrderSize: string
  maxOrderSize: string
  pricePrecision: number
  quantityPrecision: number
}

interface Order {
  id: string
  userId: string
  pair: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  price: string | null    // null for market orders
  quantity: string
  filledQuantity: string
  status: OrderStatus
  createdAt: string
}

enum OrderStatus {
  Open      = 'open',
  Filled    = 'filled',
  Cancelled = 'cancelled',
  Partial   = 'partial',
}

interface Candle {
  time: number    // Unix timestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}
```

### market.ts

```typescript
interface TokenPrice {
  symbol: string
  priceUsd: string
  priceKes: string
  change24h: number        // percentage
  volume24h: string
  marketCap: string | null
  logoUrl: string | null
}
```

### mpesa.ts

```typescript
interface StkPushRequest {
  phone: string            // Safaricom format: 254...
  amount: number           // KES, whole number
  accountRef: string       // User ID or order ID
  description: string
}

interface StkPushResponse {
  checkoutRequestId: string
  merchantRequestId: string
  responseCode: string
  responseDescription: string
}

interface StkPushCallback {
  body: {
    stkCallback: {
      merchantRequestId: string
      checkoutRequestId: string
      resultCode: number      // 0 = success
      resultDesc: string
      callbackMetadata?: {
        item: Array<{ name: string; value: string | number }>
      }
    }
  }
}
```

### api.ts

```typescript
interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}
```

### env.d.ts

Augments `process.env` with typed keys matching `.env.example`. Any new env var must be added here.

## Notes for Editing

- All monetary amounts are `string` not `number` — enforced across all types to prevent floating-point errors.
- `Chain` enum values (lowercase strings) are used as DB column values and URL params — do not change them.
- When adding a new chain, update: `Chain` enum → `WalletAddress` interface (if memo-based) → `lib/blockchain/` → `supabase/migrations/` → `components/wallet/ChainSelector`.
- `index.ts` must re-export everything — keep it updated so imports can use `import { X } from '@/types'`.

# lib/ — Utilities, Services, and Blockchain Clients

> **Last updated:** 2026-04-07
> **Add to this file** whenever a new service, hook, or utility module is added.

## Overview

`lib/` is the business-logic layer shared between the frontend (`app/`, `components/`) and the backend (`server/`). It contains:

- Supabase client factories
- Blockchain wallet/transaction services (one file per chain)
- TanStack Query hooks
- Zustand state stores
- Utility functions
- Rate-limiting helpers
- M-Pesa / Africa's Talking / Resend clients

## Directory Structure

```
lib/
├── supabase/           # Supabase client factories
├── blockchain/         # Per-chain transaction and wallet logic
├── mpesa/              # M-Pesa Daraja API client
├── sms/                # Africa's Talking SMS client
├── email/              # Resend email client
├── hooks/              # TanStack Query data hooks
├── store/              # Zustand global state stores
├── redis/              # Upstash Redis client and rate limiter
├── forex/              # KES/USD exchange rate fetcher
└── utils.ts            # General utility functions (cn, formatters, etc.)
```

## supabase/

| File | Purpose |
|---|---|
| `client.ts` | Browser-side Supabase client (singleton) |
| `server.ts` | Server-side Supabase client (cookies via `@supabase/ssr`) |
| `admin.ts` | Admin Supabase client (service role key — server only) |

**Rule:** Never import `admin.ts` in client components. Only use in `server/` routes or Next.js server actions.

## blockchain/

One service file per chain. Each exposes a consistent interface:

```typescript
// Standard exports per chain file
export function deriveAddress(seedPhrase: string, index: number): string
export function getBalance(address: string): Promise<BigNumber>
export function buildTransaction(from: string, to: string, amount: BigNumber): Promise<TxData>
export function broadcastTransaction(signedTx: string): Promise<string>  // returns txHash
export function monitorDeposit(address: string, since: Date): Promise<Deposit[]>
```

| File | Chain(s) | Library |
|---|---|---|
| `evm.ts` | ETH, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche, Fantom, Linea, zkSync, Scroll, Mantle, Gnosis, Celo | `ethers 6` |
| `bitcoin.ts` | BTC | `bitcoinjs-lib`, `bip32`, `bip39`, `blockstream.info` API |
| `litecoin.ts` | LTC | `bitcoinjs-lib` (network override), Trezor API |
| `dogecoin.ts` | DOGE | `bitcoinjs-lib` (network override), BlockCypher API |
| `bch.ts` | BCH | `bitcoinjs-lib` (network override), Trezor API |
| `solana.ts` | SOL, USDT-SPL | `@solana/web3.js`, `@solana/spl-token`, `ed25519-hd-key` |
| `tron.ts` | TRX, USDT-TRC20 | `tronweb` |
| `xrp.ts` | XRP | `xrpl`, memo-based shared hot wallet |
| `ton.ts` | TON | `@ton/ton`, `@ton/crypto`, memo-based shared hot wallet |
| `stellar.ts` | XLM | `stellar-sdk`, memo-based shared hot wallet |
| `near.ts` | NEAR | `near-api-js` |
| `filecoin.ts` | FIL | Glif.io JSON-RPC, Zondax indexer |
| `hdwallet.ts` | All chains | BIP32/BIP39 master key derivation, child key factory |

### HD Wallet Architecture

- Master seed phrase → BIP39 → master key
- Each user gets a unique derivation index stored in Supabase
- EVM chains share one derived private key per user (all EVM chains use same key)
- Non-EVM chains each use their own derivation path
- XRP, TON, XLM use a **shared hot wallet + unique memo** pattern (not HD per-user)

## mpesa/

| File | Purpose |
|---|---|
| `client.ts` | OAuth token fetch, STK Push, B2C Payment, balance query |
| `callback.ts` | Handles STK Push and B2C result callbacks |
| `crypto.ts` | Encrypts initiator password with Safaricom certificate |

Endpoints used:
- **STK Push (deposit):** `POST /mpesa/stkpush/v1/processrequest`
- **B2C (withdrawal):** `POST /mpesa/b2c/v1/paymentrequest`
- **OAuth:** `GET /oauth/v1/generate?grant_type=client_credentials`

## sms/

| File | Purpose |
|---|---|
| `at.ts` | Africa's Talking SMS client — sends OTP codes |

OTP flow: generate 6-digit code → store hash in Redis (5 min TTL) → send SMS → verify on submit.

## email/

| File | Purpose |
|---|---|
| `resend.ts` | Resend client — sends transactional emails (registration, withdrawal confirmation) |

## hooks/

TanStack Query hooks. Each hook corresponds to an API endpoint.

| Hook | Data |
|---|---|
| `usePortfolio()` | User's total balance and per-asset holdings |
| `useTransactions()` | Paginated transaction history |
| `useMarketPrices()` | Live token prices (polling via Binance/CoinGecko) |
| `useOrderBook()` | Live bid/ask for a trading pair |
| `useWalletAddresses()` | User's deposit addresses per chain |
| `useKesRate()` | Current KES/USD rate |
| `useUser()` | Authenticated user profile |

## store/

Zustand stores. All stores use `immer` middleware for immutable updates.

| Store | State |
|---|---|
| `useAuthStore` | Current user, session token, login state |
| `useTradeStore` | Selected pair, order type, amount, price |
| `useWalletStore` | Selected chain, receive/send mode |
| `useToastStore` | Toast queue (add/dismiss) |
| `useThemeStore` | Theme preference (dark only for now) |

## redis/

| File | Purpose |
|---|---|
| `client.ts` | Upstash Redis client instance |
| `ratelimit.ts` | Rate limiters per endpoint (sliding window) |
| `otp.ts` | OTP storage/verification (SET with TTL, GETDEL) |
| `cache.ts` | Generic cache helpers (get/set/invalidate) |

## forex/

| File | Purpose |
|---|---|
| `rate.ts` | Fetches KES/USD rate from Frankfurter API; cached in Redis (5 min) |

## utils.ts

General-purpose helpers:

```typescript
cn(...inputs)                      // clsx + tailwind-merge
formatKES(amount: number): string  // "KES 1,234.56"
formatCrypto(amount, decimals)     // "0.00042 BTC"
shortenAddress(addr: string)       // "0x1234...abcd"
formatDate(date: Date): string     // "Apr 7, 2026"
sleep(ms: number): Promise<void>   // async delay
generateOtp(): string              // 6-digit random OTP
hashOtp(otp: string): string       // bcrypt hash for storage
```

## Notes for Editing

- **Server-only modules** (`admin.ts`, blockchain services with private keys) must never be imported by client components. Add `"server-only"` import at the top of those files.
- Blockchain services should be **stateless** — no singleton connections in module scope where possible (Vercel serverless functions restart frequently).
- Rate limiters in `redis/ratelimit.ts` should be shared — do not define new limiters inline in API routes.
- All monetary values use `big.js` for precision — never use `number` for KES or crypto amounts.

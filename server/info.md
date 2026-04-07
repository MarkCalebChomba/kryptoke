# server/ — Hono API Server

> **Last updated:** 2026-04-07
> **Add to this file** whenever a new route group or middleware is added.

## Overview

The backend API is built with **Hono** — a fast, edge-compatible web framework. The server runs inside Next.js via a catch-all API route (`app/api/v1/[...hono]/route.ts`) so all API calls go through Vercel's serverless functions. In local dev it can also run standalone via `pnpm dev:server`.

All endpoints are prefixed `/api/v1/`.

## Directory Structure

```
server/
├── index.ts           # Hono app factory, mounts all routers
├── middleware/
│   ├── auth.ts        # JWT auth middleware — validates Bearer token
│   ├── ratelimit.ts   # Upstash rate limiting middleware
│   ├── cors.ts        # CORS headers (dev: *, prod: kryptoke.vercel.app)
│   └── logger.ts      # Request logging (Sentry breadcrumbs)
└── routes/
    ├── auth.ts        # /auth — login, register, OTP, logout
    ├── user.ts        # /user — profile, KYC status
    ├── wallet.ts      # /wallet — addresses, balances, send
    ├── deposit.ts     # /deposit — M-Pesa STK Push initiation
    ├── withdraw.ts    # /withdraw — M-Pesa B2C payment
    ├── trade.ts       # /trade — place orders, cancel, history
    ├── market.ts      # /market — prices, order book, pairs
    ├── transactions.ts # /transactions — history, paginated
    ├── mpesa/
    │   ├── callback.ts  # /mpesa/callback/stk — M-Pesa STK result
    │   └── b2c.ts       # /mpesa/callback/b2c — M-Pesa B2C result
    └── cron.ts        # /cron/deposit-monitor — scans for new deposits
```

## Auth Middleware

Every protected route uses `authMiddleware`:

```
Request
  → Extract JWT from Authorization: Bearer <token>
  → Verify with jose (JWT_SECRET)
  → Attach { userId, phone } to context
  → Next handler
```

Public routes (no auth required): `/auth/login`, `/auth/register`, `/auth/otp/send`, `/auth/otp/verify`, `/mpesa/callback/*`, `/market/prices`.

## Rate Limiting

Using Upstash sliding-window rate limiter:

| Endpoint group | Limit |
|---|---|
| `/auth/otp/send` | 3 requests / 10 minutes per phone |
| `/deposit` | 5 requests / minute per user |
| `/withdraw` | 3 requests / minute per user |
| `/trade` | 30 requests / minute per user |
| Default (all others) | 60 requests / minute per IP |

## Route Reference

### `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/otp/send` | No | Send OTP to phone number |
| POST | `/auth/otp/verify` | No | Verify OTP, return JWT |
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/logout` | Yes | Invalidate session |

### `/api/v1/user`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/user/me` | Yes | Get authenticated user profile |
| PATCH | `/user/me` | Yes | Update display name |
| POST | `/user/kyc` | Yes | Submit KYC documents |

### `/api/v1/wallet`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/wallet/addresses` | Yes | All deposit addresses per chain |
| GET | `/wallet/balances` | Yes | On-chain balances per chain |
| POST | `/wallet/send` | Yes | Initiate crypto withdrawal |

### `/api/v1/deposit`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/deposit/mpesa` | Yes | Initiate M-Pesa STK Push |
| GET | `/deposit/status/:checkoutId` | Yes | Poll STK Push status |

### `/api/v1/withdraw`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/withdraw/mpesa` | Yes | Request M-Pesa B2C payout |
| GET | `/withdraw/status/:id` | Yes | Poll withdrawal status |

### `/api/v1/trade`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/trade/order` | Yes | Place buy or sell order |
| DELETE | `/trade/order/:id` | Yes | Cancel open order |
| GET | `/trade/orders` | Yes | User's open orders |
| GET | `/trade/history` | Yes | User's trade history |

### `/api/v1/market`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/market/prices` | No | All token prices (USD + KES) |
| GET | `/market/pairs` | No | Supported trading pairs |
| GET | `/market/orderbook/:pair` | No | Live order book |
| GET | `/market/ohlcv/:pair` | No | OHLCV candles for chart |

### `/api/v1/transactions`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/transactions` | Yes | Paginated transaction history |

### `/api/v1/mpesa/callback`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/mpesa/callback/stk` | IP allowlist | Safaricom STK push result |
| POST | `/mpesa/callback/b2c` | IP allowlist | Safaricom B2C result |

M-Pesa callback IPs are Safaricom's — validate `X-Safaricom-IP` header in production.

### `/api/v1/cron`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/cron/deposit-monitor` | `X-Cron-Secret` header | Scan all user addresses for new deposits |

## M-Pesa STK Push Flow

```
User submits amount + phone
  → POST /deposit/mpesa
  → Server calls Safaricom STK Push API
  → Safaricom sends push notification to user's phone
  → User enters M-Pesa PIN
  → Safaricom POSTs result to /mpesa/callback/stk
  → Server credits user's KES balance in Supabase
  → Frontend polls /deposit/status/:checkoutId
```

## Deposit Monitor Cron

Runs every 30 seconds. For each blockchain:
1. Queries Supabase for all user deposit addresses
2. Checks each address for new transactions since last check
3. Credits confirmed deposits to user KES/crypto balance in Supabase
4. Records transaction in `transactions` table

## Notes for Editing

- Keep all routes thin — business logic goes in `lib/` services.
- Always validate request body with Zod schemas via `@hono/zod-validator`.
- M-Pesa callbacks must respond with HTTP 200 immediately, then process async.
- Cron route must verify `X-Cron-Secret` before processing.
- Add new route files to the `index.ts` mount — do not create loose API route files.

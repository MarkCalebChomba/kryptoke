# server/services/ — Business Logic Services

> Last updated: 2026-04-08

Pure business logic. No HTTP concerns. Called by route handlers.

| File | Purpose | Owner |
|---|---|---|
| `mpesa.ts` | Safaricom STK Push + B2C. Handles token caching, callback parsing. | NEXUS |
| `blockchain.ts` | EVM deposit scanning, address derivation (hdIndex), tx detection | NEXUS |
| `bsc.ts` | BSC/BNB specific RPC calls | NEXUS |
| `nonEvm.ts` | TRON, Solana, Bitcoin, XRP, TON deposit detection | NEXUS |
| `exchange.ts` | Binance/Gate.io/Bybit order routing aggregator | FORGE |
| `forex.ts` | KES/USD rate — cached in Redis, falls back to hardcoded rate | SHARED |
| `jwt.ts` | Issue/verify custom JWTs, Redis blacklist check | SHIELD |
| `notifications.ts` | Send email (Resend) + SMS (Africa's Talking) + push | PULSE |
| `otp.ts` | Generate/verify OTP codes, stored in Redis with TTL | PULSE |
| `wallet.ts` | Internal transfer logic, balance checks | SHIELD |

## Critical notes
- `blockchain.ts`: `hdIndex` and `depositAddress` must NEVER appear in API responses to users (security)
- `mpesa.ts`: token is cached in Redis. On `404.001.03` error, auto-retry with fresh token.
- `forex.ts`: rate is refreshed every 5 minutes. Always use this — never hardcode KES/USD.

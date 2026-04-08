# server/routes/ — Hono Route Handlers

> Last updated: 2026-04-08

All routes are mounted in `server/index.ts` under `/api/v1/`.
Each file exports a `new Hono()` instance. Keep handlers thin — business logic goes in `server/services/`.

## File → URL mapping

| File | Prefix | Owner |
|---|---|---|
| `auth.ts` | `/auth` | PULSE |
| `mpesa.ts` | `/deposit`, `/mpesa/callback` | NEXUS |
| `withdraw.ts` | `/withdraw` | NEXUS |
| `wallet.ts` | `/wallet` | SHIELD |
| `trade.ts` | `/trade` | FORGE |
| `futures.ts` | `/futures` | FORGE |
| `market.ts` | `/market` | FORGE |
| `tokens.ts` | `/tokens` | SHIELD |
| `notifications.ts` | `/notifications` | PULSE |
| `account.ts` | `/account` | PULSE |
| `analytics.ts` | `/analytics` | APEX |
| `p2p.ts` | `/p2p` | SHIELD |
| `referral.ts` | `/referral` | PULSE |
| `support.ts` | `/support` | PULSE |
| `admin/index.ts` | `/admin` | APEX |
| `earn.ts` | `/earn` | — (not started) |
| `rewards.ts` | `/rewards` | — (not started) |
| `feedback.ts` | `/feedback` | PULSE |

# server/middleware/ — Hono Middleware

> Last updated: 2026-04-08

| File | Purpose | Owner |
|---|---|---|
| `auth.ts` | JWT validation. Attaches `{ uid, phone }` to context. Checks Redis blacklist. | SHIELD |
| `ratelimit.ts` | Upstash sliding-window rate limiter. `withApiRateLimit()`, `withSensitiveRateLimit()`, `withPinRateLimit()` | SHIELD |
| `security.ts` | M-Pesa callback IP allowlist. Bypass when `MPESA_ENVIRONMENT !== production`. | NEXUS |
| `timing.ts` | Request timing logs for Sentry | APEX |

## Auth context shape
```ts
c.get('user') // { uid: string, phone: string }
```

## Rate limit helpers
- `withApiRateLimit()` — 60 req/min per user (default)
- `withSensitiveRateLimit()` — 5 req/min per user (deposits, withdrawals)
- `withPinRateLimit()` — 3 req/5min per user (PIN verification)

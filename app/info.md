# app/ — Next.js App Router

> **Last updated:** 2026-04-07
> **Add to this file** whenever a new route, layout, or route group is added.

## Overview

All user-facing pages and API routes live here following the Next.js 15/16 App Router convention. The directory uses **route groups** (folders in parentheses) to share layouts without affecting the URL.

## Route Group: `(app)/`

The `(app)` route group wraps the authenticated application shell. It provides a shared layout with navigation, sidebar, and toast system.

### Pages inside `(app)/`

| Route | URL path | Description |
|---|---|---|
| `page.tsx` | `/` | Landing / redirect to dashboard or login |
| `dashboard/page.tsx` | `/dashboard` | Main portfolio overview — balances, recent txns, market summary |
| `trade/page.tsx` | `/trade` | Trading terminal — TradingView chart, order book, buy/sell panel |
| `wallet/page.tsx` | `/wallet` | Multi-chain wallet — receive, send, QR generator |
| `deposit/page.tsx` | `/deposit` | M-Pesa STK Push deposit flow |
| `withdraw/page.tsx` | `/withdraw` | M-Pesa B2C withdrawal flow |
| `history/page.tsx` | `/history` | Transaction history — deposits, withdrawals, trades |
| `settings/page.tsx` | `/settings` | Profile, KYC, notification preferences, security |
| `login/page.tsx` | `/login` | Phone-number + OTP login |
| `register/page.tsx` | `/register` | New account registration |

### Layouts

| File | Wraps | Purpose |
|---|---|---|
| `layout.tsx` | Entire app | Root HTML shell, fonts (Syne, DM Mono, Outfit), global metadata, Providers |
| `(app)/layout.tsx` | Authenticated pages | Nav bar, sidebar, toast region, auth guard |

### Special Files

| File | Purpose |
|---|---|
| `not-found.tsx` | 404 page |
| `error.tsx` | Error boundary for client errors |
| `loading.tsx` | Suspense fallback skeleton |
| `manifest.json` (in `public/`) | PWA manifest (referenced from layout) |

## API Routes — `app/api/`

All API routes proxy into the Hono server (`server/`) and are exposed under `/api/v1/`. Route structure:

```
app/api/
└── v1/
    ├── [...hono]/route.ts   # Catch-all — forwards to Hono router
    └── cron/
        └── deposit-monitor/route.ts  # POST — triggered by cron-job.org
```

All API responses are JSON. Auth is JWT-based via `Authorization: Bearer <token>` header.

## Metadata (root layout)

```
title: "KryptoKe — Kenya's Crypto Exchange"
description: "Buy, sell, and trade cryptocurrency in Kenya. Instant M-Pesa deposits and withdrawals. KES trading pairs."
theme-color: #080C14
og:locale: en_KE
PWA: manifest.json, apple-touch-icon.png
```

## Fonts

| Font | Variable | Usage |
|---|---|---|
| Syne | `--font-syne` | Headings |
| DM Mono | `--font-dm-mono` | Numbers, addresses, code |
| Outfit | `--font-outfit` | Body text |

## Auth Flow

1. User enters Kenyan phone number
2. OTP sent via Africa's Talking SMS
3. OTP verified → JWT issued → stored in httpOnly cookie via Supabase SSR helpers
4. Auth guard in `(app)/layout.tsx` redirects unauthenticated users to `/login`

## Notes for Editing

- **Do not** add new top-level pages outside `(app)/` unless they are auth/public pages (login, register, landing).
- API routes should **only** be thin adapters — all business logic belongs in `server/` or `lib/`.
- Use `loading.tsx` and `error.tsx` at the route level for proper suspense/error handling.
- Shared page-level state goes in Zustand stores (`lib/store/`), not in page components.

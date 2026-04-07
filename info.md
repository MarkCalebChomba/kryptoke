# KryptoKe — Root

> **Last updated:** 2026-04-07
> **Add to this file** whenever root-level config changes or new top-level directories are added.

## What This Project Is

KryptoKe is Kenya's crypto exchange web app. Users can buy, sell, and trade cryptocurrency using **M-Pesa (KES)** as the fiat on/off-ramp. It supports 20+ blockchains and targets the Kenyan market.

- **Live URL:** https://kryptoke-mu.vercel.app
- **Custom domain (planned):** https://kryptoke.com
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · Supabase · Upstash Redis · Hono · Vercel

## Root-Level Files

| File | Purpose |
|---|---|
| `package.json` | PNPM workspace manifest, all dependencies, scripts |
| `pnpm-lock.yaml` | Lockfile — do not edit manually |
| `pnpm-workspace.yaml` | PNPM workspace config |
| `next.config.mjs` | Next.js config: CSP headers, image domains, TypeScript ignore |
| `tailwind.config.ts` | Tailwind v4 config, design tokens |
| `postcss.config.js` | PostCSS with `@tailwindcss/postcss` plugin |
| `tsconfig.json` | TypeScript compiler options |
| `.eslintrc.json` | ESLint rules (Next.js preset) |
| `.prettierrc` | Prettier formatting rules |
| `.npmrc` | PNPM config |
| `vercel.json` | Vercel deployment overrides (cron, headers, functions) |
| `sst.config.ts` | SST config (optional AWS infra layer) |
| `instrumentation.ts` | Next.js instrumentation hook (Sentry init) |
| `sentry.client.config.ts` | Sentry browser SDK config |
| `proxy.ts` | Local dev proxy for API routing |
| `.env.example` | Template for all required environment variables |
| `.gitignore` | Ignores `.env.local`, `.next/`, `node_modules/` etc. |
| `SETUP.md` | Full local dev setup guide |
| `MIGRATION_TO_PNPM.md` | Notes on npm→pnpm migration |

## Top-Level Directories

| Directory | Role |
|---|---|
| `app/` | Next.js App Router — all pages, layouts, API routes |
| `components/` | Shared React UI components |
| `lib/` | Utilities, blockchain services, Supabase client, rate limiting |
| `server/` | Hono API server (runs inside Next.js or as standalone) |
| `styles/` | Global CSS, Tailwind base layer, design tokens |
| `types/` | Shared TypeScript type definitions |
| `scripts/` | Dev/ops scripts (e.g. seed token list) |
| `public/` | Static assets (favicon, manifest, icons) |
| `supabase/migrations/` | Ordered SQL migration files |
| `.github/workflows/` | GitHub Actions CI/CD pipelines |

## Key Dependencies (summary)

**Frontend:** `react 19`, `next 16`, `tailwindcss 4`, `@radix-ui/*`, `lucide-react`, `lightweight-charts`, `zustand`, `@tanstack/react-query`

**Backend/API:** `hono 4`, `@hono/node-server`, `@hono/zod-validator`, `zod`

**Auth/DB:** `@supabase/supabase-js`, `@supabase/ssr`, `jose` (JWT), `bcryptjs`

**Cache/Rate-limit:** `@upstash/redis`, `@upstash/ratelimit`

**Blockchain — EVM:** `ethers 6`, `alchemy-sdk`, `moralis`

**Blockchain — Non-EVM:** `bitcoinjs-lib`, `bip32`, `bip39`, `@solana/web3.js`, `@solana/spl-token`, `tronweb`, `xrpl`, `@ton/ton`, `stellar-sdk`, `near-api-js`, `tiny-secp256k1`, `ed25519-hd-key`

**Comms:** `africastalking` (SMS OTP), `resend` (email), `qrcode`

**Monitoring:** `@sentry/nextjs`

## Environment Variable Groups

See `.env.example` for full list. Groups:
- App / Node env
- Supabase (DB + auth)
- Upstash Redis (cache)
- JWT secret
- M-Pesa / Daraja (Safaricom)
- HD wallet seed (MASTER_SEED_PHRASE)
- Non-EVM hot wallet addresses (XRP, TON, XLM)
- Cron secret
- Per-chain RPC URLs (ETH, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche, Fantom, Linea, zkSync, Scroll, Mantle, Gnosis, Celo)
- Etherscan API key
- Forex (KES/USD rate)
- Africa's Talking
- Resend
- Sentry
- Admin email, internal secrets, sweep secret

## Scripts

```bash
pnpm dev           # Next.js dev server (turbopack)
pnpm dev:no-turbo  # Dev without turbopack
pnpm dev:server    # Hono server (node --watch)
pnpm build         # Production build
pnpm start         # Production start
pnpm lint          # ESLint
pnpm format        # Prettier
pnpm type-check    # tsc --noEmit
pnpm seed:tokens   # Seed token list into DB
pnpm reinstall     # Clean reinstall
pnpm clean         # Remove .next/
pnpm fresh         # clean + dev
```

## Deployment

- **Platform:** Vercel (project `kryptoke`, team `markcalebchomba-8368s-projects`)
- **Node version on Vercel:** 24.x
- **Trigger:** Push to `main` branch auto-deploys to production
- **Cron jobs:** Two jobs on cron-job.org hitting `/api/v1/cron/deposit-monitor` every 30 seconds with `X-Cron-Secret` header

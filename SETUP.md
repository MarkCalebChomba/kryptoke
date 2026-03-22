# KryptoKe — Setup Guide

## Quick Start

```bash
cd kryptoke
npm install          # installs all dependencies
npm run dev          # starts dev server on http://localhost:3000
```

## ⚠️ Node.js & npm version requirements

- **Node.js**: 18.x or 20.x LTS recommended
- **npm**: 9.x or 10.x

## ⚠️ Next.js version

This project uses **Next.js 14.2.29** with **Tailwind CSS 3.4.4**.

If you see this error:
```
Error: It looks like you're trying to use `tailwindcss` directly as a PostCSS plugin.
```

This means npm upgraded Next.js to v16 which changed PostCSS handling. Fix:

```bash
# Option 1 — Delete node_modules and reinstall with exact versions
rm -rf node_modules package-lock.json
npm install

# Option 2 — Force downgrade Next.js back to 14
npm install next@14.2.29 --save-exact

# Option 3 — Run without Turbopack (for Next 16 users)
npm run dev:no-turbo
```

## ⚠️ OneDrive / Network drive warning

Next.js will be very slow if run from OneDrive. Move the project to a local folder:
```
C:\Projects\kryptoke\    ✅ Fast
C:\Users\...\OneDrive\   ❌ Very slow — 742ms benchmark
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

The minimum required variables to get the app running locally:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
JWT_SECRET=any-long-random-string-64-chars-min
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

M-Pesa, blockchain, and email features require their respective keys but the app
will start and most UI will work without them.

## Database Setup

Run these migrations in order in the **Supabase SQL Editor**:

1. `supabase/migrations/000_quick_setup.sql`
2. `supabase/migrations/001_initial_schema.sql`
3. `supabase/migrations/002_rls_and_indexes.sql`
4. `supabase/migrations/003_multichain.sql`
5. `supabase/migrations/004_multichain_v2.sql`
6. `supabase/migrations/005_withdrawal_queue_and_fixes.sql`

## Non-EVM Blockchain Packages

The non-EVM chain services (Bitcoin, Solana, TRON, etc.) require packages that
are large and may take a few minutes to install:

```bash
npm install
```

If you get peer dependency errors:
```bash
npm install --legacy-peer-deps
```

## Cron Setup (deposit monitoring)

After deploying, create two jobs on [cron-job.org](https://cron-job.org):
- URL: `https://your-domain.com/api/v1/cron/deposit-monitor`  
- Method: POST  
- Header: `X-Cron-Secret: <your CRON_SECRET value>`  
- Schedule: Every minute at :00 and :30

## Deployment

```bash
npm run build   # creates production build
npm run start   # starts production server
```

For Vercel deployment, connect your GitHub repo. All environment variables
must be added to the Vercel project settings.

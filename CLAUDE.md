# KryptoKe — Agent Coordination Hub

> **PM:** APEX (this chat)
> **Last updated:** 2026-04-08
> **Rule:** Every agent reads this file first. Every agent updates their STATUS block when done.

---

## Repo & Access

```bash
git clone https://GITHUB_PAT@github.com/MarkCalebChomba/kryptoke.git kryptoke
cd kryptoke
git config user.email "deploy@kryptoke.com"
git config user.name "KryptoKe Deploy"
git remote set-url origin https://GITHUB_PAT@github.com/MarkCalebChomba/kryptoke.git
```
> Get the PAT from the owner (MarkCaleb). Scope: repo.

- **Vercel:** team_40DxLCjPjI7f3NbJH98NxANn / prj_pEbh4PPGJNmgRZVD3POLdrhSraAw
- **Live URL:** https://kryptoke-mu.vercel.app
- **Supabase project:** lrpicqpcevqkuxclufve (eu-west-1)
- **Admin panel:** https://kryptoke-mu.vercel.app/admin/login

---

## Stack Quick Reference

| Layer | Tech |
|---|---|
| Frontend | Next.js 16.2 (Turbopack), React 19, Tailwind, Zustand, TanStack Query |
| API | Hono 4.4.9 at `/api/v1/[...route]` |
| DB | Supabase (PostgreSQL 17.6) |
| Cache | Upstash Redis |
| Auth | Custom JWT, 7-day expiry, split across 2 localStorage keys |
| Deploy | Vercel (serverless) |
| SMS | Africa's Talking |
| Email | Resend |

---

## Agent Roster

| Agent | Chat Name | Domain | Priority |
|---|---|---|---|
| APEX | PM Chat (this) | Coordination, architecture decisions, task assignment | — |
| NEXUS | Financial Rails | M-Pesa deposit & withdrawal, Crypto deposit & withdrawal | CRITICAL |
| FORGE | Trading Engine | Spot trade, Futures, Convert | CRITICAL |
| SHIELD | Wallet & Security | Transfer/Send, RLS/balances, Supported crypto, Crypto deposit audit support | CRITICAL |
| PULSE | UX & Comms | Login/signup UX, Notifications (email + SMS), Onboarding, Support AI | HIGH |

---

## Communication Protocol

1. **No agent touches another agent's files without APEX approval.**
2. **Before starting a task:** read this file + the relevant `info.md` files in the folders you will touch.
3. **After completing a task:** update your STATUS block below, commit with message format `[AGENT] task description`, then push.
4. **Conflicts:** if you need a change in another agent's domain, leave a `# TODO(AGENT_NAME): ...` comment and tell APEX.
5. **Shared files** (`server/db/balances.ts`, `server/db/client.ts`, `types/index.ts`): always pull latest before editing, minimal changes, announce in STATUS.

---

## File Ownership Map

```
NEXUS owns:
  server/routes/mpesa.ts
  server/routes/withdraw.ts          (KES/M-Pesa sections)
  server/services/mpesa.ts
  server/services/blockchain.ts      (deposit scanning)
  server/services/nonEvm.ts
  server/services/bsc.ts
  server/jobs/sweep.ts
  server/jobs/b2c-recovery.ts
  app/(app)/deposit/page.tsx
  app/(app)/withdraw/page.tsx
  components/home/DepositSheet.tsx

FORGE owns:
  server/routes/trade.ts
  server/routes/futures.ts
  server/services/exchange.ts
  app/(app)/trade/page.tsx
  app/(app)/convert/page.tsx
  components/trade/

SHIELD owns:
  server/routes/wallet.ts
  server/middleware/auth.ts
  server/middleware/security.ts
  supabase/migrations/              (new migrations)
  server/db/balances.ts             (shared — announce changes)
  app/(app)/me/page.tsx
  app/(app)/assets/page.tsx
  components/home/AllocationTiles.tsx

PULSE owns:
  app/auth/
  server/routes/auth.ts
  server/routes/notifications.ts
  server/services/notifications.ts
  server/services/otp.ts
  app/(app)/notifications/page.tsx
  app/(app)/account/
  components/home/NotificationsSheet.tsx
  components/home/MenuSheet.tsx
```

---

## Master Task Board

### CRITICAL

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| 1 | M-Pesa deposit — end-to-end working | NEXUS | PENDING | STK push exists, callback IP fix pushed but not tested with real payment |
| 2 | Crypto deposit — audit & test all chains | NEXUS | PENDING | `server/services/blockchain.ts`, `bsc.ts`, `nonEvm.ts` — check sweep cron |
| 3 | M-Pesa withdrawal — audit & test B2C | NEXUS | PENDING | Route exists, untested. Need B2C env vars confirmed |
| 4 | Crypto withdrawal — audit & test | NEXUS | PENDING | Withdraw queue exists in `withdraw.ts`, needs full flow test |
| 5 | Spot trade — connect Binance/Gate.io/Bybit, UX overhaul | FORGE | DONE | exchange.ts spot layer, trade.ts rewritten, CEX routing live |
| 6 | Futures — connect 3 exchanges, UX overhaul | FORGE | DONE | OKX/Binance/Bybit routing, FuturesTab complete |
| 7 | Convert — handle locally (no external exchange) | FORGE | DONE | POST /trade/convert, 0.5% spread, internal balances |
| 8 | Supported crypto — expand list, RLS audit | SHIELD | PENDING | tokens table has 50 seeded — expand + chain_fees + RLS on balances |

### HIGH PRIORITY

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| 9 | Transfer/Send — audit, test, real-time feedback | SHIELD | PENDING | `wallet.ts` send route, `me/page.tsx` UI |
| 10 | Login/signup — Gate.io-style UX, fix broken states | PULSE | PENDING | `app/auth/` — phone+OTP flow broken in some states |
| 11 | Email notifications — Resend integration, manual triggers | PULSE | PENDING | `server/services/notifications.ts` + Resend key set |
| 12 | SMS notifications — Africa's Talking full setup | PULSE | PENDING | Key set in Vercel, service exists but not fully wired |
| 13 | Real-time feedback — user sees action result immediately | SHIELD + PULSE | PENDING | Supabase Realtime subscriptions on deposits, withdrawals, trades |

### LOW PRIORITY

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| 14 | Onboarding flow | PULSE | PENDING | Post-register wizard |
| 15 | Support AI | PULSE | PENDING | `server/routes/support.ts` — wire to Claude API |
| 16 | Management agents (n8n) | APEX | PENDING | External automation, post-launch |

---

## NEXUS — Task Brief

You are **NEXUS**, the Financial Rails agent for KryptoKe.

**Your mandate:** Make money move reliably. Every deposit and withdrawal must work, be logged, and give the user immediate feedback.

### Task 1: M-Pesa Deposit (CRITICAL — do first)
- File: `server/routes/mpesa.ts`, `server/services/mpesa.ts`
- The STK Push initiates correctly. The issue is callback handling.
- Check: IP allowlist logic — when `MPESA_ENVIRONMENT !== production`, callbacks must pass through.
- Check: The `/deposit/status/:checkoutId` polling endpoint — does it return correct state?
- Check: Does the user's KES balance actually update after a successful callback?
- Check: Is the deposit log (`deposit_logs` table) being written at every phase?
- Test flow: initiate → callback arrives → balance updates → frontend sees it.
- **Deliverable:** Working deposit with logs at every step. Add a `/deposit/test-callback` route (admin only, non-production) to simulate a callback.

### Task 2: Crypto Deposit
- Files: `server/services/blockchain.ts`, `server/services/bsc.ts`, `server/services/nonEvm.ts`, `server/jobs/sweep.ts`
- Audit each chain: BNB/BSC, TRON (USDT-TRC20), Solana, Bitcoin
- For each chain verify: (a) address generation is deterministic per user, (b) incoming tx detection works, (c) balance is credited, (d) ledger entry is created
- The sweep cron is at `server/jobs/sweep.ts` — check it covers all chains
- **Deliverable:** Audit report as comments at top of each service file + any fixes

### Task 3: M-Pesa Withdrawal (B2C)
- File: `server/routes/withdraw.ts` (KES section), `server/services/mpesa.ts` (initiateB2c)
- Need: `MPESA_B2C_SHORTCODE`, `MPESA_B2C_INITIATOR_NAME`, `MPESA_B2C_INITIATOR_PASSWORD` — check these are in env, add validation at startup
- Test: POST `/withdraw/kes` → B2C call → result callback → balance deducted + ledger entry
- Handle: timeout callback (funds must be re-credited if timeout occurs)
- **Deliverable:** Working withdrawal + recovery job in `server/jobs/b2c-recovery.ts`

### Task 4: Crypto Withdrawal
- File: `server/routes/withdraw.ts` (crypto section)
- Queue flow: `pending_cancel` (10min) → `queued` → `broadcasting` → `completed`
- Check: over $500 goes to `awaiting_admin` correctly
- Check: fee deduction, ledger entry, user notification
- **Deliverable:** Full queue flow working, admin can approve/reject large withdrawals

### Start command:
```
I am NEXUS. My job is Financial Rails for KryptoKe. I will read CLAUDE.md, then server/routes/mpesa.ts, server/services/mpesa.ts, and start with Task 1: M-Pesa deposit end-to-end.
```

---

## FORGE — Task Brief

You are **FORGE**, the Trading Engine agent for KryptoKe.

**Your mandate:** Make trading work and feel good. Connect real exchanges, make the UI clear enough that a first-time Kenyan crypto user can trade confidently.

### Task 5: Spot Trading
- File: `server/routes/trade.ts`, `server/services/exchange.ts`, `app/(app)/trade/page.tsx`, `components/trade/`
- Connect 3 exchanges: **Binance, Gate.io, Bybit** — use their REST APIs for order routing
- Exchange service should: get best price across exchanges, route order to best exchange, return unified response
- UI reference: Gate.io mobile — clean pair selector, big buy/sell buttons, clear price + KES equivalent shown
- KES equivalent must always be visible (use forex rate from `server/services/forex.ts`)
- Order types to support: Market, Limit
- **Deliverable:** User can buy/sell BTC, ETH, USDT with KES. Price shown in both USD and KES.

### Task 6: Futures Trading
- File: `server/routes/futures.ts`, `app/(app)/trade/page.tsx` (futures tab)
- Connect: Binance Futures, Bybit Perpetual, Gate.io Futures
- Leverage selection: 1x–20x with clear risk warning
- Show: liquidation price, margin required, PnL in KES
- **Deliverable:** Open/close futures positions. Positions visible on page.

### Task 7: Convert (Internal)
- File: `app/(app)/convert/page.tsx`, `components/trade/ConvertTab.tsx`
- Do NOT route to external exchanges. Handle internally:
  - User has USDT, wants BTC → deduct USDT, credit BTC at current market price + 0.5% spread
  - All conversions go through internal balances (`server/db/balances.ts`)
  - Create ledger entries for both sides
- UI: simple "from / to" selector, show rate, show fee, confirm button
- **Deliverable:** Internal swap working for any supported pair. Ledger entries created.

### Start command:
```
I am FORGE. My job is the Trading Engine for KryptoKe. I will read CLAUDE.md, then server/routes/trade.ts, server/services/exchange.ts, and start with Task 5: Spot trading with 3 exchanges.
```

---

## SHIELD — Task Brief

You are **SHIELD**, the Wallet & Security agent for KryptoKe.

**Your mandate:** Make balances accurate, transfers reliable, and data secure. Users must see their correct balance at all times.

### Task 8: Supported Crypto + RLS
- Tables: `tokens`, `chain_fees`, `balances`
- Expand token list if needed — each token needs: symbol, name, logo_url, contract addresses per chain, CoinGecko ID
- RLS audit on `balances` table — critical: users must only see their own rows. Current policy: `uid = auth.uid()`. Verify this works with the custom JWT (not Supabase Auth JWT).
- **Important:** The app uses custom JWT, not Supabase Auth. RLS policies that rely on `auth.uid()` will NOT work — they need to use `current_setting('app.user_id')` set via a DB function. Audit and fix.
- **Deliverable:** RLS working correctly with custom JWT. Migration file in `supabase/migrations/`.

### Task 9: Transfer/Send
- File: `server/routes/wallet.ts` (send section), `app/(app)/me/page.tsx`
- Audit the send flow: internal transfer (KryptoKe user to user) vs external (crypto withdrawal to external wallet)
- Internal transfers must: deduct sender, credit receiver, create ledger entries for both, send notifications to both
- External: goes through the withdrawal queue (coordinate with NEXUS on interface)
- UI: `me/page.tsx` — Transfer button should open a modal with address input + amount, show fee, confirm
- Real-time: after transfer, both parties' balances should update via Supabase Realtime
- **Deliverable:** Internal transfers working with ledger entries + notifications.

### Task 13 (shared): Real-time balance feedback
- Subscribe to Supabase Realtime on `balances` and `deposits` tables for the current user
- When balance changes (deposit confirmed, trade fills, transfer received), update UI immediately without page refresh
- Use existing Zustand stores — add a `subscribeToBalances(uid)` action
- **Deliverable:** Balance card on home page updates live.

### Start command:
```
I am SHIELD. My job is Wallet & Security for KryptoKe. I will read CLAUDE.md, then supabase/migrations/, server/db/balances.ts, and start with Task 8: RLS audit and fix for custom JWT.
```

---

## PULSE — Task Brief

You are **PULSE**, the UX & Communications agent for KryptoKe.

**Your mandate:** Make the app easy to enter and keep users informed. Fix auth flow, set up notifications, build onboarding.

### Task 10: Login/Signup UX
- Files: `app/auth/login/page.tsx`, `app/auth/register/page.tsx`, `components/auth/`
- Reference: Gate.io mobile login — phone field prominent, OTP inline, no page redirects mid-flow
- Issues to fix: form state not resetting on error, OTP input focus management, "Move to Trade" button after login should go to `/trade`
- Register: add referral code field (optional), connect to `server/routes/referral.ts`
- Both pages should work offline-first (show cached balance if available)
- **Deliverable:** Login and register work without errors on first try.

### Task 11: Email Notifications
- File: `server/services/notifications.ts`, key: `RESEND_API_KEY` (set in Vercel)
- Events to email: deposit confirmed, withdrawal initiated, withdrawal completed, login from new device, large trade (>$100)
- Use Resend's API — keep templates simple (no heavy HTML, works on mobile email clients)
- Add an admin route `POST /admin/notifications/send` to manually send to a user (for support)
- **Deliverable:** Emails sending for all key events. Manual send from admin panel.

### Task 12: SMS Notifications (Africa's Talking)
- File: `server/services/notifications.ts`, `server/routes/notifications.ts`, key: `AFRICASTALKING_API_KEY` (set in Vercel)
- SMS events: deposit confirmed (KES received), withdrawal sent, OTP
- Keep SMS short — under 160 chars
- Respect user preferences (check `notifications` table for opt-out)
- **Deliverable:** SMS sending for deposit confirmed + withdrawal sent.

### Task 14: Onboarding (Low priority — after 10/11/12)
- Post-register: 3-step wizard (deposit KES → buy crypto → set up PIN)
- Skip button available
- Show only once (track in `system_config` or user metadata)

### Start command:
```
I am PULSE. My job is UX & Communications for KryptoKe. I will read CLAUDE.md, then app/auth/, server/services/notifications.ts, and start with Task 10: Login/signup UX fix.
```

---

## Agent STATUS Blocks

Update this section when you complete or start a task. Format:
```
[AGENT] [DATE] [TASK #] STATUS — brief note
```

```
# NEXUS STATUS
[NEXUS] 2026-04-08 Task 1 IN PROGRESS — M-Pesa deposit audit complete + fixes applied.
  Fixes:
  1. server/middleware/security.ts — safaricomIpGuard: removed dead NODE_ENV outer check,
     logic now driven solely by MPESA_ENVIRONMENT (sandbox = allow all, production = enforce IP list)
  2. server/routes/mpesa.ts — processCallback: atomic 'completing' status claim before balance write
     prevents double-credit on concurrent Safaricom callback retries
  3. server/routes/mpesa.ts — /status/:txId polling: same atomic claim fix applied
  4. server/routes/mpesa.ts — POST /test-callback added (admin-only, blocked in production MPESA_ENVIRONMENT)
  5. server/jobs/b2c-recovery.ts — recoverStuckCompletingDeposits() added: resets deposits
     stuck in 'completing' > 5min back to 'processing' for retry
  6. supabase/migrations/012_deposit_completing_status.sql — adds 'completing' to status CHECK
     constraint on deposits table + index + updated_at trigger
  PENDING: Migration 012 needs to be applied to Supabase before deploying.
  PENDING: Confirm KES balance tracking intent — deposits credit USDT only, KES balance never written.
  PENDING: Env vars to verify in Vercel: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET,
           MPESA_PAYBILL, MPESA_PASSKEY, MPESA_CALLBACK_BASE_URL, MPESA_ENVIRONMENT

[NEXUS] 2026-04-08 Task 2 DONE — Crypto deposit scanning audited and fixed.
  Fixes:
  1. nonEvm.ts — TRON scanner: integer division precision bug fixed (toFixed(6))
  2. nonEvm.ts — XRP DestinationTag matching was completely broken (decimal string vs hex).
     Fixed: uint32 numeric comparison using parseInt(uid_hex_8, 16) >>> 0
     Added: xrpDestinationTagForUser() — deposit UI MUST use this to show correct tag to user
  3. nonEvm.ts — creditCryptoDeposit: replaced parseFloat addition with Big.js
  4. sweep.ts — Complete rewrite: now covers BSC+ETH+Polygon+Arbitrum+Optimism+Base
     Uses MASTER_SEED_PHRASE HD derivation (removed HOT_WALLET_KEY dependency)
     Calls recoverStuckCompletingDeposits() after every sweep run
  5. deposit-monitor/route.ts — Added scanEvmDeposits(): scans all users on all active EVM
     chains via Etherscan V2, credits balance on new USDT/USDC transfers

[NEXUS] 2026-04-08 Task 3 DONE — B2C withdrawal recovery hardened.
  Fixes:
  1. withdraw.ts — /b2c/timeout now marks withdrawal 'timed_out' immediately (was silent)
  2. withdraw.ts — processB2cResult accepts 'timed_out' status so late callbacks still complete
  3. b2c-recovery.ts — recovers both 'processing' and 'timed_out' statuses
     Also covers 'mpesa_usdt' type (was kes-only)
  PENDING: Env vars to confirm in Vercel:
    MPESA_B2C_SHORTCODE, MPESA_B2C_INITIATOR_NAME, MPESA_B2C_INITIATOR_PASSWORD

[NEXUS] 2026-04-08 Task 4 DONE — Crypto withdrawal queue audited.
  Fixes:
  1. deposit-monitor/route.ts — processWithdrawalQueue refund uses Big.js (was parseFloat)
  Confirmed working: pending_cancel→queued→broadcasting→completed flow, admin approve/reject,
  awaiting_admin email alerts, per-chain fee deduction, ledger entries.

[NEXUS] 2026-04-08 Migration 013 added:
  - 'timed_out' added to withdrawals status CHECK
  - scanner_state table created (for XRP/TON/Stellar block position)
  - crypto_deposits.chain_id ensured as TEXT
  - Composite unique index on (tx_hash, chain_id)
  - updated_at trigger on withdrawals
  REQUIRES: Apply migration 013 to Supabase before deploying.
  REQUIRES: ETHERSCAN_API_KEY in Vercel for EVM deposit scanning to work.

[NEXUS] 2026-04-08 Wave 2 N-B DONE — Dynamic address screening with live OFAC sync.
  server/services/addressScreening.ts — full rewrite:
    Layered pipeline: Redis hot-cache → DB → layering heuristic → TRM → Chainalysis → AMLBot
    Layering heuristic: same from-address credited to 3+ accounts in 24h = blocked
    Any external API hit auto-persisted to DB + Redis (future checks instant, no API call)
    invalidateScreeningCache() called immediately when admin adds/removes an address
  app/api/v1/cron/sync-blocklist/route.ts — new daily cron:
    Pulls OFAC SDN XML (official US Treasury feed, 1000+ addresses, updated weekly)
    Two fallback OFAC URLs for resilience
    Pulls community GitHub sanction + mixer lists (ETH sanctions, NiceHash mixer list)
    Batch upserts 200 rows at a time; idempotent (ON CONFLICT DO NOTHING)
    POST /api/v1/cron/sync-blocklist (CRON_SECRET header)
    Schedule: daily 02:00 UTC on cron-job.org
  admin/index.ts additions:
    POST /admin/blocked-addresses/sync  — manual trigger (fires in background)
    GET  /admin/blocked-addresses       — list with risk_level + search filters
    POST /admin/blocked-addresses       — add address, busts Redis cache immediately
    DELETE /admin/blocked-addresses/:id — remove address, busts cache
    GET  /admin/compliance/alerts       — list compliance alerts by status
    PATCH /admin/compliance/alerts/:id  — mark reviewed/closed
  supabase/migrations/018_aml_tables.sql — static seed REMOVED:
    No hardcoded addresses in migration — DB populated by sync-blocklist cron
    Run sync immediately after migration: POST /api/v1/cron/sync-blocklist
  Optional env vars to add in Vercel for richer external screening:
    TRM_API_KEY, CHAINALYSIS_API_KEY, AMLBOT_API_KEY

[NEXUS] 2026-04-08 Wave 2 N-A DONE — Payment provider registry + public config endpoint.
  server/services/paymentProviders.ts:
    PAYMENT_PROVIDERS: M-Pesa(KE/active), Airtel Money(KE), MTN MoMo(GH),
    Vodafone Cash(GH), Bank Transfer(NG), MTN UG, M-Pesa TZ, EFT ZA, Card Global
    getActiveProvidersForCountry(), getProviderById(), validateProvider()
  server/routes/config.ts — new public route (no auth, bypasses maintenance mode):
    GET /api/v1/config/payment-methods?country=KE
    GET /api/v1/config/countries
  server/index.ts — config routes mounted + /config/ added to maintenance bypass
  mpesa.ts — deposit accepts optional provider_id, validates active + country match
  withdraw.ts — /kes withdrawal accepts optional provider_id
  deposit/page.tsx — fetches payment-methods for user's country, shows 'coming soon'
    banner for countries with no active fiat provider
  supabase/migrations/015_payment_provider_column.sql:
    provider_id TEXT DEFAULT 'mpesa' added to deposits + withdrawals tables
  REQUIRES: Apply migrations 013, 015, 018 to Supabase before deploying.
  To populate blocklist after migration 018: POST /api/v1/cron/sync-blocklist

# FORGE STATUS
[FORGE] 2026-04-08 Task 5 DONE — Spot trading live on Binance/Gate.io/Bybit.
  server/services/exchange.ts — added full spot layer:
    getBestSpotPrice(): public price feed, tries Binance→Gate.io→Bybit
    routeSpotOrder(): executes via exchange_keys table, auto-fallback
    binancePlaceSpotOrder / gatePlaceSpotOrder / bybitPlaceSpotOrder
  server/routes/trade.ts — full rewrite:
    POST /quote: live CEX price + KES equiv + 0.3% spread
    POST /submit: instant CEX execution, balance debit/credit, ledger entries
    GET /price/:symbol: quick price check
  PREREQ: exchange_keys table must have at least one active Binance/Gate.io/Bybit key
          (add via Admin → Settings, exchange column must be 'binance'|'gateio'|'bybit')

[FORGE] 2026-04-08 Task 6 DONE — Futures already fully implemented (confirmed).
  server/routes/futures.ts: open/close/positions/summary/tp-sl all working
  server/services/exchange.ts: OKX primary + Binance/Bybit fallback routing
  components/trade/FuturesTab.tsx: full UI with leverage selector, TP/SL, positions list

[FORGE] 2026-04-08 Task 7 DONE — Internal convert working with 0.5% spread.
  server/routes/trade.ts: POST /trade/convert
    Pure internal swap using getBestSpotPrice for both sides
    0.5% spread, dual ledger entries, fulfillment_type: 'internal'
  app/(app)/convert/page.tsx: rewritten to call /trade/convert directly
  lib/hooks/useTrades.ts: useConvert() mutation hook added

[FORGE] 2026-04-08 Migration 014 added:
  supabase/migrations/014_trades_spot_and_convert.sql
  - Adds exchange_order_id, exchange_name, note, updated_at to trades table
  - Extends status CHECK: adds 'executing'
  - Extends fulfillment_type CHECK: adds 'exchange', 'internal'
  REQUIRES: Apply migration 014 to Supabase before deploying

[FORGE] 2026-04-13 Wave 2 F-A DONE — Home page All Markets token list.
  server/routes/market.ts: /home endpoint now returns marketList (top 50, DB+Redis)
  lib/hooks/useMarketData.ts: MarketListCoin type + marketList in HomeData
  app/(app)/page.tsx: AllMarkets vertical list, 56px rows, sparkline, tap→/markets/[sym]

[FORGE] 2026-04-13 Wave 2 F-B DONE — Token list expanded to 200.
  server/jobs/prices.ts: CoinGecko parallel page 1+2 fetch (200 tokens total)
  app/(app)/markets/page.tsx: PAGE_SIZE=50, FETCH_LIMIT=200, client-side cache+slice
  components/home/MarketList.tsx: LIST_PAGE_SIZE=50, Load More button
  scripts/seed-tokens.mts: production run comment added

[FORGE] 2026-04-13 Wave 2 F-C DONE — Gamification (XP, levels, badges, leaderboard).
  supabase/migrations/017_gamification.sql: tables + views + RLS
    user_xp_events, user_badges, user_levels view
    xp_leaderboard_weekly/alltime views
  server/services/gamify.ts: awardXp, awardBadge, getUserLevel, getLeaderboard, getUserRank
    14 badge definitions, Platinum/Diamond 10% fee discount
  XP integrations (all fire-and-forget):
    trade.ts: +10 XP/trade + fee discount for Platinum/Diamond
    mpesa.ts: +200 XP + first_deposit badge on first M-Pesa deposit
    p2p.ts:   +25 XP seller, +15 XP buyer on crypto release
    auth.ts:  +150 XP to referrer on referee registration
  REQUIRES: Apply migration 017_gamification.sql to Supabase

# SHIELD STATUS
[SHIELD] [2026-04-08] Task 8 DONE — Migration 012_rls_custom_jwt.sql: replaced all auth.uid() RLS policies with get_app_uid() that reads request.jwt.claims->>'uid'. Added .setSubject(uid) to JWT. PREREQ: Supabase JWT secret must match JWT_SECRET in Vercel env.
[SHIELD] [2026-04-08] Task 9 DONE — transfer-to-user: added Redis advisory lock (prevents double-spend race), recipient wallet cache bust, in-app notification INSERT for recipient. Fixed P2PSheet canSend bug (was always checking usdtBalance even for KES transfers).
[SHIELD] [2026-04-08] Task 13 DONE — useRealtimeBalances hook: subscribes to balances+notifications tables via Supabase Realtime, updates Zustand store live. useSupabaseSession injects custom JWT into Supabase browser client. Both wired into AppLayout via AuthenticatedShell.
[SHIELD] [2026-04-08] Known Issue #5 DONE — Extracted P2PSheet into components/home/P2PSheet.tsx. Added Send quick action to home page (replaced duplicate Convert shortcut). Users can send USDT/KES directly from home screen.
[SHIELD] [2026-04-08] Known Issue #1 DONE — JWT revocation implemented. verifyJwt() checks Redis blocklist on every auth. revokeJwt() export for incident response. POST /logout now kills token immediately. To revoke the exposed HAR token: call revokeJwt(token) from any server context.
[SHIELD] [2026-04-08] S-A DONE — Financial RLS lockdown (migration 019_rls_lockdown.sql).
  balances was FOR ALL — now SELECT only. All financial tables read-only for clients.
  withdrawal_whitelist/notifications/kyc/alerts have appropriate write policies.
  Realtime publication confirmed for balances, deposits, withdrawals, notifications.
[SHIELD] [2026-04-08] S-B DONE — AML behavioral scoring (migration 020_aml_scores.sql).
  server/jobs/anomaly.ts: full rewrite — 10 signals, auto-suspend at score>=81, admin alerts.
  app/api/v1/cron/aml-score/route.ts: CRON_SECRET protected endpoint, register every 4h.
  server/routes/withdraw.ts: AML check on both /kes and /crypto before queuing.
  app/admin/compliance/page.tsx + 5 admin API endpoints: full compliance dashboard.
  lib/supabase/types.ts: added compliance_alerts, aml_risk_scores, compliance_actions, blocked_addresses.
  PENDING: Apply migrations 019 then 020 to Supabase. Register cron. Set CRON_SECRET in Vercel.

# PULSE STATUS
[PULSE] 2026-04-08 Task 10 DONE — Login/Signup UX fixes applied.
  Fixes:
  1. app/auth/login/page.tsx — router.replace("/") → router.replace("/trade") post-login
  2. app/auth/login/page.tsx — general error banner clears on next keystroke (email/password onChange)
  3. app/auth/register/page.tsx — optional referral code field added (auto-uppercase, wired to POST /auth/register)
  4. server/routes/auth.ts — registerSchema accepts optional referralCode; fire-and-forget referral DB insert
     after user creation (looks up referrer by referral_code, inserts into referrals table)

[PULSE] 2026-04-08 Task 11 DONE — Email notifications via Resend fully wired.
  Events emailing: deposit_confirmed, withdrawal_initiated, withdrawal_sent, withdrawal_completed (crypto),
  new_device_login, large_trade (>$100), security_alert.
  server/services/notifications.ts — all Notifications.* methods now async; each fetches user contact
  (email, phone, notification_email pref) and calls sendEmail() after the in-app DB insert.
  sendEmail() exported for direct use. Mobile-friendly dark HTML templates, no heavy CSS frameworks.
  server/routes/notifications.ts — POST /admin/notifications/send added (adminMiddleware protected):
  accepts { uid, channel: email|sms|both, subject?, message }, looks up user contact, dispatches.

[PULSE] 2026-04-08 Task 12 DONE — SMS notifications via Africa's Talking wired.
  Events sending SMS: deposit_confirmed, withdrawal_sent (M-Pesa B2C complete).
  sendSms() in notifications.ts enforces 160-char limit, handles E.164 normalization,
  respects AFRICASTALKING_SENDER_ID env var (omitted for sandbox).
  User opt-out respected via notification_sms column (defaults true if column absent).
  server/routes/auth.ts — login handler now detects new-device logins (IP not seen before)
  and fires Notifications.newDeviceLogin() with email alert (fire-and-forget, non-fatal).

  PREREQS for all tasks:
  - RESEND_API_KEY must be set in Vercel (already confirmed set)
  - RESEND_FROM_EMAIL should be set (defaults to noreply@kryptoke.com)
  - AFRICASTALKING_USERNAME + AFRICASTALKING_API_KEY must be set in Vercel
  - Optional: AFRICASTALKING_SENDER_ID (pre-approved with AT before adding)
  - Optional: add notification_email BOOLEAN DEFAULT true and notification_sms BOOLEAN DEFAULT true
    columns to users table — notifications gracefully default to ON if columns missing

[PULSE] 2026-04-13 Task P-A DONE — International UX.
  1. lib/utils/currency.ts — 40-country map, getCurrencyForCountry(), formatFiat(), COUNTRY_OPTIONS[]
  2. supabase/migrations/015_users_country_code.sql — country_code TEXT DEFAULT 'KE' on users
  3. lib/supabase/types.ts + types/index.ts — country_code added to Row/Insert/Update/User
  4. server/routes/auth.ts — register accepts countryCode, stores to DB; toApiUser maps it;
     profile PATCH exposes countryCode for user-settings updates
  5. app/auth/register/page.tsx — country <select> with 40 options (flag + name), defaults KE
  6. components/home/PortfolioCard.tsx — KSh for KE; USD with local-currency note for non-KE;
     TODO(NEXUS) comment for when N-A forex rates land
  7. app/(app)/page.tsx — passes countryCode + kesPerUsd to PortfolioCard
  8. app/(app)/deposit/page.tsx — calls GET /config/payment-methods?country=XX (silent fallback);
     shows coming-soon banner + switch-to-crypto CTA for non-KE users

[PULSE] 2026-04-13 Task P-B DONE — P2P UX full rebuild.
  app/(app)/p2p/page.tsx — complete rewrite with:
  * Browse tab: Buy/Sell toggle, asset filter (USDT/BTC/ETH), fiat filter (KES/NGN/GHS/USD),
    payment method filter, ad cards with merchant reputation row
  * OrderSheet: escrow notice banner, amount input with live crypto equivalent, 30-min countdown
    timer (urgent red <5min), payment instructions, InOrderChat (Supabase Realtime on
    p2p_messages), I-have-paid CTA, dispute form (after payment sent, POST /orders/:id/dispute)
  * ReputationSheet: merchant avatar, stats grid (completion/trades/avg-release), star rating,
    payment methods, trade terms — opens on tapping merchant name
  * My Orders tab: status badges, countdown for pending orders, tap to reopen detail+chat
  * My Ads tab: active/paused toggle switch (POST /ads/:id/pause|activate), Post New Ad button
  * CreateAdSheet: type/asset/fiat/price/amount/min-max/methods/terms, POST /p2p/ads

  server/routes/p2p.ts:
  * POST /orders/:id/messages — party-only chat insert
  * POST /ads/:id/pause + /ads/:id/activate — toggle ad status

  supabase/migrations/016_p2p_messages.sql:
  * p2p_messages table with RLS (get_app_uid() party check) + Realtime publication
```

---

## Known Issues (from last session)

1. Old JWT from security audit HAR — expires 2026-04-11. Revoke: write `revoked_token:{last20chars}` to Redis with 7-day TTL.
2. Deposit callback IP guard fix pushed, not yet tested end-to-end with real payment.
3. B2C env vars need confirmation: `MPESA_B2C_SHORTCODE`, `MPESA_B2C_INITIATOR_NAME`, `MPESA_B2C_INITIATOR_PASSWORD`.
4. LightweightChart uses Binance klines — blocked on Vercel for non-Binance coins. TradingView widget is the fallback (already works for all 50 tokens).
5. UI patch from last session (balance card buttons, assets page buttons, home transfer button) — was generated but not confirmed pushed. SHIELD should verify.

---

## Git Commit Convention

```
[NEXUS] fix: mpesa callback IP guard + deposit status polling
[FORGE] feat: binance + gateio spot order routing
[SHIELD] fix: RLS policies for custom JWT auth
[PULSE] feat: resend email notifications for deposits
[APEX] chore: update CLAUDE.md task board
```

Always push to `main`. Vercel auto-deploys on push.

---


---

## WAVE 2 — Task Distribution (2026-04-08)

All tasks go to the existing four agents. Pull latest, read CLAUDE.md, find your tasks below.

---

### NEXUS — Wave 2

#### N-A: Payment Provider Registry (HIGH)

Create `server/services/paymentProviders.ts` — a registry of fiat payment methods per country:

```ts
type PaymentProvider = {
  id: string; name: string; type: 'mobile_money' | 'bank_transfer' | 'card'
  countries: string[]; currencies: string[]; minAmount: number; maxAmount: number
  feePercent: number; flatFee: number; active: boolean
}
export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  { id: 'mpesa', name: 'M-Pesa', type: 'mobile_money', countries: ['KE'], currencies: ['KES'], minAmount: 10, maxAmount: 300000, feePercent: 0, flatFee: 0, active: true },
  { id: 'airtel_ke', name: 'Airtel Money', type: 'mobile_money', countries: ['KE'], currencies: ['KES'], minAmount: 10, maxAmount: 100000, feePercent: 0, flatFee: 0, active: false },
  { id: 'mtn_gh', name: 'MTN MoMo', type: 'mobile_money', countries: ['GH'], currencies: ['GHS'], minAmount: 1, maxAmount: 5000, feePercent: 0, flatFee: 0, active: false },
  { id: 'card_global', name: 'Visa/Mastercard', type: 'card', countries: ['*'], currencies: ['USD','EUR','GBP'], minAmount: 10, maxAmount: 10000, feePercent: 2.9, flatFee: 0.30, active: false },
]
export function getActiveProvidersForCountry(countryCode: string): PaymentProvider[]
export function getProviderById(id: string): PaymentProvider | undefined
```

Add public endpoint `GET /api/v1/config/payment-methods?country=KE` — returns active providers for that country. No auth required.

Add `provider_id TEXT DEFAULT 'mpesa'` column to `deposits` and `withdrawals` tables — migration `015_payment_provider_column.sql`.

Accept optional `provider_id` in deposit and withdrawal request bodies. Validate it exists and is active for the user's country. Default to `mpesa` if not provided. M-Pesa flow unchanged — you are adding routing above it.

#### N-B: Blockchain Address Screening (CRITICAL — must be done before international launch)

Create `server/services/addressScreening.ts`:

```ts
export async function checkAddress(address: string, chain: string): Promise<{
  blocked: boolean
  riskLevel: 'sanctions' | 'high_risk' | 'darknet' | 'mixer' | null
  source: string | null
}>
```

Logic: check `blocked_addresses` table first. If `CHAINALYSIS_API_KEY` env var is set, also call their free community API as secondary check. Return immediately on first match.

Wire into `server/jobs/sweep.ts`: before crediting any crypto deposit, call `checkAddress(senderAddress, chain)`. If blocked: set deposit status `blocked`, insert into `compliance_alerts`, notify admin email. Do NOT credit user.

Wire into `server/routes/withdraw.ts` crypto section: check destination address before queuing. If blocked: return 403 with generic `"Withdrawal unavailable"` — never reveal why.

Admin endpoint `POST /admin/blocked-addresses` — manually add an address (adminMiddleware protected).

Migration `018_aml_tables.sql`:
```sql
CREATE TABLE blocked_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  chain TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('sanctions','high_risk','darknet','mixer')),
  source TEXT NOT NULL,
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by_uid UUID REFERENCES users(uid)
);
CREATE UNIQUE INDEX ON blocked_addresses (lower(address), chain);

CREATE TABLE compliance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid UUID REFERENCES users(uid),
  alert_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by_uid UUID REFERENCES users(uid),
  reviewed_at TIMESTAMPTZ
);
ALTER TABLE blocked_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON blocked_addresses USING (false);
CREATE POLICY "admin_only" ON compliance_alerts USING (false);
```

Seed 20 known sanctioned addresses from the public OFAC SDN crypto list as initial data.

---

### FORGE — Wave 2

#### F-A: Home Page Token List (HIGH)

File: `app/(app)/page.tsx`

Below the existing horizontal coin tiles strip, add a vertical "All Markets" token list showing top 50 tokens. Place it between the Markets strip and the EventsCalendar. Structure:

```
[existing coin tiles strip — horizontal scroll]
─────────────────────────────────────────────
All Markets                        See all →
─────────────────────────────────────────────
[token row] BTC logo | Bitcoin  BTC | sparkline | $94,200 | +2.4%
[token row] ETH logo | Ethereum ETH | sparkline | $3,180  | -0.8%
... top 50 rows
─────────────────────────────────────────────
[EventsCalendar — existing]
```

Each row: 56px height. Left: 24px logo circle + symbol (bold 13px) + name (muted 11px). Center: 40px mini sparkline (reuse TileSparkline). Right: price (bold, tabular-nums) + 24h change pill (green/red). Tap → `/markets/[symbol]`.

Use data already returned by `useHomeData` — extend it to include top 50 tokens sorted by rank. No new API endpoint needed if the price data is already fetched. If `useHomeData` only returns 5 coins currently, extend it to return 50.

#### F-B: Token List to 200 (MEDIUM)

1. `server/jobs/prices.ts` — if the WebSocket stream only covers top 50 symbols, expand: stream top 100 from Binance WS, fetch ranks 101–200 via REST every 60s.
2. `app/api/v1/cron/prices/route.ts` — same expansion.
3. `GET /api/v1/tokens` — ensure `?limit=200` works and returns all 200 with latest price from Redis.
4. `app/(app)/markets/page.tsx` — load all 200, show 50 at a time with "Load more" button.
5. `components/home/MarketList.tsx` — same pagination.
6. Add a comment at top of `scripts/seed-tokens.mts`: "Run once against production with pnpm seed:tokens — all 200 tokens defined here."

#### F-C: Gamification — XP, Levels, Badges, Leaderboard (MEDIUM)

Migration `017_gamification.sql`:
```sql
CREATE TABLE user_xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid UUID NOT NULL REFERENCES users(uid),
  event_type TEXT NOT NULL,
  xp INT NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON user_xp_events (uid, created_at);

CREATE TABLE user_badges (
  uid UUID NOT NULL REFERENCES users(uid),
  badge_id TEXT NOT NULL,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (uid, badge_id)
);

CREATE OR REPLACE VIEW user_levels AS
SELECT uid, SUM(xp) AS total_xp,
  CASE
    WHEN SUM(xp) >= 50000 THEN 'Diamond'
    WHEN SUM(xp) >= 10000 THEN 'Platinum'
    WHEN SUM(xp) >= 2000  THEN 'Gold'
    WHEN SUM(xp) >= 500   THEN 'Silver'
    ELSE 'Bronze'
  END AS level
FROM user_xp_events GROUP BY uid;

ALTER TABLE user_xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_own" ON user_xp_events FOR SELECT USING (get_app_uid() = uid);
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_own" ON user_badges FOR SELECT USING (get_app_uid() = uid);
```

Create `server/services/gamify.ts`:
- `awardXp(uid, eventType, xp, referenceId?)` — insert into user_xp_events, then check if new level reached and award level-up badge
- `awardBadge(uid, badgeId)` — upsert into user_badges (ignore duplicate)
- `getUserLevel(uid)` — query user_levels view, return level + xp + xpToNext

XP award integrations — add `awardXp(...)` call (fire-and-forget, non-fatal) after each event:

| Where | Event | XP |
|---|---|---|
| `server/routes/mpesa.ts` — deposit callback credited | `first_deposit` (only if first) | 200 |
| `server/routes/trade.ts` — trade filled | `first_trade` (only if first) / `trade_completed` | 100 / 10 |
| `server/routes/p2p.ts` — order completed | `p2p_seller` / `p2p_buyer` | 25 / 15 |
| `server/routes/admin/index.ts` — KYC approved | `kyc_verified` | 500 |
| `server/routes/referral.ts` — referral KYC done | `referral_kyc` | 150 |

Fee discount: in `server/routes/trade.ts`, before fee calculation, call `getUserLevel(uid)`. If `Platinum` or `Diamond`, multiply platform fee by 0.9.

Endpoints:
- `GET /api/v1/gamify/me` → `{ level, totalXp, xpToNext, badges, rankWeekly, rankAlltime }`
- `GET /api/v1/gamify/leaderboard?period=weekly|alltime` → top 100 by XP, display_name only

UI — fill `app/(app)/rewards/page.tsx`:
- XP progress bar to next level with level name and color
- Badge grid: earned badges colored, locked ones greyed with lock icon
- Leaderboard tab: weekly / all-time toggle, show current user rank even if outside top 100
- Referral stats card

After trade or P2P completion: show `Confetti` component + "+XP" toast using existing toast system.

---

### SHIELD — Wave 2

#### S-A: Financial RLS Lockdown (CRITICAL — do first)

Migration `019_rls_lockdown.sql` — strip all write access from financial tables at DB level. Client can only read own rows. Server (service role) bypasses RLS entirely as before.

```sql
-- balances: read own only, no client writes ever
DROP POLICY IF EXISTS "balances_own" ON balances;
CREATE POLICY "balances_read_own" ON balances
  FOR SELECT USING (get_app_uid() = uid);

-- trades: read own only
DROP POLICY IF EXISTS "trades_own" ON trades;
CREATE POLICY "trades_read_own" ON trades
  FOR SELECT USING (get_app_uid() = uid);

-- ledger_entries: read own only
DROP POLICY IF EXISTS "ledger_own" ON ledger_entries;
CREATE POLICY "ledger_read_own" ON ledger_entries
  FOR SELECT USING (get_app_uid() = uid);

-- deposits: read own only
DROP POLICY IF EXISTS "deposits_own" ON deposits;
CREATE POLICY "deposits_read_own" ON deposits
  FOR SELECT USING (get_app_uid() = uid);

-- withdrawals: read own only
DROP POLICY IF EXISTS "withdrawals_own" ON withdrawals;
CREATE POLICY "withdrawals_read_own" ON withdrawals
  FOR SELECT USING (get_app_uid() = uid);

-- users: read own. Update ONLY safe display columns.
DROP POLICY IF EXISTS "users_own_read" ON users;
DROP POLICY IF EXISTS "users_update_safe_columns" ON users;
CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (get_app_uid() = uid);
CREATE POLICY "users_update_display_only" ON users
  FOR UPDATE USING (get_app_uid() = uid)
  WITH CHECK (get_app_uid() = uid);
-- Note: uid, phone, kyc_status, hd_index, deposit_address, is_suspended
-- are only ever written by service role. This policy allows the row update
-- but the application layer must never expose those columns for update.
```

After migration, audit every frontend hook that touches Supabase directly:
- `lib/hooks/useRealtimeBalances.ts` — Realtime subscription is SELECT-equivalent, still works under the read policy.
- Any hook doing `.from('balances').insert()` or `.update()` directly from the browser must be removed — those operations belong in the API.

#### S-B: AML Behavioral Scoring (HIGH)

Depends on migration 018 (NEXUS creates `compliance_alerts`). Coordinate. Create migration `020_aml_scores.sql`:

```sql
CREATE TABLE aml_risk_scores (
  uid UUID PRIMARY KEY REFERENCES users(uid),
  score INT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  signals JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'normal'
    CHECK (status IN ('normal','review','restricted','suspended')),
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  manual_override INT,
  override_by_uid UUID REFERENCES users(uid),
  override_reason TEXT
);
CREATE TABLE compliance_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid UUID NOT NULL REFERENCES users(uid),
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  score_at_action INT,
  signals JSONB,
  performed_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE aml_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON aml_risk_scores USING (false);
CREATE POLICY "admin_only" ON compliance_actions USING (false);
```

Rewrite `server/jobs/anomaly.ts` as a full behavioral scoring job. For each user active in last 7 days, compute a score 0–100 by accumulating signal weights:

| Signal | How to detect | Weight |
|---|---|---|
| Deposit → withdrawal within 10 min | JOIN deposits+withdrawals on uid, completed_at diff | +25 |
| Deposit → withdrawal within 1 hour | same | +10 |
| 5+ unique crypto destination addresses in 7 days | COUNT DISTINCT address in withdrawals | +15 |
| Multiple logins from 3+ distinct IPs in 24h | login_sessions | +10 |
| Suspected multi-account: same IP as another user | login_sessions cross-join | +20 |
| Round-number transaction (within 1% of $500/$1k/$5k/$10k) | withdrawals amount_usd | +5 |
| Volume spike: today > 3x 30-day daily average | aggregate deposits+withdrawals | +15 |
| New account <7 days, no KYC, volume >$100 | users + kyc_status + deposit sums | +20 |
| Account >90 days, KYC verified, clean history | | -20 |
| P2P completion rate >95% with >10 orders | p2p_orders | -10 |

Apply `manual_override` if set. Then determine status by final score:
- 0–30: `normal`
- 31–60: `review` — insert compliance_alert, no user impact
- 61–80: `restricted` — withdrawals above $200 USD equivalent require admin approval
- 81–100: `suspended` — set `users.is_suspended = true`, fire admin notification immediately

Log every status change to `compliance_actions`.

Cron endpoint: `POST /api/v1/cron/aml-score` protected by `CRON_SECRET`. Register on cron-job.org to run every 4 hours.

Enforce in `server/routes/withdraw.ts`: after auth, query `aml_risk_scores` for this uid. If `restricted` and amount > $200 equivalent: return 403 `"Withdrawal pending review"`. If `suspended`: return 403 `"Account suspended"`. Never explain the real reason.

Admin view: extend `app/admin/transactions/page.tsx` — add risk score badge (green/yellow/red/black) per user row. Filter dropdown for status. Click user → modal showing signals breakdown from JSONB column. Buttons: Clear score, Override, Suspend.

---

### PULSE — Wave 2

#### P-A: International UX (HIGH)

**Register page** `app/auth/register/page.tsx`:
Add country selector — simple `<select>` with 40 major countries as static options. Store `country_code` (ISO 2-letter) alongside user registration. Pass it to `POST /auth/register` and store in users table (add column if absent, default 'KE').

**Currency utility** `lib/utils/currency.ts`:
```ts
const COUNTRY_CURRENCY: Record<string, { code: string; symbol: string }> = {
  KE: { code: 'KES', symbol: 'KSh' },
  NG: { code: 'NGN', symbol: '₦' },
  GH: { code: 'GHS', symbol: 'GH₵' },
  UG: { code: 'UGX', symbol: 'USh' },
  TZ: { code: 'TZS', symbol: 'TSh' },
  ZA: { code: 'ZAR', symbol: 'R' },
  US: { code: 'USD', symbol: '$' },
  GB: { code: 'GBP', symbol: '£' },
  EU: { code: 'EUR', symbol: '€' },
  // ... 30 more
}
export function getCurrencyForCountry(countryCode: string): { code: string; symbol: string }
export function formatFiat(amount: string | number, countryCode: string): string
```

Replace every hardcoded `KSh`, `KES`, `"Kenyan Shilling"` string in UI components with `formatFiat(amount, user.country_code)`. The country comes from Zustand store (already in the user object from `/user/me`).

**Deposit page** `app/(app)/deposit/page.tsx`: call `GET /api/v1/config/payment-methods?country={user.country_code}` (NEXUS builds this). Render available payment methods. For countries with no active provider yet: show "Card payments coming soon — deposit via crypto in the meantime."

**Portfolio card** `components/home/PortfolioCard.tsx`: show balance in user's local currency equivalent using forex rate. Display: "KSh 12,450" for KE users, "₦ 18,200" for NG users, etc.

#### P-B: P2P UX — Escrow UI, Chat, Reputation (HIGH)

Depends on P2P backend being complete (escrow, messages, reputation tables from the P2P architecture). Build the UI ready; if backend is not yet deployed, use mock data with a TODO comment.

File: `app/(app)/p2p/page.tsx`

Three tabs: Browse | My Orders | My Ads.

**Browse tab**:
- Filter bar: Buy/Sell toggle + asset selector (USDT, BTC, ETH) + currency filter (KES, NGN, GHS, USD)
- Ad cards: merchant avatar + name + reputation (★ 4.8 · 142 trades · 99%) + price per unit + min/max limits + payment method badges
- Tap "Trade" → opens order bottom sheet

**Order bottom sheet**:
- Escrow notice banner: "Seller's USDT is held in escrow and released only when payment is confirmed."
- Amount input with real-time KES/fiat equivalent
- Payment instructions from the ad (the seller's payment details)
- Timer countdown (30 min) once order is placed
- "I've sent payment" button — disabled until amount filled
- Chat section below: message list (Supabase Realtime subscription on `p2p_messages` for this order_id) + message input + send button
- "Raise dispute" link — appears only after payment marked sent, opens dispute form sheet

**My Orders tab**: active orders with status badge (payment_pending / payment_sent / completed / disputed). Tap to reopen order sheet.

**My Ads tab**: user's own ads with active/paused toggle switch. "Create Ad" button → form sheet (type, asset, currency, price, limits, payment methods, terms).

**Reputation modal**: tapping a merchant's name opens a profile sheet showing: avatar, joined date, total orders, completion rate, average release time, recent reviews with star ratings and comments.

---

## Wave 2 Task Board

| Agent | Task ID | Task | Priority | Depends on |
|---|---|---|---|---|
| NEXUS | N-A | Payment provider registry + deposit/withdraw routing | HIGH | — |
| NEXUS | N-B | Address screening + integrate sweep + withdrawal | CRITICAL | migration 018 |
| FORGE | F-A | Home page token list — top 50 below quick actions | HIGH | — |
| FORGE | F-B | Expand token cron + UI pagination to 200 | MEDIUM | — |
| FORGE | F-C | Gamification — XP, levels, badges, leaderboard, rewards page | MEDIUM | migration 017 |
| SHIELD | S-A | Financial RLS lockdown — strip all client write access | CRITICAL | — |
| SHIELD | S-B | AML behavioral scoring job + restriction enforcement + admin view | HIGH | migrations 018/020 |
| PULSE | P-A | International UX — country selector, currency formatter, payment method display | HIGH | NEXUS N-A |
| PULSE | P-B | P2P UX — escrow UI, in-order chat, reputation, dispute sheet | HIGH | P2P backend |

Do S-A and N-B first. They protect real money.

---

## WAVE 3 — PM Review & New Tasks (2026-04-08)

### Status from review

| Agent | Wave 2 | Notes |
|---|---|---|
| NEXUS | N-A ✅ N-B ✅ | Complete |
| SHIELD | S-A ✅ S-B ✅ | Complete |
| FORGE | F-A ❌ F-B ❌ F-C ❌ | Not started — migrations 016/017 absent |
| PULSE | P-A ❌ P-B ❌ | Not started — unblocked, begin now |

---

### NEXUS — Wave 3 Tasks

#### N-C: Fix Rewards Route — CRITICAL (do immediately)

File: `server/routes/rewards.ts`

**Problem 1 — real USDT being credited with no budget cap.**
The `daily_login` reward (0.05 USDT) has zero 24-hour enforcement. A user can call `POST /rewards/claim/daily_login` repeatedly and drain unlimited USDT. All task rewards credit real balances with no total pool limit.

**Fix:**
1. Add per-user daily claim guard on `daily_login`: check `ledger_entries` for a `reward:daily_login` entry in the last 24 hours. If found, return 400 "Already claimed today."
2. Add a global rewards budget in `system_config`: key `rewards_enabled` (boolean, default false) and `rewards_budget_remaining_usdt` (numeric). Before any claim, check `rewards_enabled = true` and `rewards_budget_remaining_usdt >= task.reward`. Deduct from budget on each successful claim.
3. Until `rewards_enabled` is set to true by admin, all `/rewards/claim/*` endpoints return 400 "Rewards currently paused."

**Problem 2 — rewards should be XP not real money by default.**
The task completion rewards should award XP (once FORGE builds gamification). Keep the USDT reward structure in the data model but set all amounts to "0" until the admin explicitly funds the rewards pool and enables it.

#### N-D: Airdrop System

New endpoint: `POST /admin/airdrop` (adminMiddleware required)

Request body:
```ts
{
  amount_per_user: string        // USDT per recipient
  asset: string                  // default "USDT"
  segment: "all" | "kyc_verified" | "level_gold_plus" | "country" | "single"
  country_code?: string          // if segment = "country"
  uid?: string                   // if segment = "single"
  note: string                   // admin note for audit trail
}
```

Logic:
1. Query recipient UIDs based on segment.
2. Check `system_config` key `airdrop_budget_remaining_usdt` >= (amount_per_user × recipient_count). If not, reject.
3. For each recipient: `upsertBalance` + `createLedgerEntry` with type `airdrop` + notify via `Notifications.inApp`.
4. Deduct total from `airdrop_budget_remaining_usdt`.
5. Insert into `airdrops` table: id, segment, amount_per_user, asset, recipient_count, total_amount, note, created_by_uid, created_at.

New migration `021_airdrops.sql`:
```sql
CREATE TABLE airdrops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment TEXT NOT NULL,
  amount_per_user NUMERIC NOT NULL,
  asset TEXT NOT NULL DEFAULT 'USDT',
  recipient_count INT NOT NULL,
  total_amount NUMERIC NOT NULL,
  note TEXT,
  created_by_uid UUID REFERENCES users(uid),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Admin only. No user RLS.
ALTER TABLE airdrops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON airdrops USING (false);
```

Admin UI: add "Airdrop" button on `/admin/dashboard` that opens a form with the fields above. Show total cost before confirming. Show history of past airdrops.

---

### FORGE — Wave 3 Tasks

#### F-A: Home Page Token List (carry over — do first)

Already specified in Wave 2. Build now. Top 50 tokens in a vertical list below the horizontal coin tiles strip on `app/(app)/page.tsx`. Tap → `/markets/[symbol]`.

#### F-B: Token List to 200 (carry over)

Already specified in Wave 2. Expand price cron, market page pagination.

#### F-C: Gamification (carry over — migration 017 is missing, create it)

Already specified in Wave 2. Create migration 017, build `server/services/gamify.ts`, wire XP into all call sites, build rewards page UI.

#### F-D: Futures Overhaul — CRITICAL UX

The current futures tab is not usable as a real trading interface. Full rebuild required.

**Step 1 — new market data endpoint**

`GET /api/v1/futures/market-data?symbol=BTC`

Fetch from Binance Futures public API (no key needed):
- Mark price: `GET https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT`
  Returns: `markPrice`, `indexPrice`, `lastFundingRate`, `nextFundingTime`
- Open interest: `GET https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT`
- 24h stats: `GET https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT`

Cache in Redis with key `futures:market:{symbol}` TTL 5 seconds. Return combined object:
```ts
{
  markPrice: string
  indexPrice: string
  fundingRate: string          // e.g. "0.0001" = 0.01%
  fundingCountdownSeconds: number
  openInterest: string         // in coin units
  volume24h: string            // USDT
  change24h: string            // percent
}
```

**Step 2 — rebuild `components/trade/FuturesTab.tsx`**

Layout (top to bottom on mobile):

```
┌─────────────────────────────────────┐
│ BTC/USDT Perp    [Isolated ⇄ Cross] │  ← pair + margin mode toggle
│ $94,200  Mark                        │
│ $94,180  Index   0.01% in 4h 23m    │  ← funding rate + countdown
│ 24h: +2.4%  OI: 48,240 BTC          │
├─────────────────────────────────────┤
│ [Market]  [Limit]  [TP/SL Order]    │  ← order type tabs
├─────────────────────────────────────┤
│ [  ▲ Long  ]  [  ▼ Short  ]         │  ← side toggle
├─────────────────────────────────────┤
│ Leverage  ────●──────  20×  [edit]  │  ← slider + tap to type custom
│ ⚠ Liq ~$89,234  (cross)             │  ← live liquidation preview
├─────────────────────────────────────┤
│ Amount  [_______ USDT] [_______ BTC]│  ← dual input, sync on change
│ [25%] [50%] [75%] [100%]            │  ← percent of available balance
├─────────────────────────────────────┤
│ TP [$_______]    SL [$_______]      │  ← always visible
├─────────────────────────────────────┤
│ [     Open Long  +2.4% est.     ]   │  ← colored confirm button
│ Avail: 248.50 USDT  Fee: 0.04 USDT  │
└─────────────────────────────────────┘
```

Below the form — positions panel (NOT inline, use a bottom drawer):
- "Positions (2)" button at bottom of screen opens a `BottomSheet`
- Inside sheet: tabs — Positions | Open Orders | History
- Each position card shows: pair, Long/Short badge, leverage, entry, mark, liq price, margin, unrealised PnL (live, updating every 5s), ROE%
- Each card has: "Close" button (full close) + "Partial" button (opens input for partial size) + "Edit TP/SL" button

**Liquidation price formulas** (correct, not simplified):

Isolated Long: `liqPrice = entryPrice × (1 - 1/leverage + maintenanceMarginRate)`
Isolated Short: `liqPrice = entryPrice × (1 + 1/leverage - maintenanceMarginRate)`
Cross Long: accounts for total available balance — more complex, show "varies" for now
Cross Short: same

Use `maintenanceMarginRate = 0.004` (0.4%) for BTC, `0.005` for others — Binance standard tiers.

**Order types:**
- Market: executes at mark price immediately
- Limit: stores as `pending_limit` status, fills when mark price crosses limit price (check in the AML/price cron or add a separate limit order monitor cron)
- TP/SL Order: sets a conditional order that triggers at a price — store in `futures_orders` table

**Margin mode toggle:**
- Isolated: only the margin posted can be lost
- Cross: entire trading balance is collateral (much higher risk, wider liquidation buffer)
- Show a clear tooltip/warning when switching to Cross

**Risk warning** — show once per session (localStorage flag): "Futures trading involves significant risk of loss. Never trade more than you can afford to lose."

---

### SHIELD — Wave 3 Tasks

#### S-C: Fix Duplicate Migration Numbers

Migrations `012_deposit_completing_status.sql` and `012_rls_custom_jwt.sql` share the same number prefix. Same for `013_referrals_and_referral_code.sql` and `013_withdrawal_timed_out_and_evm_scanner.sql`.

Fix: rename files to use sequential numbering without gaps:
```
012_deposit_completing_status.sql    → keep as 012
012_rls_custom_jwt.sql               → rename to 012b_rls_custom_jwt.sql
013_referrals_and_referral_code.sql  → keep as 013
013_withdrawal_timed_out_and_evm_scanner.sql → rename to 013b_withdrawal_timed_out.sql
```
Create a `supabase/migrations/README.md` explaining that migrations must be run in filename order and duplicate prefix files (12b, 13b) should be run after their base number.

#### S-D: Futures RLS Fix

The `futures_positions` and `futures_orders` tables in migration 007 use the old `auth.uid()` pattern which does not work with the custom JWT. Update their policies to use `get_app_uid()` in a new migration `022_futures_rls_fix.sql`:

```sql
-- futures_positions
DROP POLICY IF EXISTS "Users read own futures" ON futures_positions;
CREATE POLICY "futures_read_own" ON futures_positions
  FOR SELECT USING (get_app_uid() = uid);

-- futures_orders
DROP POLICY IF EXISTS "Users read own futures_orders" ON futures_orders;
CREATE POLICY "futures_orders_read_own" ON futures_orders
  FOR SELECT USING (get_app_uid() = uid);
```

---

### PULSE — Wave 3 Tasks

#### P-A: International UX (carry over — NEXUS N-A is done, unblocked)

Already specified in Wave 2. Country selector on register, `lib/utils/currency.ts`, replace KSh hardcoding, deposit/withdraw pages show payment methods from `/config/payment-methods?country=`.

#### P-B: P2P UX (carry over)

Already specified in Wave 2. Escrow UI, in-order chat, reputation display, dispute sheet, three-tab layout.

#### P-C: Airdrop Notification UX

When a user receives an airdrop (new `airdrop` type ledger entry), show a special notification. In `components/shared/ToastContainer.tsx` or wherever notifications are displayed: airdrop notifications get a distinct style — yellow/gold banner, confetti trigger, message "You received an airdrop of X USDT from KryptoKe."

Subscribe to the `notifications` table via Supabase Realtime (already wired in `useRealtimeBalances`) — when a new notification arrives with type `airdrop`, trigger the special toast + Confetti.

---

## Wave 3 Priority Order

1. NEXUS: N-C immediately (rewards route is a live financial risk)
2. SHIELD: S-C immediately (duplicate migrations block DB setup for new deployments)
3. SHIELD: S-D (futures RLS broken since migration 012)
4. FORGE: F-D (futures overhaul — UX is blocking real traders from using it)
5. FORGE: F-A, F-C (home token list + gamification — these unblock PULSE)
6. NEXUS: N-D (airdrop system)
7. PULSE: P-A, P-B (international UX + P2P UI)
8. PULSE: P-C (airdrop notification UX — depends on N-D)

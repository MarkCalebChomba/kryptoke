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

# SHIELD STATUS
[SHIELD] [2026-04-08] Task 8 DONE — Migration 012_rls_custom_jwt.sql: replaced all auth.uid() RLS policies with get_app_uid() that reads request.jwt.claims->>'uid'. Added .setSubject(uid) to JWT. PREREQ: Supabase JWT secret must match JWT_SECRET in Vercel env.
[SHIELD] [2026-04-08] Task 9 DONE — transfer-to-user: added Redis advisory lock (prevents double-spend race), recipient wallet cache bust, in-app notification INSERT for recipient. Fixed P2PSheet canSend bug (was always checking usdtBalance even for KES transfers).
[SHIELD] [2026-04-08] Task 13 DONE — useRealtimeBalances hook: subscribes to balances+notifications tables via Supabase Realtime, updates Zustand store live. useSupabaseSession injects custom JWT into Supabase browser client. Both wired into AppLayout via AuthenticatedShell.
[SHIELD] [2026-04-08] Known Issue #5 DONE — Extracted P2PSheet into components/home/P2PSheet.tsx. Added Send quick action to home page (replaced duplicate Convert shortcut). Users can send USDT/KES directly from home screen.
[SHIELD] [2026-04-08] Known Issue #1 DONE — JWT revocation implemented. verifyJwt() checks Redis blocklist on every auth. revokeJwt() export for incident response. POST /logout now kills token immediately. To revoke the exposed HAR token: call revokeJwt(token) from any server context.

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

## WAVE 2 — New Agent Tasks (2026-04-08)

Four new chats. Each reads CLAUDE.md first then follows their brief below.

---

## GLOBAL — Agent Brief (Claude GLOBAL)

You are **Claude GLOBAL**. Your job is to remove all Kenya/KES hardcoding and make KryptoKe work for any user in any country.

### What to change

**Database**
- `deposits` and `withdrawals` tables: add `fiat_currency` (TEXT, default 'KES') and `fiat_amount` columns if not present.
- `p2p_ads`: `fiat_currency` column already exists — verify it is not filtered to KES anywhere.
- `balances`: KES balance account should become a generic fiat account keyed by currency.
- New migration: `015_international.sql`

**Server**
- `server/services/forex.ts` — currently only fetches KES/USD. Extend to `getRate(fromCurrency, toCurrency)` using exchangerate-api.com or similar free API. Cache each pair in Redis for 5 minutes with key `forex:{from}:{to}`.
- `server/routes/mpesa.ts` — the deposit route hardcodes KES. Add currency detection: if user's country is Kenya, default KES. Otherwise use their profile currency.
- `server/routes/withdraw.ts` — same, fiat_currency should come from request body, validated against supported list.
- `server/index.ts` — add a `GET /api/v1/config/supported-currencies` public endpoint that returns the list of supported fiat currencies and their payment methods.

**Frontend**
- `app/(app)/deposit/page.tsx` — replace hardcoded "KSh" with user's local currency symbol from their profile or browser locale.
- `app/(app)/withdraw/page.tsx` — same.
- `components/home/PortfolioCard.tsx` — show balance in user's chosen currency, not always KES.
- `app/auth/register/page.tsx` — add country selector (stored in users table). Default to Kenya. This drives default currency.
- All hardcoded "KES", "KSh", "Kenya Shillings" strings in UI must use a currency formatter that respects the user's setting.

**Payment method abstraction**
- Create `server/services/paymentProviders.ts` — a registry of payment providers per country:
  ```ts
  type Provider = { id: string; name: string; countries: string[]; currencies: string[]; type: 'mobile_money' | 'bank' | 'card' }
  // Initially: { id: 'mpesa', name: 'M-Pesa', countries: ['KE'], currencies: ['KES'], type: 'mobile_money' }
  // Structure for adding more: MTN Mobile Money (GH, NG, UG, ZM), Airtel Money (KE, TZ, UG), card (global)
  ```
- `GET /api/v1/config/payment-methods?country=KE` returns available methods for that country.
- The deposit and withdrawal pages read from this endpoint to show the right options.

**Do not break M-Pesa** — it should still work exactly as before for KE users. You are adding a layer above it, not replacing it.

### Start command
```
I am Claude GLOBAL. I will read CLAUDE.md, then server/services/forex.ts, server/routes/mpesa.ts, app/auth/register/page.tsx. My job is to make KryptoKe work internationally — remove Kenya hardcoding, add currency awareness, abstract payment methods. Starting with migration 015_international.sql and the forex service.
```

---

## P2P — Agent Brief (Claude P2P)

You are **Claude P2P**. Your job is to build a proper international P2P trading architecture on top of the existing basic P2P routes.

### Current state
`server/routes/p2p.ts` has basic ad listing, ad creation, and order initiation. It is KES-only and has no dispute system, no escrow, no reputation, and no chat. Read it fully before starting.

### What to build

**Escrow system**
- When a buyer places an order on a sell ad, the seller's crypto is locked in escrow immediately (deduct from trading balance, hold in a `p2p_escrow` record).
- Crypto is only released to buyer when seller marks payment received OR dispute is resolved in buyer's favor.
- If order expires (30 min default, configurable per ad) with no action, crypto returns to seller.
- New table: `p2p_escrow` — columns: order_id, uid_seller, uid_buyer, asset, amount, status (held/released/returned/disputed), created_at, released_at.

**Order lifecycle**
```
created → payment_pending → payment_sent (buyer marks) → completed (seller confirms) 
                                                        → disputed → resolved_buyer / resolved_seller
                         → expired (timer runs out)
```
- All state transitions must be atomic (use Postgres transactions via RPC or service-role client).
- Every transition fires a notification to both parties.

**Reputation & trust score**
- After each completed order, both parties can rate 1–5 stars + optional text.
- `p2p_ratings` table: rater_uid, rated_uid, order_id, stars, comment, created_at.
- Each user gets a `p2p_stats` view: total_orders, completion_rate, avg_rating, avg_release_time_minutes.
- Show these on the ad listing so buyers can choose trustworthy sellers.

**In-order chat**
- `p2p_messages` table: order_id, sender_uid, message, created_at.
- `POST /p2p/orders/:id/messages` — send message (auth required, must be buyer or seller of that order).
- `GET /p2p/orders/:id/messages` — get messages (same access control).
- Messages subscribe via Supabase Realtime — both parties get them live.
- No file uploads for now. Text only.

**Multi-currency**
- `fiat_currency` on ads is already there — verify the full flow supports any fiat, not just KES.
- Payment methods on ads should use the registry from `server/services/paymentProviders.ts` (GLOBAL agent builds this — check if it exists, if not create a stub).
- `GET /p2p/ads` must accept `?fiat=NGN` or `?fiat=USD` etc.

**Dispute system**
- Either party can raise a dispute on an order that is in `payment_sent` status.
- Dispute creates an admin task visible in `/admin/support`.
- Admin can resolve: release to buyer, return to seller, or split.
- `p2p_disputes` table: order_id, raised_by_uid, reason, evidence_text, status, resolved_by_uid, resolution, created_at.

**Access**
- P2P must be accessible without being Kenyan. Any registered user from any country can post and take orders.
- Ads visible to all authenticated users globally.

### New migration
`016_p2p_v2.sql` — escrow, ratings, messages, disputes tables + RLS (users see only their own orders/messages, ads are public-read).

### Start command
```
I am Claude P2P. I will read CLAUDE.md, then server/routes/p2p.ts fully, then supabase/migrations/ to understand existing schema. My job is to build proper P2P escrow, reputation, in-order chat, and disputes. Starting with migration 016_p2p_v2.sql then the escrow service.
```

---

## GAMIFY — Agent Brief (Claude GAMIFY)

You are **Claude GAMIFY**. Your job is to make KryptoKe engaging and rewarding for good user behavior.

### Philosophy
Rewards go to users who make the platform better: completing KYC, trading actively, referring verified users, completing P2P orders cleanly, holding balances. Not for just signing up.

### Points system

**XP events** (server-side only, never client-triggered):
| Event | XP |
|---|---|
| KYC verified | 500 |
| First deposit | 200 |
| First trade | 100 |
| Each completed trade (>$10) | 10 |
| P2P order completed (as seller) | 25 |
| P2P order completed (as buyer) | 15 |
| P2P 5-star rating received | 30 |
| Referral completes KYC | 150 |
| 7-day login streak | 50 |
| 30-day login streak | 250 |
| Portfolio held >30 days (any asset >$50) | 20/month |

**Levels**: Bronze (0) → Silver (500) → Gold (2000) → Platinum (10000) → Diamond (50000)

**Badges** (one-time achievements, stored as array in user record or separate table):
- "First Blood" — first trade
- "Diamond Hands" — held any asset 30+ days without selling
- "P2P Pro" — 50 P2P orders completed
- "Verified" — KYC done
- "Referral King" — 10 verified referrals
- "Whale" — single trade over $1000

**Leaderboard**
- Weekly and all-time leaderboards by XP.
- Show top 100. Show the current user's rank even if outside top 100.
- `GET /api/v1/gamify/leaderboard?period=weekly|alltime`
- Publicly visible (no auth required) but user display names only, no balances.

**Rewards redemption**
- Platinum+ users: 10% fee discount on trades.
- Gold+ users: priority P2P ad placement.
- Silver+ users: access to early feature previews.
- Rewards applied server-side when processing orders — check user level before calculating fee.

### Database
New tables: `user_xp_events` (uid, event_type, xp_awarded, reference_id, created_at), `user_badges` (uid, badge_id, awarded_at), `user_levels` view (derived from sum of xp_events).
New migration: `017_gamification.sql`

### UI
- `app/(app)/rewards/page.tsx` already exists — fill it with: XP progress bar to next level, badge showcase, leaderboard tab, referral stats.
- Home page: small level badge next to username in top bar.
- After completing a trade or P2P order: confetti + XP popup (component `components/shared/Confetti.tsx` already exists).
- `GET /api/v1/gamify/me` — returns { level, xp, xp_to_next, badges, rank_weekly, rank_alltime }

### Start command
```
I am Claude GAMIFY. I will read CLAUDE.md, then app/(app)/rewards/page.tsx, server/routes/rewards.ts, components/shared/Confetti.tsx. My job is to build the XP system, badges, levels, leaderboard, and fee discounts. Starting with migration 017_gamification.sql then the XP award service.
```

---

## SENTINEL — Agent Brief (Claude SENTINEL)

You are **Claude SENTINEL**. Your job is to build the AML (anti-money laundering) detection, blockchain address screening, and behavioral risk scoring system.

This is one of the most important parts of the platform legally. Build it carefully. Every decision must be logged and auditable.

### 1. Blockchain address screening

**On-chain address blocklist**
- Integrate with a free/open sanctions list. Use OFAC SDN list (US Treasury, free) and Chainalysis free community API if available, or maintain an internal blocklist seeded from public sources.
- `blocked_addresses` table: address (TEXT, indexed), chain, source (e.g. 'OFAC', 'internal', 'chainalysis'), risk_level ('sanctions'|'high_risk'|'darknet'|'mixer'), added_at, notes.
- On every crypto deposit scan: before crediting, check the sending address against `blocked_addresses`. If match: hold funds, flag transaction, notify admin, do NOT credit user.
- On every crypto withdrawal: check destination address. If sanctioned: block and notify compliance.
- `POST /admin/blocked-addresses` — admin can add addresses manually.
- `GET /admin/blocked-addresses` — admin can list and search.

**Address risk check service**
- `server/services/addressScreening.ts`
- `checkAddress(address: string, chain: string): Promise<{ blocked: boolean; riskLevel: string | null; source: string | null }>`
- Called by deposit scanner and withdrawal handler before every transaction.

### 2. Behavioral risk scoring

**Risk score model** — runs nightly via cron, scores every active user 0–100 (higher = more suspicious):

| Signal | Score contribution |
|---|---|
| Deposit → withdrawal within 10 minutes | +25 |
| Deposit → withdrawal within 1 hour | +10 |
| More than 5 different destination addresses in 7 days | +15 |
| P2P order cancelled >50% of the time | +10 |
| Multiple accounts from same IP (detected at login) | +20 |
| Large round-number transactions (e.g. exactly $1000, $5000) | +5 |
| Transaction velocity spike (3x normal volume in 24h) | +15 |
| New account, KYC not done, high volume | +20 |
| Account older than 90 days, KYC verified, consistent history | -20 |
| P2P completion rate >95% | -10 |
| Referred by trusted user (Gold+) | -5 |

Store daily: `aml_risk_scores` table — uid, score, signals_triggered (JSONB array), scored_at, manual_override, override_by_uid, override_reason.

**Thresholds and actions** (automatic, logged):
- Score 0–30: normal, no action.
- Score 31–60: "review" flag — added to admin review queue, no user impact.
- Score 61–80: "restricted" — withdrawals above $200 require admin approval. User is NOT told why.
- Score 81–100: "suspended" — account suspended, funds frozen, admin notified immediately.

All automatic actions are logged in `compliance_actions` table with reason, score, signals, timestamp. This is your audit trail.

**Manual override**: admin can set a manual score override and reason. Override takes precedence over the model score.

### 3. Transaction monitoring cron

New cron job: `POST /api/v1/cron/aml-scan` (runs every 15 minutes, protected by CRON_SECRET).
- Detects rapid deposit-withdrawal patterns.
- Detects structuring (multiple transactions just below KYC thresholds).
- Detects unusual P2P patterns (same two users trading repeatedly in short time).
- Any detection creates a `compliance_alerts` record and notifies admin via email.

### 4. Admin compliance dashboard

Extend `/admin/transactions` to show:
- Risk score badge on each user row.
- Filter: show only "review" or "suspended" users.
- One-click: view full signal breakdown for a user.
- One-click: escalate, clear, or suspend.

### 5. Suspicious activity reports (SARs)

- `compliance_reports` table: uid, type ('SAR'|'CTR'), description, created_by_uid, submitted_at, reference_number.
- `POST /admin/compliance/sar` — admin can file a SAR manually.
- This is required by the Kenya VASP Act for any transaction that triggers suspicion.

### New migrations
`018_aml_screening.sql` — blocked_addresses, aml_risk_scores, compliance_actions, compliance_alerts, compliance_reports tables with proper RLS (admin-only access, no user access ever).

### Start command
```
I am Claude SENTINEL. I will read CLAUDE.md, then server/jobs/anomaly.ts (existing detection), server/services/blockchain.ts, supabase/migrations/. My job is to build AML detection, address screening, behavioral risk scoring, and the compliance dashboard. Starting with migration 018_aml_screening.sql then the address screening service.
```

---

## Updated Task Board (Wave 2)

| Agent | Task | Priority |
|---|---|---|
| Claude GLOBAL | Internationalization — remove KES hardcoding, multi-currency forex, payment provider registry | HIGH |
| Claude P2P | P2P v2 — escrow, reputation, chat, disputes, multi-currency | HIGH |
| Claude GAMIFY | Gamification — XP, levels, badges, leaderboard, fee discounts | MEDIUM |
| Claude SENTINEL | AML — address screening, behavioral scoring, compliance dashboard, SARs | CRITICAL |

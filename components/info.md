# components/ — Shared React UI Components

> **Last updated:** 2026-04-07
> **Add to this file** whenever a new component is created or an existing one's API changes significantly.

## Overview

All reusable React components live here. Components are **pure UI** — no direct API calls, no Supabase calls. Data comes via props or Zustand stores. Styling uses Tailwind utility classes with `clsx` + `tailwind-merge` for conditional class composition.

## Directory Structure

```
components/
├── ui/               # Primitive / design-system components (Radix-based)
├── layout/           # Nav, sidebar, header, footer wrappers
├── dashboard/        # Dashboard-specific widgets
├── trade/            # Trading terminal sub-components
├── wallet/           # Wallet, send, receive, QR components
├── deposit/          # M-Pesa deposit form and flow components
├── withdraw/         # M-Pesa withdrawal form and flow components
├── history/          # Transaction history table, filters
├── settings/         # Settings form sections (profile, KYC, security)
├── auth/             # Login and register forms
├── market/           # Price tickers, coin cards, market overview
└── shared/           # Generic cross-domain components (loaders, empty states)
```

## ui/ — Design System Primitives

Built on top of **Radix UI** primitives. Each component wraps a Radix component with KryptoKe's design tokens.

| Component | Radix base | Notes |
|---|---|---|
| `Button` | — | Variants: primary, secondary, ghost, danger |
| `Dialog` | `@radix-ui/react-dialog` | Modal overlay |
| `DropdownMenu` | `@radix-ui/react-dropdown-menu` | Context menus |
| `Tabs` | `@radix-ui/react-tabs` | Tab navigation |
| `Toast` | `@radix-ui/react-toast` | Notification toasts |
| `Switch` | `@radix-ui/react-switch` | Toggle switches |
| `Slider` | `@radix-ui/react-slider` | Amount sliders |
| `Select` | `@radix-ui/react-select` | Dropdowns |
| `Popover` | `@radix-ui/react-popover` | Floating panels |
| `Tooltip` | `@radix-ui/react-tooltip` | Hover tooltips |
| `Separator` | `@radix-ui/react-separator` | Visual dividers |
| `Avatar` | `@radix-ui/react-avatar` | User avatar with fallback |
| `Progress` | `@radix-ui/react-progress` | Progress bars |
| `ScrollArea` | `@radix-ui/react-scroll-area` | Custom scrollbars |
| `Input` | — | Styled text input |
| `Badge` | — | Status badges (success, warning, error) |
| `Card` | — | Content card container |
| `Skeleton` | — | Loading placeholder |

## layout/ — Navigation and Shell

| Component | Description |
|---|---|
| `Navbar` | Top navigation bar — logo, user menu, notifications |
| `Sidebar` | Left sidebar with page links (Dashboard, Trade, Wallet, etc.) |
| `MobileNav` | Bottom tab bar for mobile viewports |
| `Providers` | Root client provider tree (QueryClient, Supabase, Zustand hydration) |

## Feature Components (per section)

### dashboard/
- `PortfolioCard` — Total balance in KES and USD
- `AssetList` — List of user's held coins with values
- `RecentActivity` — Last 5 transactions
- `MarketMiniChart` — Sparkline price charts

### trade/
- `TradingChart` — `lightweight-charts` wrapper with OHLCV data
- `OrderBook` — Live bid/ask table
- `TradeForm` — Buy/sell form with amount, price, KES estimate
- `PairSelector` — Dropdown to switch trading pairs

### wallet/
- `WalletCard` — Shows address, balance, chain for a given asset
- `ChainSelector` — Switch between chains (ETH, BSC, SOL, BTC, etc.)
- `SendForm` — Address + amount form with gas estimate
- `ReceivePanel` — QR code + copy address
- `QRDisplay` — Uses `qrcode` library to render QR

### deposit/
- `DepositForm` — Phone number + KES amount input
- `StkPushStatus` — Polling UI for M-Pesa STK push confirmation
- `DepositInstructions` — Step-by-step guide

### withdraw/
- `WithdrawForm` — Phone number + KES amount with fee calculation
- `WithdrawConfirm` — Confirmation modal with fee breakdown

### market/
- `CoinCard` — Token price, 24h change, logo
- `PriceTicker` — Horizontal scrolling live price strip
- `MarketTable` — Sortable table of all supported tokens

### auth/
- `PhoneInput` — Kenyan phone number input with flag
- `OtpInput` — 6-digit OTP code input boxes
- `LoginForm` — Combines PhoneInput + OtpInput flow
- `RegisterForm` — Name + phone registration

### shared/
- `LoadingSpinner` — Centered spinner overlay
- `EmptyState` — Icon + message for empty lists
- `ErrorMessage` — Inline error display
- `CopyButton` — Copy to clipboard with feedback
- `AmountInput` — Number input with currency label and max button
- `TokenLogo` — Coin logo from CoinGecko/CoinMarketCap URLs with fallback

## Component Conventions

- All components are **default exports** from their file.
- Props interfaces are named `ComponentNameProps` and defined in the same file.
- Use `cn()` (from `lib/utils.ts`) for class merging — never string concatenation.
- No `useEffect` for data fetching — use TanStack Query hooks from `lib/hooks/`.
- Animation: prefer Tailwind `transition-*` classes; avoid heavy animation libraries.
- Icons: use `lucide-react` only.

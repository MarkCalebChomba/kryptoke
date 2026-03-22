import type { Big } from "big.js";

/* ─── Auth ─────────────────────────────────────────────────────────────── */

export interface User {
  uid: string;
  email: string;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  hdIndex: number;
  depositAddress: string;
  kycStatus: "pending" | "submitted" | "verified" | "rejected";
  assetPinSet: boolean;
  totpEnabled: boolean;
  antiPhishingSet: boolean;
  language: "en" | "sw";
  dataSaver: boolean;
  autoEarn: boolean;
  createdAt: string;
  lastActiveAt: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  expiresAt: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  phone: string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/* ─── Balances ──────────────────────────────────────────────────────────── */

export interface Balance {
  asset: string;
  amount: string; // Always stored as string — use big.js to parse
  updatedAt: string;
}

export interface WalletInfo {
  depositAddress: string;
  bnbBalance: string;
  kesBalance: string;
  usdtBalance: string;
  kycStatus: User["kycStatus"];
}

export interface ExchangeRate {
  bnbUsd: string;
  kesPerUsd: string;
  bnbKes: string;
  usdtKes: string;
  fetchedAt: string;
}

export interface PortfolioValue {
  totalKes: string;
  totalUsd: string;
  fundingKes: string;
  tradingUsd: string;
  earnUsd: string;
  todayPnlKes: string;
  todayPnlPercent: string;
  yearPnlKes: string;
}

/* ─── Deposits ──────────────────────────────────────────────────────────── */

export type DepositStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface Deposit {
  id: string;
  uid: string;
  phone: string;
  amountKes: string;
  usdtCredited: string;
  kesPerUsd: string;
  status: DepositStatus;
  checkoutRequestId: string | null;
  mpesaCode: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface MpesaDepositPayload {
  phone: string;
  amount: number;
}

export interface MpesaDepositResponse {
  txId: string;
  checkoutRequestId: string;
  message: string;
}

export interface DepositNetwork {
  network: string;
  label: string;
  arrivalTime: string;
  minimumDeposit: string;
  networkFee: string;
  isEnabled: boolean;
}

/* ─── Withdrawals ───────────────────────────────────────────────────────── */

export type WithdrawalStatus = "pending" | "processing" | "completed" | "failed" | "refunded";

export interface Withdrawal {
  id: string;
  uid: string;
  type: "kes" | "crypto";
  amount: string;
  fee: string;
  netAmount: string;
  phone: string | null;
  address: string | null;
  network: string | null;
  asset: string | null;
  status: WithdrawalStatus;
  mpesaRef: string | null;
  b2cConversationId: string | null;
  createdAt: string;
}

export interface KesWithdrawalPayload {
  amount: number;
  phone: string;
  assetPin: string;
}

export interface CryptoWithdrawalPayload {
  asset: string;
  network: string;
  address: string;
  amount: string;
  assetPin: string;
}

export interface WithdrawalFee {
  asset: string;
  network: string;
  fee: string;
  feeAsset: string;
  minWithdrawal: string;
}

export interface WithdrawalLimits {
  dailyLimit: string;
  usedToday: string;
  remaining: string;
  minAmount: string;
  feePercent: string;
}

/* ─── Trades ────────────────────────────────────────────────────────────── */

export type TradeStatus = "pending" | "pending_fulfillment" | "processing" | "completed" | "failed" | "cancelled";
export type OrderType = "limit" | "market" | "tp_sl" | "trailing_stop" | "trigger" | "advanced_limit";
export type TradeSide = "buy" | "sell";

export interface Trade {
  id: string;
  uid: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  price: string;
  side: TradeSide;
  orderType: OrderType;
  status: TradeStatus;
  txHash: string | null;
  fulfillmentType: "manual" | "auto";
  createdAt: string;
}

export interface TradeQuotePayload {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}

export interface TradeQuoteResponse {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  price: string;
  priceImpact: string;
  fee: string;
  route: string[];
  expiresAt: number;
}

export interface TradeSubmitPayload {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  side: TradeSide;
  orderType: OrderType;
  limitPrice?: string;
  stopPrice?: string;
  quoteId?: string;
}

export interface TradeConfirmPayload {
  tradeId: string;
  txHash: string;
}

/* ─── Market Data ───────────────────────────────────────────────────────── */

export interface Ticker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  updatedAt: number;
}

export interface OHLCV {
  time: number; // Unix seconds
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface OrderBookEntry {
  price: string;
  quantity: string;
  depth: number; // 0–1, relative depth for fill bar
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: string;
  spreadPercent: string;
  updatedAt: number;
}

export interface MarketTrade {
  id: string;
  price: string;
  quantity: string;
  side: "buy" | "sell";
  time: number;
}

export interface TokenOverview {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price: string;
  priceChangePercent: string;
  volume24h: string;
  marketCap: string | null;
  iconUrl: string | null;
  isNew: boolean;
  isSeed: boolean;
  coingeckoId: string | null;
}

export type ChartInterval = "15m" | "1h" | "4h" | "1D" | "1W" | "3m";

/* ─── Tokens ────────────────────────────────────────────────────────────── */

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  whitelistedAt: string;
  coingeckoId: string | null;
  isNew: boolean;
  isSeed: boolean;
  iconUrl: string | null;
}

export interface TokenDetail extends Token {
  description: string | null;
  marketCap: string | null;
  circulatingSupply: string | null;
  totalSupply: string | null;
  allTimeHigh: string | null;
  allTimeHighDate: string | null;
  allTimeLow: string | null;
  allTimeLowDate: string | null;
  contractAddress: string | null;
  website: string | null;
  whitepaper: string | null;
  twitter: string | null;
  telegram: string | null;
  isAuditVerified: boolean | null;
  isHoneypot: boolean | null;
  deployerAddress: string | null;
}

/* ─── Earn ──────────────────────────────────────────────────────────────── */

export type EarnStatus = "active" | "redeemed" | "expired";

export interface EarnProduct {
  id: string;
  asset: string;
  name: string;
  apr: string;
  lockPeriodDays: number | null; // null = flexible
  minSubscription: string;
  interestFrequency: "daily" | "weekly" | "monthly";
  isComingSoon: boolean;
}

export interface EarnPosition {
  id: string;
  uid: string;
  asset: string;
  amount: string;
  product: string;
  apr: string;
  startDate: string;
  endDate: string | null;
  status: EarnStatus;
  externalId: string | null;
  accruedInterest: string;
  accrued_interest?: string; // raw DB field alias — API returns snake_case
}

export interface EarnSubscribePayload {
  asset: string;
  amount: string;
  product: string;
}

export interface EarnSummary {
  totalValueUsd: string;
  yesterdayEarningsUsd: string;
  lifetimeEarningsUsd: string;
  autoEarnEnabled: boolean;
}

/* ─── Notifications ─────────────────────────────────────────────────────── */

export type NotificationType =
  | "deposit_confirmed"
  | "withdrawal_sent"
  | "price_alert"
  | "new_listing"
  | "security_alert"
  | "earn_interest"
  | "order_filled"
  | "announcement"
  | "kyc_update";

export interface Notification {
  id: string;
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  data: Record<string, unknown>;
  createdAt: string;
}

/* ─── Alerts ────────────────────────────────────────────────────────────── */

export interface PriceAlert {
  id: string;
  uid: string;
  tokenAddress: string;
  tokenSymbol: string;
  condition: "above" | "below";
  price: string;
  triggered: boolean;
  createdAt: string;
}

export interface CreateAlertPayload {
  tokenAddress: string;
  tokenSymbol: string;
  condition: "above" | "below";
  price: string;
}

/* ─── Analytics ─────────────────────────────────────────────────────────── */

export interface DailyPnl {
  date: string; // YYYY-MM-DD
  pnlUsd: string;
  pnlKes: string;
}

export interface PortfolioSnapshot {
  date: string;
  valueUsd: string;
  valueKes: string;
}

export interface SpotPnlSummary {
  totalPnlUsd: string;
  totalPnlKes: string;
  todayPnlUsd: string;
  todayPnlKes: string;
  periodPnl: PortfolioSnapshot[];
}

export interface HoldingPnl {
  asset: string;
  symbol: string;
  amount: string;
  currentValueUsd: string;
  pnlUsd: string;
  pnlPercent: string;
}

/* ─── Events & Announcements ─────────────────────────────────────────────── */

export type EventBadge = "SPOT" | "FUTURES" | "VESTING" | "MAINTENANCE" | "LISTING";

export interface ExchangeEvent {
  id: string;
  title: string;
  type: EventBadge;
  date: string;
  badgeColor: string;
  published: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: "info" | "warning" | "promotion";
  published: boolean;
  createdAt: string;
}

/* ─── Transfer ──────────────────────────────────────────────────────────── */

export type AccountType = "funding" | "trading" | "earn";

export interface TransferPayload {
  from: AccountType;
  to: AccountType;
  asset: string;
  amount: string;
}

/* ─── Send (Internal / External) ────────────────────────────────────────── */

export interface SendPayload {
  recipient: string; // wallet address, SOKO UID, email, or phone
  network: string;
  asset: string;
  amount: string;
  assetPin: string;
}

export interface SendQuote {
  recipientType: "internal" | "external";
  recipientDisplay: string;
  asset: string;
  amount: string;
  networkFee: string;
  receiveAmount: string;
}

/* ─── Admin ─────────────────────────────────────────────────────────────── */

export interface AdminUser {
  uid: string;
  email: string;
  role: "super_admin" | "admin" | "support";
  createdAt: string;
}

export interface AdminDashboardMetrics {
  totalUsers: number;
  totalUsersChange: number;
  activeToday: number;
  depositsTodayKes: string;
  depositsTodayUsdt: string;
  withdrawalsTodayKes: string;
  pendingOrders: number;
  revenueToday: string;
}

export interface AdminOrder extends Trade {
  userEmail: string;
  userPhone: string | null;
  userDepositAddress: string;
}

export interface BalanceAdjustmentPayload {
  uid: string;
  asset: string;
  amount: string; // positive = credit, negative = debit
  reason: string;
}

export interface AnomalyAlert {
  id: string;
  type: string;
  description: string;
  uid: string | null;
  severity: "low" | "medium" | "high";
  resolved: boolean;
  createdAt: string;
}

export interface SystemServiceStatus {
  name: string;
  status: "up" | "degraded" | "down";
  lastCheck: string;
  responseTimeMs: number | null;
  uptimePercent: number;
}

/* ─── API Response Wrappers ──────────────────────────────────────────────── */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
  statusCode: number;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/* ─── Pagination ────────────────────────────────────────────────────────── */

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/* ─── WebSocket ─────────────────────────────────────────────────────────── */

export type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface WsTickerMessage {
  type: "ticker";
  symbol: string;
  price: string;
  change: string;
  volume: string;
}

export interface WsOrderBookMessage {
  type: "orderbook";
  symbol: string;
  bids: [string, string][];
  asks: [string, string][];
}

export interface WsKlineMessage {
  type: "kline";
  symbol: string;
  interval: ChartInterval;
  candle: OHLCV;
}

export type WsMessage = WsTickerMessage | WsOrderBookMessage | WsKlineMessage;

/* ─── UI State ──────────────────────────────────────────────────────────── */

export type AppScreen = "home" | "markets" | "trade" | "earn" | "me";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  description?: string;
  duration?: number;
}

export interface BottomSheetState {
  isOpen: boolean;
  content: React.ReactNode | null;
  title?: string;
  snapPoints?: number[];
}

/* ─── Favorites ─────────────────────────────────────────────────────────── */

export interface UserPreferences {
  favoriteTokens: string[];
  shortcutOrder: string[];
  defaultOrderType: OrderType;
  chartInterval: ChartInterval;
  language: "en" | "sw";
  dataSaver: boolean;
  autoEarn: boolean;
}

/* ─── Feedback ──────────────────────────────────────────────────────────── */

export interface FeedbackPayload {
  message: string;
}

export interface Feedback {
  id: string;
  uid: string;
  userEmail: string;
  message: string;
  status: "new" | "read" | "resolved";
  createdAt: string;
}

/* ─── System Config ──────────────────────────────────────────────────────── */

export interface SystemConfig {
  paybillNumber: string;
  depositFeePercent: string;
  withdrawalFeePercent: string;
  tradingSpreadPercent: string;
  dailyWithdrawalLimitKes: string;
  minDepositKes: string;
  minWithdrawalKes: string;
  maintenanceMode: boolean;
  mpesaDisplayName: string;
}

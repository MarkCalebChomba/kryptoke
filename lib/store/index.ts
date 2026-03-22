import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  User,
  Balance,
  ExchangeRate,
  ToastMessage,
  AppScreen,
  Notification,
  UserPreferences,
  WsStatus,
  ChartInterval,
  OrderType,
} from "@/types";

/* ─── Auth Slice ────────────────────────────────────────────────────────── */

interface AuthSlice {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  setUser: (user: User, token: string) => void;
  clearAuth: () => void;
  updateUser: (partial: Partial<User>) => void;
  setLoadingAuth: (loading: boolean) => void;
}

/* ─── Balance Slice ─────────────────────────────────────────────────────── */

interface BalanceSlice {
  balances: Record<string, Balance>;
  rate: ExchangeRate | null;
  isLoadingBalances: boolean;
  setBalance: (asset: string, balance: Balance) => void;
  setBalances: (balances: Balance[]) => void;
  setRate: (rate: ExchangeRate) => void;
  setLoadingBalances: (loading: boolean) => void;
}

/* ─── Price Slice ───────────────────────────────────────────────────────── */

interface PriceSlice {
  prices: Record<string, string>; // symbol/address -> price string
  priceChanges: Record<string, string>; // symbol -> 24h change %
  priceChanges1h: Record<string, string>; // symbol -> 1h change %
  volumes: Record<string, string>; // symbol -> 24h quote volume in USDT
  wsStatus: WsStatus;
  setPrices: (prices: Record<string, string>) => void;
  updatePrice: (symbol: string, price: string, change?: string, change1h?: string, volume?: string) => void;
  setWsStatus: (status: WsStatus) => void;
}

/* ─── Navigation Slice ──────────────────────────────────────────────────── */

interface NavigationSlice {
  activeScreen: AppScreen;
  previousScreen: AppScreen | null;
  setActiveScreen: (screen: AppScreen) => void;
}

/* ─── UI Slice ──────────────────────────────────────────────────────────── */

interface UiSlice {
  toasts: ToastMessage[];
  isBottomSheetOpen: boolean;
  isMenuOpen: boolean;
  isNotificationsOpen: boolean;
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
  setBottomSheetOpen: (open: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
}

/* ─── Notifications Slice ───────────────────────────────────────────────── */

interface NotificationsSlice {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

/* ─── Preferences Slice ─────────────────────────────────────────────────── */

interface PreferencesSlice {
  preferences: UserPreferences;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
  toggleFavorite: (tokenAddress: string) => void;
  isFavorite: (tokenAddress: string) => boolean;
}

/* ─── Combined Store ────────────────────────────────────────────────────── */

type AppStore = AuthSlice &
  BalanceSlice &
  PriceSlice &
  NavigationSlice &
  UiSlice &
  NotificationsSlice &
  PreferencesSlice;

const defaultPreferences: UserPreferences = {
  favoriteTokens: [],
  shortcutOrder: [
    "get_help",
    "demo_trading",
    "referral",
    "campaigns",
    "analysis",
    "copy_trading",
    "transfer",
    "broker",
  ],
  defaultOrderType: "limit" as OrderType,
  chartInterval: "1h" as ChartInterval,
  language: "en",
  dataSaver: false,
  autoEarn: false,
};

export const useAppStore = create<AppStore>()(
  immer(
    persist(
      (set, get) => ({
        /* ── Auth ── */
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoadingAuth: true,

        setUser: (user, token) =>
          set((state) => {
            state.user = user;
            state.accessToken = token;
            state.isAuthenticated = true;
            state.isLoadingAuth = false;
          }),

        clearAuth: () =>
          set((state) => {
            state.user = null;
            state.accessToken = null;
            state.isAuthenticated = false;
            state.isLoadingAuth = false;
          }),

        updateUser: (partial) =>
          set((state) => {
            if (state.user) {
              Object.assign(state.user, partial);
            }
          }),

        setLoadingAuth: (loading) =>
          set((state) => {
            state.isLoadingAuth = loading;
          }),

        /* ── Balances ── */
        balances: {},
        rate: null,
        isLoadingBalances: false,

        setBalance: (asset, balance) =>
          set((state) => {
            state.balances[asset] = balance;
          }),

        setBalances: (balances) =>
          set((state) => {
            balances.forEach((b) => {
              state.balances[b.asset] = b;
            });
          }),

        setRate: (rate) =>
          set((state) => {
            state.rate = rate;
          }),

        setLoadingBalances: (loading) =>
          set((state) => {
            state.isLoadingBalances = loading;
          }),

        /* ── Prices ── */
        prices: {},
        priceChanges: {},
        priceChanges1h: {},
        volumes: {},
        wsStatus: "disconnected",

        setPrices: (prices) =>
          set((state) => {
            state.prices = { ...state.prices, ...prices };
          }),

        updatePrice: (symbol, price, change, change1h, volume) =>
          set((state) => {
            state.prices[symbol] = price;
            if (change !== undefined) state.priceChanges[symbol] = change;
            if (change1h !== undefined) state.priceChanges1h[symbol] = change1h;
            if (volume !== undefined) state.volumes[symbol] = volume;
          }),

        setWsStatus: (status) =>
          set((state) => {
            state.wsStatus = status;
          }),

        /* ── Navigation ── */
        activeScreen: "home",
        previousScreen: null,

        setActiveScreen: (screen) =>
          set((state) => {
            state.previousScreen = state.activeScreen;
            state.activeScreen = screen;
          }),

        /* ── UI ── */
        toasts: [],
        isBottomSheetOpen: false,
        isMenuOpen: false,
        isNotificationsOpen: false,

        addToast: (toast) =>
          set((state) => {
            const id = Math.random().toString(36).slice(2);
            state.toasts.push({ ...toast, id });
          }),

        removeToast: (id) =>
          set((state) => {
            state.toasts = state.toasts.filter((t) => t.id !== id);
          }),

        setBottomSheetOpen: (open) =>
          set((state) => {
            state.isBottomSheetOpen = open;
          }),

        setMenuOpen: (open) =>
          set((state) => {
            state.isMenuOpen = open;
          }),

        setNotificationsOpen: (open) =>
          set((state) => {
            state.isNotificationsOpen = open;
          }),

        /* ── Notifications ── */
        notifications: [],
        unreadCount: 0,

        setNotifications: (notifications) =>
          set((state) => {
            state.notifications = notifications;
            state.unreadCount = notifications.filter((n) => !n.read).length;
          }),

        addNotification: (notification) =>
          set((state) => {
            state.notifications.unshift(notification);
            if (!notification.read) {
              state.unreadCount += 1;
            }
          }),

        markRead: (id) =>
          set((state) => {
            const n = state.notifications.find((n) => n.id === id);
            if (n && !n.read) {
              n.read = true;
              state.unreadCount = Math.max(0, state.unreadCount - 1);
            }
          }),

        markAllRead: () =>
          set((state) => {
            state.notifications.forEach((n) => {
              n.read = true;
            });
            state.unreadCount = 0;
          }),

        /* ── Preferences ── */
        preferences: defaultPreferences,

        setPreferences: (prefs) =>
          set((state) => {
            Object.assign(state.preferences, prefs);
          }),

        toggleFavorite: (tokenAddress) =>
          set((state) => {
            const idx = state.preferences.favoriteTokens.indexOf(tokenAddress);
            if (idx >= 0) {
              state.preferences.favoriteTokens.splice(idx, 1);
            } else {
              state.preferences.favoriteTokens.push(tokenAddress);
            }
          }),

        isFavorite: (tokenAddress) => {
          return get().preferences.favoriteTokens.includes(tokenAddress);
        },
      }),
      {
        name: "_kk_p",
        storage: createJSONStorage(() => localStorage),
        // Only persist non-sensitive, non-live data
        partialize: (state) => ({
          preferences: state.preferences,
          activeScreen: state.activeScreen,
        }),
      }
    )
  )
);

/* ─── Selector Hooks ────────────────────────────────────────────────────── */

export const useAuth = () => useAppStore((s) => ({
  user: s.user,
  isAuthenticated: s.isAuthenticated,
  isLoadingAuth: s.isLoadingAuth,
  setUser: s.setUser,
  clearAuth: s.clearAuth,
  updateUser: s.updateUser,
}));

export const useBalances = () => useAppStore((s) => ({
  balances: s.balances,
  rate: s.rate,
  isLoading: s.isLoadingBalances,
  setBalance: s.setBalance,
  setBalances: s.setBalances,
  setRate: s.setRate,
}));

export const usePrices = () => useAppStore((s) => ({
  prices: s.prices,
  priceChanges: s.priceChanges,
  priceChanges1h: s.priceChanges1h,
  volumes: s.volumes,
  wsStatus: s.wsStatus,
  updatePrice: s.updatePrice,
  setPrices: s.setPrices,
  setWsStatus: s.setWsStatus,
}));

export const useToast = () => useAppStore((s) => ({
  toasts: s.toasts,
  addToast: s.addToast,
  removeToast: s.removeToast,
}));

export const useNotifications = () => useAppStore((s) => ({
  notifications: s.notifications,
  unreadCount: s.unreadCount,
  setNotifications: s.setNotifications,
  addNotification: s.addNotification,
  markRead: s.markRead,
  markAllRead: s.markAllRead,
}));

export const usePreferences = () => useAppStore((s) => ({
  preferences: s.preferences,
  setPreferences: s.setPreferences,
  toggleFavorite: s.toggleFavorite,
  isFavorite: s.isFavorite,
}));

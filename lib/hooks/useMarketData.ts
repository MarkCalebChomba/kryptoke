"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";

interface FearGreedData {
  value: number;
  classification: string;
  timestamp: string | null;
}

interface FearGreedHistoryPoint {
  date: string;
  value: number;
  label: string;
}

interface HomeCoin {
  symbol:     string;
  name:       string;
  logo_url:   string;
  price:      string;
  change_24h: string;
}

interface HomeData {
  homeCoins:  HomeCoin[];
  fearGreed:  FearGreedData;
  fgHistory:  FearGreedHistoryPoint[];
  overview:   { totalVolume24h: string } | null;
}

// ── Fear & Greed (standalone — used on full market analysis page) ─────────────

export function useFearGreed() {
  return useQuery({
    queryKey: ["market", "fear-greed"],
    queryFn: () => apiGet<FearGreedData>("/market/fear-greed"),
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });
}

// ── Home data — one call bundles coins + fear & greed + overview ──────────────

export function useHomeData() {
  return useQuery({
    queryKey: ["market", "home"],
    queryFn: () => apiGet<HomeData>("/market/home"),
    staleTime: 30_000,        // re-fetch every 30s
    refetchInterval: 30_000,
  });
}

// ── Legacy overview — kept for backward compat with admin/analysis pages ──────

export function useMarketOverview() {
  return useQuery({
    queryKey: ["market", "overview"],
    queryFn: () =>
      apiGet<Array<{
        symbol:   string;
        name:     string;
        price:    string;
        kesPrice: string;
        iconUrl:  string | null;
        address:  string;
        isNew:    boolean;
        isSeed:   boolean;
      }>>("/market/overview"),
    staleTime: 30_000,
  });
}

// ── Single ticker — used on trade and token detail pages ──────────────────────

export function useTicker(symbol: string) {
  const query = useQuery({
    queryKey: ["market", "ticker", symbol],
    queryFn: () =>
      apiGet<{
        symbol:              string;
        lastPrice:           string;
        priceChangePercent:  string;
        highPrice:           string;
        lowPrice:            string;
        volume:              string;
        quoteVolume:         string;
      }>(`/market/ticker/${symbol}`),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: !!symbol,
    retry: 1,
  });
  // Return processed fields so pages can destructure directly
  const d = query.data;
  return {
    ...query,
    price:  d?.lastPrice           ?? "0",
    change: d?.priceChangePercent  ?? "0",
    high:   d?.highPrice           ?? "0",
    low:    d?.lowPrice            ?? "0",
    volume: d?.quoteVolume         ?? "0",
  };
}

// ── Coin detail — full metadata + current price from Redis ────────────────────

export function useCoinDetail(symbol: string) {
  return useQuery({
    queryKey: ["market", "coin", symbol],
    queryFn: () =>
      apiGet<{
        symbol:             string;
        name:               string;
        logo_url:           string;
        cmc_rank:           number;
        description:        string | null;
        whitepaper_url:     string | null;
        website_url:        string | null;
        twitter_url:        string | null;
        telegram_url:       string | null;
        reddit_url:         string | null;
        explorer_urls:      string[];
        ath:                string | null;
        ath_date:           string | null;
        atl:                string | null;
        atl_date:           string | null;
        circulating_supply: string | null;
        max_supply:         string | null;
        chain_ids:          string[];
        is_depositable:     boolean;
        price:              string;
        change_24h:         string;
        change_1h:          string;
        volume_24h:         string;
        high_24h:           string;
        low_24h:            string;
      }>(`/market/coins/${symbol}`),
    staleTime: 30_000,
    enabled: !!symbol,
  });
}

// ── Keep useBinanceWebSocket export for pages that haven't migrated yet ────────
// No-op — the new markets page manages its own WebSocket internally.
// This export prevents import errors in the old home page during transition.

export function useBinanceWebSocket() {
  // Markets page now owns the WebSocket — this is intentionally empty
  // to avoid duplicate connections from the home page.
}

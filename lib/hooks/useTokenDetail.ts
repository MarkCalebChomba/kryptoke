"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/api/client";
import type { TokenDetail, PriceAlert, CreateAlertPayload } from "@/types";

/* ─── Token detail (our own DB) ─────────────────────────────────────────── */

export function useTokenDetail(address: string) {
  return useQuery({
    queryKey: ["token", "detail", address],
    queryFn: () => apiGet<TokenDetail>(`/tokens/${address}`),
    staleTime: 5 * 60_000,
    enabled: !!address,
  });
}

/* ─── CoinGecko metadata — proxied through our server ──────────────────── */

interface CoinGeckoData {
  description: string;
  marketCap: string | null;
  circulatingSupply: string | null;
  totalSupply: string | null;
  allTimeHigh: string | null;
  allTimeHighDate: string | null;
  allTimeLow: string | null;
  allTimeLowDate: string | null;
  website: string | null;
  whitepaper: string | null;
  twitter: string | null;
  telegram: string | null;
}

export function useCoinGeckoData(coingeckoId: string | null | undefined) {
  return useQuery({
    queryKey: ["coingecko", coingeckoId],
    queryFn: () => apiGet<CoinGeckoData>(`/market/coingecko/${coingeckoId}`),
    staleTime: 60 * 60_000, // 1 hour — matches server cache
    enabled: !!coingeckoId,
    retry: 1,
  });
}

/* ─── Honeypot check — proxied through our server ───────────────────────── */

interface HoneypotResult {
  isHoneypot: boolean;
  isVerified: boolean;
  deployerAddress: string | null;
  riskLevel: "low" | "medium" | "high" | "unknown";
  message: string;
}

export function useHoneypotCheck(address: string | null | undefined) {
  return useQuery({
    queryKey: ["honeypot", address],
    queryFn: () => apiGet<HoneypotResult>(`/market/honeypot/${address}`),
    staleTime: 30 * 60_000, // 30 min — matches server cache
    enabled: !!address && address.startsWith("0x") && address.length === 42,
    retry: 1,
  });
}

/* ─── Multi-period returns — proxied through our server ─────────────────── */

export function useMultiPeriodReturns(symbol: string) {
  return useQuery({
    queryKey: ["returns", symbol],
    queryFn: () => apiGet<Array<{ label: string; change: string | null }>>(`/market/returns/${symbol}`),
    staleTime: 10 * 60_000, // 10 min — matches server cache
    enabled: !!symbol,
    retry: 1,
  });
}

/* ─── Price alerts ──────────────────────────────────────────────────────── */

export function usePriceAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiGet<PriceAlert[]>("/notifications/alerts"),
    staleTime: 60_000,
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAlertPayload) =>
      apiPost<PriceAlert>("/notifications/alerts", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/notifications/alerts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

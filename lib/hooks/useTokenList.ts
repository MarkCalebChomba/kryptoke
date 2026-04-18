"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";

export interface TokenListCoin {
  symbol: string;
  name: string;
  logo_url: string;
  cmc_rank: number;
  chain_ids?: string[];
  price: string;
  change_24h: string;
  change_1h?: string;
  volume_24h?: string;
  high_24h?: string;
  low_24h?: string;
}

/**
 * Shared token list — one TanStack Query cache entry for the full 200-token list.
 *
 * Any page that imports this hook reads from the same in-memory cache.
 * - Home page uses .data?.slice(0, 50) for the All Markets section
 * - Markets page paginates client-side across the full 200
 * - staleTime: 60s  → navigating Home→Markets→Home never triggers a network refetch
 * - gcTime: 5min    → cache survives brief navigation away and back
 *
 * Backed by GET /market/coins?limit=200 which returns DB tokens merged with Redis prices.
 */
export function useTokenList() {
  return useQuery<TokenListCoin[]>({
    queryKey: ["market", "tokenlist"],
    queryFn: () => apiGet<TokenListCoin[]>("/market/coins?limit=200&tab=all"),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    select: (data) =>
      // Sort by cmc_rank ascending, put unranked at end
      [...data].sort((a, b) => (a.cmc_rank ?? 9999) - (b.cmc_rank ?? 9999)),
  });
}

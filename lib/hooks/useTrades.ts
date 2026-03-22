"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiGet } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import type { TradeQuotePayload, TradeQuoteResponse, TradeSubmitPayload, Trade } from "@/types";

export function useTradeQuote() {
  return useMutation({
    mutationFn: (payload: TradeQuotePayload) =>
      apiPost<TradeQuoteResponse>("/trade/quote", payload),
  });
}

export function useSubmitTrade() {
  const queryClient = useQueryClient();
  const toast = useToastActions();

  return useMutation({
    mutationFn: (payload: TradeSubmitPayload) =>
      apiPost<{ tradeId: string; status: string; quote: TradeQuoteResponse }>(
        "/trade/submit",
        payload
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trade", "history"] });
      queryClient.invalidateQueries({ queryKey: ["wallet", "info"] });
      toast.success("Order submitted", "Your order is being processed");
    },
    onError: (err) => {
      toast.error("Order failed", err instanceof Error ? err.message : undefined);
    },
  });
}

export function useTradeHistory() {
  return useQuery({
    queryKey: ["trade", "history"],
    queryFn: () => apiGet<Trade[]>("/trade/history"),
    staleTime: 30_000,
  });
}

export function useOrderBook(symbol: string) {
  return useQuery({
    queryKey: ["market", "orderbook", symbol],
    queryFn: () =>
      apiGet<{
        symbol: string;
        bids: { price: string; quantity: string; depth: number }[];
        asks: { price: string; quantity: string; depth: number }[];
        spread: string;
        updatedAt: number;
      }>(`/market/orderbook/${symbol}`),
    staleTime: 2000,
    refetchInterval: 3000,
    enabled: !!symbol,
  });
}

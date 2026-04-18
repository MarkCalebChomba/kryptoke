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

// useOrderBook has moved to lib/hooks/useOrderBook.ts (direct Binance WS, 100ms updates)
// Import from there: import { useOrderBook } from "@/lib/hooks/useOrderBook";

export interface ConvertPayload {
  fromAsset: string;
  toAsset: string;
  amount: string;
}

export interface ConvertResult {
  tradeId: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  fee: string;
  feePct: string;
  kesEquiv: string;
}

export function useConvert() {
  const queryClient = useQueryClient();
  const toast = useToastActions();

  return useMutation({
    mutationFn: (payload: ConvertPayload) =>
      apiPost<ConvertResult>("/trade/convert", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trade", "history"] });
      queryClient.invalidateQueries({ queryKey: ["wallet", "info"] });
    },
    onError: (err) => {
      toast.error("Conversion failed", err instanceof Error ? err.message : undefined);
    },
  });
}

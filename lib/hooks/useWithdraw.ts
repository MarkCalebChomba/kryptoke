"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiGet } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import type { WithdrawalLimits, WithdrawalFee, WithdrawalStatus } from "@/types";

/* ─── Limits ────────────────────────────────────────────────────────────── */

export function useWithdrawLimits() {
  return useQuery({
    queryKey: ["withdraw", "limits"],
    queryFn: () => apiGet<WithdrawalLimits>("/withdraw/limits"),
    staleTime: 60_000,
  });
}

export function useWithdrawFee(asset: string, network: string) {
  return useQuery({
    queryKey: ["withdraw", "fee", asset, network],
    queryFn: () =>
      apiGet<WithdrawalFee>(`/withdraw/fee?asset=${asset}&network=${network}`),
    staleTime: 5 * 60_000,
    enabled: !!asset && !!network,
  });
}

/* ─── KES withdrawal ────────────────────────────────────────────────────── */

export function useKesWithdraw() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastActions();
  const [txId, setTxId] = useState<string | null>(null);
  const [status, setStatus] = useState<WithdrawalStatus | null>(null);
  const [mpesaRef, setMpesaRef] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { amount: number; phone: string; assetPin: string }) =>
      apiPost<{ txId: string; netAmount: string; fee: string }>(
        "/withdraw/kes",
        payload
      ),
    onSuccess: (data) => {
      setTxId(data.txId);
      setStatus("processing");
      queryClient.invalidateQueries({ queryKey: ["wallet", "info"] });
      queryClient.invalidateQueries({ queryKey: ["withdraw", "limits"] });
    },
    onError: (err) => {
      toast.error("Withdrawal failed", err instanceof Error ? err.message : undefined);
    },
  });

  // Subscribe to withdrawal status via Supabase Realtime
  useEffect(() => {
    if (!txId || !user) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`withdrawal:${txId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "withdrawals",
          filter: `id=eq.${txId}`,
        },
        (payload) => {
          const row = payload.new as {
            status: WithdrawalStatus;
            mpesa_ref: string | null;
          };
          setStatus(row.status);
          if (row.mpesa_ref) setMpesaRef(row.mpesa_ref);
          if (row.status === "completed" || row.status === "failed" || row.status === "refunded") {
            supabase.removeChannel(channel);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [txId, user]);

  function reset() {
    setTxId(null);
    setStatus(null);
    setMpesaRef(null);
    mutation.reset();
  }

  return {
    submit: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    txId,
    status,
    mpesaRef,
    data: mutation.data,
    reset,
  };
}

/* ─── Crypto withdrawal ─────────────────────────────────────────────────── */

export function useCryptoWithdraw() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      asset: string;
      network: string;
      address: string;
      amount: string;
      assetPin: string;
    }) =>
      apiPost<{ txId: string; amount: string; fee: string; netAmount: string }>(
        "/withdraw/crypto",
        payload
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet", "info"] });
    },
  });
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/store";
import type { MpesaDepositPayload, MpesaDepositResponse, DepositStatus } from "@/types";

export function useMpesaDeposit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [txId, setTxId] = useState<string | null>(null);
  const [depositStatus, setDepositStatus] = useState<DepositStatus | null>(null);
  const [mpesaCode, setMpesaCode] = useState<string | null>(null);
  const [usdtCredited, setUsdtCredited] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: MpesaDepositPayload) =>
      apiPost<MpesaDepositResponse>("/mpesa/deposit", payload),
    onSuccess: (data) => {
      setTxId(data.txId);
      setDepositStatus("pending");
    },
  });

  // Subscribe to deposit status via Supabase Realtime
  useEffect(() => {
    if (!txId || !user) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`deposit:${txId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "deposits",
          filter: `id=eq.${txId}`,
        },
        (payload) => {
          const row = payload.new as {
            status: DepositStatus;
            mpesa_code: string | null;
            usdt_credited: string | null;
          };
          setDepositStatus(row.status);
          if (row.mpesa_code) setMpesaCode(row.mpesa_code);
          if (row.usdt_credited) setUsdtCredited(row.usdt_credited);

          if (row.status === "completed" || row.status === "failed") {
            supabase.removeChannel(channel);
            queryClient.invalidateQueries({ queryKey: ["wallet", "info"] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [txId, user, queryClient]);

  const reset = useCallback(() => {
    setTxId(null);
    setDepositStatus(null);
    setMpesaCode(null);
    setUsdtCredited(null);
    mutation.reset();
  }, [mutation]);

  return {
    initiate: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    txId,
    depositStatus,
    mpesaCode,
    usdtCredited,
    reset,
  };
}

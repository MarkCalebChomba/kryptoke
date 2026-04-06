"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiGet } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/store";
import type { MpesaDepositPayload, MpesaDepositResponse, DepositStatus } from "@/types";

const POLL_INTERVAL_MS = 10_000; // Poll every 10s if Realtime hasn't fired
const POLL_MAX_MS      = 300_000; // Stop polling after 5 minutes

export function useMpesaDeposit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [txId, setTxId]                     = useState<string | null>(null);
  const [depositStatus, setDepositStatus]   = useState<DepositStatus | null>(null);
  const [mpesaCode, setMpesaCode]           = useState<string | null>(null);
  const [usdtCredited, setUsdtCredited]     = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef    = useRef<number>(0);
  const realtimeFiredRef = useRef(false);

  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  function handleStatusUpdate(status: DepositStatus, code?: string | null, usdt?: string | null) {
    setDepositStatus(status);
    if (code)  setMpesaCode(code);
    if (usdt)  setUsdtCredited(usdt);
    if (status === "completed" || status === "failed") {
      stopPolling();
      queryClient.invalidateQueries({ queryKey: ["wallet", "info"] });
    }
  }

  const mutation = useMutation({
    mutationFn: (payload: MpesaDepositPayload) =>
      apiPost<MpesaDepositResponse>("/mpesa/deposit", payload),
    onSuccess: (data) => {
      setTxId(data.txId);
      setDepositStatus("processing");
      realtimeFiredRef.current = false;
      pollStartRef.current = Date.now();
    },
  });

  // ── Supabase Realtime subscription ──────────────────────────────────────
  useEffect(() => {
    if (!txId || !user) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`deposit:${txId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deposits", filter: `id=eq.${txId}` },
        (payload) => {
          const row = payload.new as {
            status: DepositStatus;
            mpesa_code: string | null;
            usdt_credited: string | null;
          };
          realtimeFiredRef.current = true;
          handleStatusUpdate(row.status, row.mpesa_code, row.usdt_credited);
          if (row.status === "completed" || row.status === "failed") {
            supabase.removeChannel(channel);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId, user]);

  // ── Active polling fallback — kicks in if Realtime doesn't fire ─────────
  useEffect(() => {
    if (!txId || !user) return;
    if (depositStatus === "completed" || depositStatus === "failed") return;

    pollIntervalRef.current = setInterval(async () => {
      // If Realtime already handled it, stop
      if (realtimeFiredRef.current) { stopPolling(); return; }
      // If already resolved, stop
      if (depositStatus === "completed" || depositStatus === "failed") { stopPolling(); return; }
      // Timeout
      if (Date.now() - pollStartRef.current > POLL_MAX_MS) {
        stopPolling();
        handleStatusUpdate("failed");
        return;
      }
      try {
        const data = await apiGet<{
          status: DepositStatus; mpesa_code: string | null; usdt_credited: string | null;
        }>(`/mpesa/status/${txId}`);
        // Server may have resolved it via STK query
        if (data.status !== "processing") {
          handleStatusUpdate(data.status, data.mpesa_code, data.usdt_credited);
        }
      } catch { /* ignore network errors during polling */ }
    }, POLL_INTERVAL_MS);

    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId, user, depositStatus]);

  const reset = useCallback(() => {
    stopPolling();
    setTxId(null);
    setDepositStatus(null);
    setMpesaCode(null);
    setUsdtCredited(null);
    realtimeFiredRef.current = false;
    mutation.reset();
  }, [mutation]);

  return {
    initiate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    txId,
    depositStatus,
    mpesaCode,
    usdtCredited,
    reset,
  };
}

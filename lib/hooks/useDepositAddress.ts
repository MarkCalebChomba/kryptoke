"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";

interface DepositAddressResult {
  chainId: string;
  address: string;
  memo: string | null;
  isMemoChain: boolean;
}

export function useDepositAddress(chainId: string | null) {
  return useQuery({
    queryKey: ["deposit", "address", chainId],
    queryFn: () => apiGet<DepositAddressResult>(`/wallet/deposit/address/${chainId}`),
    enabled: !!chainId,
    staleTime: Infinity, // addresses never change
    gcTime: 24 * 60 * 60 * 1000,
  });
}

interface DepositChain {
  chainId: string;
  name: string;
  type: "EVM" | "non-EVM";
  fee: string;
  feePct: string;
  minWithdraw: string;
  arrivalTime: string;
  frozen: boolean;
  hasMemo: boolean;
  nativeSymbol?: string;
}

export function useWithdrawChains(asset: string) {
  return useQuery({
    queryKey: ["withdraw", "chains", asset],
    queryFn: () => apiGet<DepositChain[]>(`/withdraw/chains/${asset}`),
    enabled: !!asset,
    staleTime: 60_000,
  });
}

export function useWithdrawFeeInfo(chainId: string | null, asset: string) {
  return useQuery({
    queryKey: ["withdraw", "fee", chainId, asset],
    queryFn: () => apiGet<{ feeFlat: string; feePct: number; minWithdraw: string; feeAsset: string }>(
      `/withdraw/fee?asset=${asset}&chain=${chainId}`
    ),
    enabled: !!chainId && !!asset,
    staleTime: 30_000,
  });
}

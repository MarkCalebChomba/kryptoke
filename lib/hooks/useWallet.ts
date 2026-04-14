"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { useBalances } from "@/lib/store";
import { useEffect } from "react";
import { portfolioValueKes, usdtToKes, toBig } from "@/lib/utils/money";
import type { WalletInfo, ExchangeRate } from "@/types";

interface WalletInfoResponse extends WalletInfo {
  rate: ExchangeRate;
}

export function useWallet() {
  const { setBalances, setRate, rate: cachedRate } = useBalances();

  const query = useQuery({
    queryKey: ["wallet", "info"],
    queryFn: () => apiGet<WalletInfoResponse>("/wallet/info"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true, // balances must be fresh when user returns to app
  });

  useEffect(() => {
    if (query.data) {
      setRate(query.data.rate);
      setBalances([
        { asset: "KES", amount: query.data.kesBalance, account: "funding", updatedAt: new Date().toISOString() },
        { asset: "USDT", amount: query.data.usdtBalance, account: "funding", updatedAt: new Date().toISOString() },
        { asset: "BNB", amount: query.data.bnbBalance, account: "funding", updatedAt: new Date().toISOString() },
        { asset: "KKE", amount: query.data.kkeBalance ?? "0", account: "funding", updatedAt: new Date().toISOString() },
      ]);
    }
  }, [query.data, setBalances, setRate]);

  const rate = query.data?.rate ?? cachedRate;
  const kesBalance = query.data?.kesBalance ?? "0";
  const usdtBalance = query.data?.usdtBalance ?? "0";
  const bnbBalance = query.data?.bnbBalance ?? "0";
  const kkeBalance = query.data?.kkeBalance ?? "0";
  const kesPerUsd = rate?.kesPerUsd ?? "130";

  const totalKes = portfolioValueKes(kesBalance, usdtBalance, kesPerUsd);
  const totalUsd = toBig(usdtBalance).plus(toBig(kesBalance).div(kesPerUsd)).toFixed(2);
  const usdtInKes = usdtToKes(usdtBalance, kesPerUsd);

  return {
    ...query,
    kesBalance,
    usdtBalance,
    bnbBalance,
    kkeBalance,
    totalKes,
    totalUsd,
    usdtInKes,
    rate,
    depositAddress: query.data?.depositAddress ?? "",
    kycStatus: query.data?.kycStatus ?? "pending",
  };
}

export function useExchangeRate() {
  return useQuery({
    queryKey: ["wallet", "rate"],
    queryFn: () => apiGet<ExchangeRate>("/wallet/rate"),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shared/TopBar";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { priceDirection } from "@/lib/utils/formatters";
import type { DailyPnl } from "@/types";

type AnalysisTab = "Assets" | "Spot PnL" | "Futures PnL" | "History";
type PnlPeriod = "7D" | "30D" | "90D" | "All";

const TABS: AnalysisTab[] = ["Assets", "Spot PnL", "Futures PnL", "History"];
const PERIODS: PnlPeriod[] = ["7D", "30D", "90D", "All"];

function PnlCalendar({ data }: { data: DailyPnl[] }) {
  const today = new Date().toISOString().split("T")[0];
  const byDate = new Map(data.map((d) => [d.date, d]));

  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().split("T")[0] as string;
  });

  return (
    <div className="px-4">
      <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-1.5">Daily PnL — Last 30 days</p>
      <div className="grid grid-cols-7 gap-0.5">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <p key={i} className="font-outfit text-[8px] text-text-muted text-center pb-0.5">{d}</p>
        ))}
        {days.map((date) => {
          const entry = byDate.get(date);
          const pnl = parseFloat(entry?.pnlUsd ?? "0");
          const isToday = date === today;
          const dir = priceDirection(pnl.toString());
          return (
            <div key={date} title={`${date}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT`}
              className={cn(
                "h-6 rounded flex items-center justify-center text-[9px] font-price",
                isToday && "ring-1 ring-primary",
                dir === "up" ? "bg-up/25 text-up" :
                dir === "down" ? "bg-down/25 text-down" :
                "bg-bg-surface2 text-text-muted"
              )}>
              {new Date(date + "T00:00:00").getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AnalysisTab>("Assets");
  const [period, setPeriod] = useState<PnlPeriod>("30D");

  const { data: dailyPnl } = useQuery({
    queryKey: ["analytics", "daily-pnl"],
    queryFn: () => apiGet<DailyPnl[]>("/analytics/daily-pnl"),
    staleTime: 5 * 60_000,
  });

  const { data: spotPnl } = useQuery({
    queryKey: ["analytics", "spot-pnl", period],
    queryFn: () => apiGet<{ totalPnlUsd: string; todayPnlUsd: string }>(`/analytics/spot-pnl?period=${period}`),
    staleTime: 5 * 60_000,
    enabled: tab === "Spot PnL",
  });

  const { data: historyData } = useQuery({
    queryKey: ["wallet", "history", 1],
    queryFn: () => apiGet<{ transactions: Array<{ id: string; asset: string; amount: string; type: string; note: string; created_at: string }>; hasMore: boolean }>("/wallet/history?limit=30"),
    staleTime: 30_000,
    enabled: tab === "History",
  });

  const { data: portfolioHistory } = useQuery({
    queryKey: ["analytics", "portfolio-history", period],
    queryFn: () => {
      const daysMap: Record<PnlPeriod, number> = { "7D": 7, "30D": 30, "90D": 90, "All": 365 };
      return apiGet<Array<{ date: string; value_usd: string; value_kes: string }>>(
        `/analytics/portfolio-history?days=${daysMap[period]}`
      );
    },
    staleTime: 5 * 60_000,
    enabled: tab === "Spot PnL",
  });

  const { data: futuresClosed } = useQuery({
    queryKey: ["futures", "closed"],
    queryFn: () => apiGet<{ data: Array<{ id: string; symbol: string; side: string; realised_pnl: string; leverage: number; entry_price: string; close_price: string; closed_at: string; close_reason: string }> }>("/futures/positions?status=closed"),
    staleTime: 60_000,
    enabled: tab === "Futures PnL",
  });

  function handleTabClick(t: AnalysisTab) {
    setTab(t);
    setTab(t);
  }

  const totalPnl = parseFloat(spotPnl?.totalPnlUsd ?? "0");
  const pnlDir = priceDirection(totalPnl.toString());

  return (
    <div className="screen">
      <TopBar title="Analysis" showBack />

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto no-scrollbar px-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => handleTabClick(t)}
            className={cn(
              "flex-shrink-0 px-4 py-3 font-outfit text-sm font-medium border-b-2 transition-all",
              tab === t ? "text-text-primary border-primary" : "text-text-muted border-transparent"
            )}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Assets" && (
        <div className="pt-4">
          <PnlCalendar data={dailyPnl ?? []} />
        </div>
      )}

      {tab === "Spot PnL" && (
        <div className="pt-4">
          {/* Period selector */}
          <div className="flex gap-2 px-4 mb-4">
            {PERIODS.map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg font-outfit text-xs font-medium border transition-all",
                  period === p ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-text-muted"
                )}>
                {p}
              </button>
            ))}
          </div>

          {/* PnL summary */}
          <div className="px-4 mb-4">
            <p className="font-outfit text-xs text-text-muted mb-1">Total PnL ({period})</p>
            <p className={cn(
              "font-price text-3xl font-medium",
              pnlDir === "up" ? "text-up" : pnlDir === "down" ? "text-down" : "text-text-secondary"
            )}>
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} USDT
            </p>
            <p className="font-outfit text-sm text-text-muted mt-1">
              Today: <span className={cn(
                "font-price",
                parseFloat(spotPnl?.todayPnlUsd ?? "0") >= 0 ? "text-up" : "text-down"
              )}>
                {parseFloat(spotPnl?.todayPnlUsd ?? "0") >= 0 ? "+" : ""}
                {parseFloat(spotPnl?.todayPnlUsd ?? "0").toFixed(2)} USDT
              </span>
            </p>
          </div>

          {/* PnL sparkline — real portfolio history */}
          <div className="mx-4 h-40 card-2 overflow-hidden relative">
            {!portfolioHistory || portfolioHistory.length < 2 ? (
              <div className="flex items-center justify-center h-full">
                <p className="font-outfit text-xs text-text-muted">
                  {portfolioHistory ? "Not enough data yet — chart builds after your first trade" : "Loading..."}
                </p>
              </div>
            ) : (() => {
              const values = portfolioHistory.map(p => parseFloat(p.value_usd));
              const min = Math.min(...values);
              const max = Math.max(...values);
              const range = max - min || 1;
              const w = 300;
              const h = 100;
              const pts = values.map((v, i) => {
                const x = (i / (values.length - 1)) * w;
                const y = h - ((v - min) / range) * (h - 10) - 5;
                return `${x},${y}`;
              }).join(" ");
              const lastVal = values[values.length - 1]!;
              const firstVal = values[0]!;
              const isUp = lastVal >= firstVal;
              const color = isUp ? "var(--color-up)" : "var(--color-down)";
              const fillColor = isUp ? "rgba(0,214,143,0.08)" : "rgba(255,69,96,0.08)";
              const fillPts = `0,${h} ${pts} ${w},${h}`;
              return (
                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
                  <polygon points={fillPts} fill={fillColor} />
                  <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              );
            })()}
          </div>
        </div>
      )}

      {tab === "Futures PnL" && (
        <div className="pt-4 px-4">
          <p className="font-syne font-semibold text-sm text-text-primary mb-3">Closed Futures Positions</p>
          {!futuresClosed ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
          ) : !futuresClosed.data?.length ? (
            <div className="text-center py-10">
              <p className="font-outfit text-text-muted text-sm">No closed positions yet</p>
              <p className="font-outfit text-text-muted text-xs mt-1">Go to Trade → Futures to open positions</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {futuresClosed.data.map((pos) => {
                const pnl = parseFloat(pos.realised_pnl ?? "0");
                return (
                  <div key={pos.id} className="flex items-center gap-3 py-3">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-price text-xs font-bold",
                      pos.side === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down")}>
                      {pos.side === "long" ? "L" : "S"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-outfit text-sm text-text-primary">{pos.symbol} · {pos.leverage}×</p>
                      <p className="font-outfit text-[10px] text-text-muted">
                        Entry ${parseFloat(pos.entry_price).toFixed(2)} → Close ${parseFloat(pos.close_price ?? "0").toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn("font-price text-sm font-semibold", pnl >= 0 ? "text-up" : "text-down")}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} USDT
                      </p>
                      <p className="font-outfit text-[10px] text-text-muted capitalize">{pos.close_reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "History" && (
        <div className="pt-4 px-4">
          <p className="font-syne font-semibold text-sm text-text-primary mb-3">Transaction History</p>
          {!historyData ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-12 rounded-xl" />
              ))}
            </div>
          ) : historyData.transactions.length === 0 ? (
            <p className="text-center text-text-muted font-outfit text-sm py-8">No transactions yet</p>
          ) : (
            <div className="space-y-0 divide-y divide-border/40">
              {historyData.transactions.map((tx) => {
                const amt = parseFloat(tx.amount);
                const isPositive = amt >= 0;
                return (
                  <div key={tx.id} className="flex items-center gap-3 py-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm",
                      isPositive ? "bg-up/15 text-up" : "bg-down/15 text-down"
                    )}>
                      {isPositive ? "↑" : "↓"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-outfit text-sm text-text-primary capitalize truncate">
                        {tx.type.replace(/_/g, " ")}
                      </p>
                      <p className="font-outfit text-[10px] text-text-muted truncate">{tx.note || "—"}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn("font-price text-sm font-semibold", isPositive ? "text-up" : "text-down")}>
                        {isPositive ? "+" : ""}{amt.toFixed(6)} {tx.asset}
                      </p>
                      <p className="font-outfit text-[10px] text-text-muted">
                        {new Date(tx.created_at).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

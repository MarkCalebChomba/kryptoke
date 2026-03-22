"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shared/TopBar";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { priceDirection } from "@/lib/utils/formatters";
import { useWallet } from "@/lib/hooks/useWallet";
import { usePrices } from "@/lib/store";
import type { DailyPnl } from "@/types";

type AnalysisTab = "Assets" | "Spot PnL" | "Futures PnL" | "History";
type PnlPeriod   = "7D" | "30D" | "90D" | "All";

const TABS:    AnalysisTab[] = ["Assets", "Spot PnL", "Futures PnL", "History"];
const PERIODS: PnlPeriod[]   = ["7D", "30D", "90D", "All"];

/* ─── Compact PnL calendar ───────────────────────────────────────────────── */
function PnlCalendar({ data, label }: { data: DailyPnl[]; label?: string }) {
  const today  = new Date().toISOString().split("T")[0];
  const byDate = new Map(data.map((d) => [d.date, d]));
  const days   = Array.from({ length: 35 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (34 - i));
    return d.toISOString().split("T")[0] as string;
  });

  return (
    <div>
      {label && <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide mb-1.5">{label}</p>}
      <div className="grid grid-cols-7 gap-0.5">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <p key={i} className="font-outfit text-[8px] text-text-muted text-center pb-0.5">{d}</p>
        ))}
        {days.map((date) => {
          const entry  = byDate.get(date);
          const pnl    = parseFloat(entry?.pnlUsd ?? "0");
          const isToday= date === today;
          const dir    = priceDirection(pnl.toString());
          return (
            <div key={date}
              title={`${date}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT`}
              className={cn(
                "h-5 rounded-sm flex items-center justify-center text-[8px] font-price leading-none",
                isToday && "ring-1 ring-primary ring-inset",
                dir === "up"   ? "bg-up/25 text-up" :
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

/* ─── Daily PnL table — shows date + pnl rows ───────────────────────────── */
function DailyPnlTable({ data, period }: { data: DailyPnl[]; period: PnlPeriod }) {
  const days = period === "7D" ? 7 : period === "30D" ? 30 : period === "90D" ? 90 : 365;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const filtered = [...data]
    .filter(d => new Date(d.date) >= cutoff && parseFloat(d.pnlUsd ?? "0") !== 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  if (filtered.length === 0) {
    return <p className="text-center text-text-muted font-outfit text-xs py-4">No trading activity in this period</p>;
  }

  const total = filtered.reduce((sum, d) => sum + parseFloat(d.pnlUsd ?? "0"), 0);

  return (
    <div>
      {/* Total row */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-surface2 rounded-lg mb-2">
        <span className="font-outfit text-xs text-text-muted">Total ({period})</span>
        <span className={cn("font-price text-sm font-bold", total >= 0 ? "text-up" : "text-down")}>
          {total >= 0 ? "+" : ""}{total.toFixed(4)} USDT
        </span>
      </div>
      {/* Date rows */}
      <div className="divide-y divide-border/30">
        {filtered.map((d) => {
          const pnl = parseFloat(d.pnlUsd ?? "0");
          return (
            <div key={d.date} className="flex items-center justify-between py-2">
              <span className="font-outfit text-xs text-text-muted">
                {new Date(d.date + "T00:00:00").toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
              </span>
              <span className={cn("font-price text-xs font-semibold", pnl >= 0 ? "text-up" : "text-down")}>
                {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} USDT
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function AnalysisPage() {
  const router = useRouter();
  const [tab,    setTab]    = useState<AnalysisTab>("Assets");
  const [period, setPeriod] = useState<PnlPeriod>("30D");

  const { kesBalance, usdtBalance, bnbBalance, totalKes, totalUsd, rate } = useWallet();
  const { prices } = usePrices();

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
    queryKey: ["wallet", "history"],
    queryFn: () => apiGet<{ transactions: Array<{ id: string; asset: string; amount: string; type: string; note: string; created_at: string }>; hasMore: boolean }>("/wallet/history?limit=50"),
    staleTime: 30_000,
    enabled: tab === "History",
  });

  const { data: portfolioHistory } = useQuery({
    queryKey: ["analytics", "portfolio-history", period],
    queryFn: () => {
      const daysMap: Record<PnlPeriod, number> = { "7D":7, "30D":30, "90D":90, "All":365 };
      return apiGet<Array<{ date: string; value_usd: string; value_kes: string }>>(`/analytics/portfolio-history?days=${daysMap[period]}`);
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

  const totalPnl = parseFloat(spotPnl?.totalPnlUsd ?? "0");
  const pnlDir   = priceDirection(totalPnl.toString());
  const kesPerUsd = rate?.kesPerUsd ?? "130";

  return (
    <div className="screen">
      <TopBar title="Analysis" showBack />

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-shrink-0 px-4 py-3 font-outfit text-sm font-medium border-b-2 transition-all",
              tab === t ? "text-text-primary border-primary" : "text-text-muted border-transparent")}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Assets tab ─────────────────────────────────────────────────── */}
      {tab === "Assets" && (
        <div className="pt-4 px-4 space-y-4">
          {/* Portfolio total */}
          <div className="card">
            <p className="font-outfit text-xs text-text-muted mb-1">Total Portfolio</p>
            <p className="font-price text-2xl font-medium text-text-primary">
              KSh {parseFloat(totalKes).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
            </p>
            <p className="font-outfit text-sm text-text-muted mt-0.5">≈ ${parseFloat(totalUsd).toFixed(2)} USD</p>
          </div>

          {/* Allocation breakdown — colored left borders */}
          <div className="space-y-2">
            <p className="font-outfit text-xs text-text-muted uppercase tracking-wide">Allocation</p>
            {[
              { label: "KES Funding",   value: `KSh ${parseFloat(kesBalance).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`,  sub: `≈ $${(parseFloat(kesBalance)/parseFloat(kesPerUsd)).toFixed(2)}`, color: "#00E5B4" },
              { label: "USDT Trading",  value: `${parseFloat(usdtBalance).toFixed(4)} USDT`,  sub: `≈ KSh ${(parseFloat(usdtBalance)*parseFloat(kesPerUsd)).toFixed(0)}`, color: "#F0B429" },
              { label: "BNB",           value: `${parseFloat(bnbBalance).toFixed(6)} BNB`,    sub: `≈ $${(parseFloat(bnbBalance)*(parseFloat(prices["BNBUSDT"]??"300"))).toFixed(2)}`, color: "#FF8C00" },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-border bg-bg-surface"
                style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
                <div className="flex-1 min-w-0">
                  <p className="font-outfit text-xs text-text-muted">{label}</p>
                  <p className="font-price text-sm font-medium text-text-primary mt-0.5">{value}</p>
                </div>
                <p className="font-outfit text-xs text-text-muted flex-shrink-0">{sub}</p>
              </div>
            ))}
          </div>

          {/* PnL calendar */}
          <div>
            <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">Daily PnL Heatmap</p>
            <PnlCalendar data={dailyPnl ?? []} />
          </div>
        </div>
      )}

      {/* ── Spot PnL tab ───────────────────────────────────────────────── */}
      {tab === "Spot PnL" && (
        <div className="pt-4 px-4 space-y-4">
          {/* Period selector */}
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("flex-1 py-1.5 rounded-lg font-outfit text-xs font-medium border transition-all",
                  period === p ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-text-muted")}>
                {p}
              </button>
            ))}
          </div>

          {/* PnL summary card */}
          <div className="card">
            <p className="font-outfit text-xs text-text-muted mb-1">Total Spot PnL · {period}</p>
            <p className={cn("font-price text-2xl font-medium",
              pnlDir === "up" ? "text-up" : pnlDir === "down" ? "text-down" : "text-text-secondary")}>
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(4)} USDT
            </p>
            <p className="font-outfit text-xs text-text-muted mt-1">
              Today: <span className={cn("font-price", parseFloat(spotPnl?.todayPnlUsd??"0")>=0?"text-up":"text-down")}>
                {parseFloat(spotPnl?.todayPnlUsd??"0")>=0?"+":""}{parseFloat(spotPnl?.todayPnlUsd??"0").toFixed(4)} USDT
              </span>
            </p>
          </div>

          {/* Sparkline */}
          {portfolioHistory && portfolioHistory.length >= 2 && (() => {
            const vals = portfolioHistory.map(p => parseFloat(p.value_usd));
            const min = Math.min(...vals), max = Math.max(...vals), range = max-min||1;
            const w=300, h=80;
            const pts = vals.map((v,i)=>`${(i/(vals.length-1))*w},${h-((v-min)/range)*(h-10)-5}`).join(" ");
            const isUp = vals[vals.length-1]! >= vals[0]!;
            const color = isUp ? "var(--color-up)" : "var(--color-down)";
            return (
              <div className="h-20 rounded-xl border border-border overflow-hidden">
                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
                  <polygon points={`0,${h} ${pts} ${w},${h}`} fill={isUp?"rgba(0,214,143,0.08)":"rgba(255,69,96,0.08)"} />
                  <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            );
          })()}

          {/* PnL calendar */}
          <PnlCalendar data={dailyPnl ?? []} label="Daily Heatmap" />

          {/* Daily PnL table */}
          <div>
            <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">Daily Breakdown</p>
            <DailyPnlTable data={dailyPnl ?? []} period={period} />
          </div>
        </div>
      )}

      {/* ── Futures PnL tab ────────────────────────────────────────────── */}
      {tab === "Futures PnL" && (
        <div className="pt-4 px-4">
          <p className="font-syne font-semibold text-sm text-text-primary mb-3">Closed Positions</p>
          {!futuresClosed ? (
            <div className="space-y-2">{Array.from({length:3}).map((_,i)=><div key={i} className="skeleton h-12 rounded-xl"/>)}</div>
          ) : !futuresClosed.data?.length ? (
            <div className="text-center py-10">
              <p className="font-outfit text-text-muted text-sm">No closed positions yet</p>
              <p className="font-outfit text-text-muted text-xs mt-1">Open positions in Trade → Futures</p>
            </div>
          ) : (
            <>
              {/* Futures daily PnL summary */}
              {dailyPnl && dailyPnl.length > 0 && (
                <div className="mb-4">
                  <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">Daily PnL Heatmap</p>
                  <PnlCalendar data={dailyPnl} />
                </div>
              )}

              {/* Closed positions list */}
              <div className="divide-y divide-border/40 border border-border rounded-xl overflow-hidden">
                {futuresClosed.data.map((pos) => {
                  const pnl = parseFloat(pos.realised_pnl ?? "0");
                  return (
                    <div key={pos.id} className="flex items-center gap-3 px-3 py-2.5 bg-bg-surface">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-price text-[10px] font-bold",
                        pos.side==="long"?"bg-up/15 text-up":"bg-down/15 text-down")}>
                        {pos.side==="long"?"L":"S"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-outfit text-xs text-text-primary">{pos.symbol} · {pos.leverage}×</p>
                        <p className="font-outfit text-[9px] text-text-muted">
                          ${parseFloat(pos.entry_price).toFixed(2)} → ${parseFloat(pos.close_price??0).toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("font-price text-xs font-bold", pnl>=0?"text-up":"text-down")}>
                          {pnl>=0?"+":""}{pnl.toFixed(4)}
                        </p>
                        <p className="font-outfit text-[9px] text-text-muted capitalize">{pos.close_reason}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── History tab ────────────────────────────────────────────────── */}
      {tab === "History" && (
        <div className="pt-4 px-4">
          <p className="font-syne font-semibold text-sm text-text-primary mb-3">Transaction History</p>
          {!historyData ? (
            <div className="space-y-2">{Array.from({length:8}).map((_,i)=><div key={i} className="skeleton h-11 rounded-xl"/>)}</div>
          ) : historyData.transactions.length === 0 ? (
            <p className="text-center text-text-muted font-outfit text-sm py-8">No transactions yet</p>
          ) : (
            <div className="divide-y divide-border/40 border border-border rounded-xl overflow-hidden">
              {historyData.transactions.map((tx) => {
                const amt = parseFloat(tx.amount);
                const isPos = amt >= 0;
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 bg-bg-surface">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold",
                      isPos?"bg-up/15 text-up":"bg-down/15 text-down")}>
                      {isPos?"↑":"↓"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-outfit text-xs font-medium text-text-primary capitalize truncate">
                        {tx.type.replace(/_/g," ")}
                      </p>
                      <p className="font-outfit text-[9px] text-text-muted truncate">{tx.note || "—"}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn("font-price text-xs font-semibold", isPos?"text-up":"text-down")}>
                        {isPos?"+":""}{amt.toFixed(4)} {tx.asset}
                      </p>
                      <p className="font-outfit text-[9px] text-text-muted">
                        {new Date(tx.created_at).toLocaleDateString("en-KE",{month:"short",day:"numeric"})}
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

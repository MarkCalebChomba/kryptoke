"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { useRealtimeTable } from "@/lib/hooks/useRealtime";
import { formatKes, formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import type { AdminDashboardMetrics, AdminOrder } from "@/types";

/* ─── Metric card ───────────────────────────────────────────────────────── */

function MetricCard({
  label, value, sub, color, alert,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  alert?: boolean;
}) {
  return (
    <div className={cn(
      "bg-bg-surface border rounded-2xl p-4",
      alert ? "border-gold/40 bg-gold/5" : "border-border"
    )}>
      <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={cn(
        "font-price text-2xl font-medium",
        color ?? "text-text-primary",
        alert && "text-gold"
      )}>
        {value}
      </p>
      {sub && <p className="font-outfit text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  );
}

/* ─── Pending order row ─────────────────────────────────────────────────── */

function PendingOrderRow({ order }: { order: AdminOrder & { users: { email: string; deposit_address: string } } }) {
  const [txHash, setTxHash] = useState("");
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const fulfill = useMutation({
    mutationFn: () => apiPost(`/admin/orders/${order.id}/fulfill`, { txHash }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
  });

  const minutesAgo = Math.floor(
    (Date.now() - new Date(order.created_at).getTime()) / 60_000
  );

  return (
    <div className={cn(
      "border rounded-2xl p-4 transition-all",
      minutesAgo > 10 ? "border-down/30 bg-down/5" : "border-gold/30 bg-gold/5"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-outfit text-sm font-semibold text-text-primary">
            {order.side === "buy" ? "Buy" : "Sell"} {parseFloat(order.amount_in).toFixed(4)}
            <span className="text-text-muted font-normal ml-1">{order.token_in.slice(0, 10)}...</span>
          </p>
          <p className="font-outfit text-xs text-text-muted">{order.users?.email} · {minutesAgo}m ago</p>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-primary font-outfit text-xs font-medium"
        >
          {expanded ? "Hide" : "Fulfill"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="bg-bg rounded-xl p-3 border border-border">
            <p className="font-outfit text-xs text-text-muted mb-1">Deposit address</p>
            <p className="font-price text-xs text-text-primary break-all">
              {order.users?.deposit_address}
            </p>
          </div>
          <input
            type="text"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="Paste transaction hash (0x...)"
            className="w-full bg-bg border border-border rounded-xl px-3 py-2 font-price text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-primary"
          />
          <button
            onClick={() => fulfill.mutate()}
            disabled={!txHash || fulfill.isPending}
            className="w-full py-2.5 rounded-xl bg-primary font-outfit font-semibold text-sm text-bg disabled:opacity-50"
          >
            {fulfill.isPending ? "Verifying on-chain..." : "Mark Fulfilled"}
          </button>
          {fulfill.isError && (
            <p className="text-down font-outfit text-xs">
              {fulfill.error instanceof Error ? fulfill.error.message : "Failed"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Live transaction feed ─────────────────────────────────────────────── */

interface LedgerEntry {
  id: string;
  uid: string;
  asset: string;
  amount: string;
  type: string;
  created_at: string;
}

function TransactionFeed() {
  const [feed, setFeed] = useState<LedgerEntry[]>([]);

  const { data: initial } = useQuery({
    queryKey: ["admin", "feed"],
    queryFn: () => apiGet<{ items: LedgerEntry[] }>("/admin/transactions?page=1"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (initial?.items) setFeed(initial.items.slice(0, 15));
  }, [initial]);

  useRealtimeTable<LedgerEntry>({
    table: "ledger_entries",
    event: "INSERT",
    onPayload: ({ new: entry }) => {
      setFeed((prev) => [entry, ...prev].slice(0, 20));
    },
  });

  const typeColors: Record<string, string> = {
    deposit: "text-up",
    withdrawal: "text-down",
    trade: "text-primary",
    earn: "text-gold",
    fee: "text-text-muted",
    admin_adjustment: "text-text-secondary",
  };

  return (
    <div className="bg-bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="font-syne font-bold text-sm text-text-primary">Live Transactions</p>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-up animate-pulse-slow" />
          <span className="font-outfit text-xs text-text-muted">Live</span>
        </div>
      </div>
      <div className="divide-y divide-border/50 max-h-80 overflow-y-auto">
        {feed.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-outfit text-sm text-text-muted">Waiting for transactions...</p>
          </div>
        ) : (
          feed.map((entry, i) => (
            <div key={entry.id ?? i} className={cn("flex items-center gap-3 px-4 py-2.5", i === 0 && "animate-fade-in")}>
              <div className={cn(
                "flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-outfit font-semibold uppercase",
                entry.type === "deposit" ? "bg-up/10 text-up" :
                entry.type === "withdrawal" ? "bg-down/10 text-down" :
                entry.type === "trade" ? "bg-primary/10 text-primary" :
                "bg-bg-surface2 text-text-muted"
              )}>
                {entry.type}
              </div>
              <p className={cn("font-price text-sm flex-1", typeColors[entry.type] ?? "text-text-secondary")}>
                {parseFloat(entry.amount) >= 0 ? "+" : ""}{parseFloat(entry.amount).toFixed(4)} {entry.asset}
              </p>
              <p className="font-outfit text-xs text-text-muted flex-shrink-0">
                {formatTimeAgo(entry.created_at)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Dashboard page ────────────────────────────────────────────────────── */

export default function AdminDashboardPage() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => apiGet<AdminDashboardMetrics>("/admin/dashboard"),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: pendingOrdersData } = useQuery({
    queryKey: ["admin", "orders", "pending"],
    queryFn: () => apiGet<(AdminOrder & { users: { email: string; deposit_address: string } })[]>("/admin/orders/pending"),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const pendingOrders = pendingOrdersData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne font-bold text-xl text-text-primary">Dashboard</h1>
          <p className="font-outfit text-sm text-text-muted mt-0.5">
            {new Date().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-bg-surface border border-border rounded-full px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-up animate-pulse-slow" />
          <span className="font-outfit text-xs text-text-muted">Live</span>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard
          label="Total Users"
          value={isLoading ? "—" : (metrics?.totalUsers ?? 0).toLocaleString()}
          sub={metrics?.totalUsersChange ? `${metrics.totalUsersChange > 0 ? "+" : ""}${metrics.totalUsersChange}% this week` : undefined}
          color={metrics?.totalUsersChange && metrics.totalUsersChange > 0 ? "text-up" : undefined}
        />
        <MetricCard
          label="Deposits Today"
          value={isLoading ? "—" : `KSh ${parseFloat(metrics?.depositsTodayKes ?? "0").toLocaleString()}`}
          sub={`${metrics?.depositsTodayUsdt ?? "0"} USDT`}
          color="text-up"
        />
        <MetricCard
          label="Withdrawals Today"
          value={isLoading ? "—" : `KSh ${parseFloat(metrics?.withdrawalsTodayKes ?? "0").toLocaleString()}`}
          color="text-down"
        />
        <MetricCard
          label="Pending Orders"
          value={isLoading ? "—" : (metrics?.pendingOrders ?? 0)}
          alert={(metrics?.pendingOrders ?? 0) > 0}
          color={(metrics?.pendingOrders ?? 0) > 5 ? "text-down" : "text-gold"}
        />
        <MetricCard
          label="Revenue Today"
          value={isLoading ? "—" : `${parseFloat(metrics?.revenueToday ?? "0").toFixed(4)} USDT`}
          color="text-primary"
        />
        <MetricCard
          label="Anomalies"
          value={isLoading ? "—" : (metrics?.anomalyCount ?? 0)}
          alert={(metrics?.anomalyCount ?? 0) > 0}
        />
      </div>

      {/* Pending orders — prominent when > 0 */}
      {pendingOrders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-gold animate-pulse-slow" />
            <h2 className="font-syne font-bold text-base text-gold">
              {pendingOrders.length} Pending Order{pendingOrders.length > 1 ? "s" : ""} — Action Required
            </h2>
          </div>
          <div className="space-y-3">
            {pendingOrders.map((order) => (
              <PendingOrderRow key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TransactionFeed />

        {/* Quick links */}
        <div className="bg-bg-surface border border-border rounded-2xl p-4">
          <p className="font-syne font-bold text-sm text-text-primary mb-3">Quick Actions</p>
          <div className="space-y-2">
            {[
              { label: "View all pending orders", href: "/admin/orders" },
              { label: "User management", href: "/admin/users" },
              { label: "System health", href: "/admin/health" },
              { label: "View anomalies", href: "/admin/health" },
              { label: "Manage tokens", href: "/admin/markets" },
              { label: "Publish announcement", href: "/admin/announcements" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-bg-surface2 border border-border hover:border-primary/30 transition-colors"
              >
                <span className="font-outfit text-sm text-text-primary">{label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18L15 12L9 6" stroke="#8A9CC0" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

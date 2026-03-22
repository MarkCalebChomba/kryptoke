"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { formatTimeAgo, formatPrice } from "@/lib/utils/formatters";

interface ServiceStatus {
  name: string;
  status: "up" | "degraded" | "down";
  responseTimeMs?: number;
  error?: string;
  cached?: boolean;
}

interface HealthData {
  services: ServiceStatus[];
  hotWallet: { address: string; bnb: string; usdt: string } | null;
  anomalies: Array<{ id: string; type: string; description: string; severity: string; created_at: string }>;
  balanceDiscrepancies: Array<{ uid: string; asset: string; balance_amount: string; ledger_sum: string; discrepancy: string }>;
  timestamp: string;
}

interface ApiMetric {
  route: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

function StatusDot({ status }: { status: "up" | "degraded" | "down" }) {
  return (
    <div className={cn(
      "w-2.5 h-2.5 rounded-full flex-shrink-0",
      status === "up" ? "bg-up" : status === "degraded" ? "bg-gold" : "bg-down"
    )} />
  );
}

function ServiceCard({ service }: { service: ServiceStatus }) {
  return (
    <div className={cn(
      "bg-bg-surface border rounded-2xl p-4",
      service.status === "up" ? "border-border" :
      service.status === "degraded" ? "border-gold/30" : "border-down/30"
    )}>
      <div className="flex items-center gap-2 mb-2">
        <StatusDot status={service.status} />
        <p className="font-outfit text-sm font-semibold text-text-primary">{service.name}</p>
      </div>
      <p className={cn(
        "font-outfit text-xs font-medium capitalize",
        service.status === "up" ? "text-up" :
        service.status === "degraded" ? "text-gold" : "text-down"
      )}>
        {service.status}
      </p>
      {service.responseTimeMs != null && (
        <p className="font-price text-xs text-text-muted mt-1">{service.responseTimeMs}ms</p>
      )}
      {service.error && (
        <p className="font-outfit text-xs text-down mt-1 truncate">{service.error}</p>
      )}
      {service.cached != null && (
        <p className="font-outfit text-xs text-text-muted mt-1">
          Token: {service.cached ? "Cached" : "Not cached"}
        </p>
      )}
    </div>
  );
}

export default function SystemHealthPage() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => apiGet<HealthData>("/admin/system/health"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: metrics } = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: () => apiGet<ApiMetric[]>("/admin/metrics"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-syne font-bold text-xl text-text-primary">System Health</h1>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-surface border border-border font-outfit text-sm text-text-secondary hover:border-primary/30 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={isLoading ? "animate-spin" : ""}>
            <path d="M23 4V10H17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 20V14H7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3.51 9C4.01717 7.56678 4.87913 6.2854 6.01547 5.27543C7.1518 4.26545 8.52547 3.55953 10.0083 3.22836C11.4911 2.89719 13.0348 2.95196 14.4905 3.38714C15.9462 3.82232 17.2648 4.62299 18.32 5.72L23 10M1 14L5.68 18.28C6.73524 19.377 8.05376 20.1777 9.50952 20.6129C10.9653 21.048 12.5089 21.1028 13.9917 20.7716C15.4745 20.4405 16.8482 19.7345 17.9845 18.7246C19.1209 17.7146 19.9828 16.4332 20.49 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Service status grid */}
      <div>
        <h2 className="font-syne font-semibold text-base text-text-primary mb-3">Services</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-bg-surface border border-border rounded-2xl p-4">
                  <div className="skeleton h-3 w-24 mb-2" />
                  <div className="skeleton h-3 w-12" />
                </div>
              ))
            : (health?.services ?? []).map((s) => (
                <ServiceCard key={s.name} service={s} />
              ))}
        </div>
      </div>

      {/* Hot wallet */}
      {health?.hotWallet && (
        <div>
          <h2 className="font-syne font-semibold text-base text-text-primary mb-3">Hot Wallet</h2>
          <div className="bg-bg-surface border border-border rounded-2xl p-4">
            <p className="font-outfit text-xs text-text-muted mb-2">Address</p>
            <p className="font-price text-xs text-text-primary break-all mb-3">
              {health.hotWallet.address}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg-surface2 border border-border rounded-xl p-3">
                <p className="font-outfit text-xs text-text-muted">BNB (Gas)</p>
                <p className={cn(
                  "font-price text-sm font-medium mt-0.5",
                  parseFloat(health.hotWallet.bnb) < 0.5 ? "text-down" : "text-text-primary"
                )}>
                  {parseFloat(health.hotWallet.bnb).toFixed(4)} BNB
                </p>
                {parseFloat(health.hotWallet.bnb) < 0.5 && (
                  <p className="font-outfit text-xs text-down mt-0.5">Low — top up needed</p>
                )}
              </div>
              <div className="bg-bg-surface2 border border-border rounded-xl p-3">
                <p className="font-outfit text-xs text-text-muted">USDT Balance</p>
                <p className="font-price text-sm font-medium text-primary mt-0.5">
                  {parseFloat(health.hotWallet.usdt).toFixed(4)} USDT
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Balance reconciliation */}
      <div>
        <h2 className="font-syne font-semibold text-base text-text-primary mb-3">Balance Integrity</h2>
        <div className="bg-bg-surface border border-border rounded-2xl p-4">
          {(health?.balanceDiscrepancies ?? []).length === 0 ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-up/10 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17L4 12" stroke="#00D68F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="font-outfit text-sm font-medium text-up">All balances reconciled</p>
                <p className="font-outfit text-xs text-text-muted">
                  Last checked: {health?.timestamp ? formatTimeAgo(health.timestamp) : "—"}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-outfit text-sm font-semibold text-down mb-3">
                {health!.balanceDiscrepancies.length} discrepancies found
              </p>
              <div className="space-y-2">
                {health!.balanceDiscrepancies.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 bg-down/5 border border-down/20 rounded-xl p-3">
                    <div className="flex-1">
                      <p className="font-price text-xs text-text-primary">{d.uid.slice(0, 16)}...</p>
                      <p className="font-outfit text-xs text-text-muted">{d.asset}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-price text-xs text-down">
                        Δ {parseFloat(d.discrepancy).toFixed(6)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Anomalies */}
      {(health?.anomalies ?? []).length > 0 && (
        <div>
          <h2 className="font-syne font-semibold text-base text-text-primary mb-3">
            Active Anomalies ({health!.anomalies.length})
          </h2>
          <div className="space-y-2">
            {health!.anomalies.map((a) => (
              <div key={a.id} className={cn(
                "flex items-start gap-3 rounded-2xl p-4 border",
                a.severity === "high" ? "bg-down/5 border-down/30" :
                a.severity === "medium" ? "bg-gold/5 border-gold/30" :
                "bg-bg-surface border-border"
              )}>
                <div className={cn(
                  "flex-shrink-0 w-2 h-2 rounded-full mt-1.5",
                  a.severity === "high" ? "bg-down" : a.severity === "medium" ? "bg-gold" : "bg-text-muted"
                )} />
                <div className="flex-1">
                  <p className="font-outfit text-sm font-semibold text-text-primary capitalize">
                    {a.type.replace(/_/g, " ")}
                  </p>
                  <p className="font-outfit text-xs text-text-secondary mt-0.5 leading-relaxed">
                    {a.description}
                  </p>
                  <p className="font-outfit text-xs text-text-muted mt-1">
                    {formatTimeAgo(a.created_at)}
                  </p>
                </div>
                <span className={cn(
                  "flex-shrink-0 font-outfit text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                  a.severity === "high" ? "bg-down/10 text-down" :
                  a.severity === "medium" ? "bg-gold/10 text-gold" :
                  "bg-bg-surface2 text-text-muted"
                )}>
                  {a.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API metrics */}
      {(metrics ?? []).length > 0 && (
        <div>
          <h2 className="font-syne font-semibold text-base text-text-primary mb-3">
            API Performance (last hour)
          </h2>
          <div className="bg-bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="grid grid-cols-5 gap-2 px-4 py-2.5 border-b border-border bg-bg-surface2">
              {["Route", "Requests", "p50", "p95", "p99"].map((h) => (
                <p key={h} className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">{h}</p>
              ))}
            </div>
            <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
              {(metrics ?? []).slice(0, 20).map((m) => (
                <div key={m.route} className="grid grid-cols-5 gap-2 px-4 py-2.5">
                  <p className="font-price text-xs text-text-primary truncate col-span-1">{m.route}</p>
                  <p className="font-price text-xs text-text-secondary">{m.count}</p>
                  <p className={cn("font-price text-xs", m.p50 > 1000 ? "text-down" : m.p50 > 500 ? "text-gold" : "text-up")}>{m.p50}ms</p>
                  <p className={cn("font-price text-xs", m.p95 > 2000 ? "text-down" : m.p95 > 1000 ? "text-gold" : "text-text-secondary")}>{m.p95}ms</p>
                  <p className={cn("font-price text-xs", m.p99 > 3000 ? "text-down" : "text-text-muted")}>{m.p99}ms</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

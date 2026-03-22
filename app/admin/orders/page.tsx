"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { useRealtimeTable } from "@/lib/hooks/useRealtime";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

type OrderStatus = "pending_fulfillment" | "processing" | "completed" | "failed" | "all";

interface AdminOrder {
  id: string;
  uid: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string | null;
  price: string | null;
  side: "buy" | "sell";
  order_type: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
  users: { email: string; deposit_address: string };
}

const STATUS_FILTERS: { label: string; value: OrderStatus }[] = [
  { label: "Pending", value: "pending_fulfillment" },
  { label: "Processing", value: "processing" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "All", value: "all" },
];

const STATUS_COLORS: Record<string, string> = {
  pending_fulfillment: "text-gold bg-gold/10",
  processing: "text-primary bg-primary/10",
  completed: "text-up bg-up/10",
  failed: "text-down bg-down/10",
  cancelled: "text-text-muted bg-bg-surface2",
};

export default function AdminOrdersPage() {
  const toast = useToastActions();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<OrderStatus>("pending_fulfillment");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [txHashInputs, setTxHashInputs] = useState<Record<string, string>>({});

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin", "orders", statusFilter],
    queryFn: () =>
      apiGet<AdminOrder[]>(
        statusFilter === "pending_fulfillment" || statusFilter === "all"
          ? "/admin/orders/pending"
          : "/admin/orders/pending"
      ),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  // Live updates for new pending orders
  useRealtimeTable<{ id: string; status: string }>({
    table: "trades",
    event: "INSERT",
    filter: "status=eq.pending_fulfillment",
    onPayload: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  const fulfill = useMutation({
    mutationFn: ({ id, txHash }: { id: string; txHash: string }) =>
      apiPost(`/admin/orders/${id}/fulfill`, { txHash }),
    onSuccess: (_, { id }) => {
      toast.success("Order fulfilled");
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setExpandedId(null);
      setTxHashInputs((prev) => { const next = { ...prev }; delete next[id]; return next; });
    },
    onError: (err) => {
      toast.error("Fulfillment failed", err instanceof Error ? err.message : undefined);
    },
  });

  function exportCsv() {
    if (!orders) return;
    const rows = [
      ["ID", "User", "Side", "Token In", "Amount In", "Token Out", "Status", "Created"],
      ...orders.map((o) => [
        o.id, o.users?.email ?? o.uid, o.side, o.token_in, o.amount_in, o.token_out, o.status, o.created_at,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orders-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = (orders ?? []).filter(
    (o) => statusFilter === "all" || o.status === statusFilter
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-syne font-bold text-xl text-text-primary">Orders Queue</h1>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-surface border border-border font-outfit text-sm text-text-secondary hover:border-primary/30 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M21 15V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
          Export CSV
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-xl font-outfit text-sm font-medium border transition-all",
              statusFilter === value
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-text-muted hover:border-border-2"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Orders */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-bg-surface border border-border rounded-2xl p-4">
              <div className="skeleton h-4 w-48 mb-2" />
              <div className="skeleton h-3 w-32" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-bg-surface border border-border rounded-2xl py-16 text-center">
          <p className="font-outfit text-sm text-text-muted">
            {statusFilter === "pending_fulfillment" ? "No pending orders" : "No orders found"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const minutesAgo = Math.floor(
              (Date.now() - new Date(order.created_at).getTime()) / 60_000
            );
            const isUrgent = order.status === "pending_fulfillment" && minutesAgo > 5;

            return (
              <div
                key={order.id}
                className={cn(
                  "bg-bg-surface border rounded-2xl overflow-hidden transition-all",
                  isUrgent ? "border-down/40" : "border-border"
                )}
              >
                {/* Order summary row */}
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "font-outfit text-xs font-bold uppercase px-2 py-0.5 rounded",
                        order.side === "buy" ? "bg-up/10 text-up" : "bg-down/10 text-down"
                      )}>
                        {order.side}
                      </span>
                      <span className="font-price text-sm text-text-primary">
                        {parseFloat(order.amount_in).toFixed(4)}
                      </span>
                      <span className="font-outfit text-xs text-text-muted truncate max-w-[120px]">
                        {order.token_in.slice(0, 12)}...
                      </span>
                    </div>
                    <p className="font-outfit text-xs text-text-muted mt-0.5">
                      {order.users?.email} · {minutesAgo}m ago
                      {isUrgent && (
                        <span className="ml-2 text-down font-semibold">URGENT</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "font-outfit text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                      STATUS_COLORS[order.status] ?? "text-text-muted bg-bg-surface2"
                    )}>
                      {order.status.replace(/_/g, " ")}
                    </span>

                    {order.status === "pending_fulfillment" && (
                      <button
                        onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                        className="text-primary font-outfit text-xs font-semibold"
                      >
                        {expandedId === order.id ? "Cancel" : "Fulfill"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Fulfillment panel */}
                {expandedId === order.id && (
                  <div className="border-t border-border px-4 py-4 bg-bg space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-bg-surface2 border border-border rounded-xl p-3">
                        <p className="font-outfit text-[10px] text-text-muted mb-1">Deposit address</p>
                        <p className="font-price text-xs text-text-primary break-all">
                          {order.users?.deposit_address}
                        </p>
                      </div>
                      <div className="bg-bg-surface2 border border-border rounded-xl p-3">
                        <p className="font-outfit text-[10px] text-text-muted mb-1">Amount to send</p>
                        <p className="font-price text-sm text-text-primary">
                          {parseFloat(order.amount_in).toFixed(6)} {order.token_in.slice(0, 8)}
                        </p>
                        {order.price && (
                          <p className="font-outfit text-xs text-text-muted mt-0.5">
                            @ {parseFloat(order.price).toFixed(4)} USDT
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block font-outfit text-xs text-text-secondary mb-1.5">
                        Transaction hash (after executing on Binance/OKX)
                      </label>
                      <input
                        type="text"
                        value={txHashInputs[order.id] ?? ""}
                        onChange={(e) =>
                          setTxHashInputs((prev) => ({ ...prev, [order.id]: e.target.value.trim() }))
                        }
                        placeholder="0x..."
                        className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 font-price text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-primary"
                      />
                    </div>

                    <button
                      onClick={() => {
                        const txHash = txHashInputs[order.id] ?? "";
                        if (!txHash.match(/^0x[0-9a-fA-F]{64}$/)) {
                          toast.error("Invalid transaction hash format");
                          return;
                        }
                        fulfill.mutate({ id: order.id, txHash });
                      }}
                      disabled={!txHashInputs[order.id] || fulfill.isPending}
                      className="w-full py-3 rounded-xl bg-primary font-outfit font-semibold text-sm text-bg disabled:opacity-50 active:opacity-85 transition-opacity"
                    >
                      {fulfill.isPending ? "Verifying on-chain..." : "Mark Fulfilled"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

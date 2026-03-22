"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

type WqStatus = "awaiting_admin" | "queued" | "pending_cancel" | "broadcasting" | "completed" | "failed" | "rejected" | "all";

interface WithdrawalQueueItem {
  id: string;
  uid: string;
  asset_symbol: string;
  chain_id: string;
  chain_name: string;
  gross_amount: string;
  fee_amount: string;
  net_amount: string;
  usd_equivalent: string | null;
  to_address: string;
  memo: string | null;
  status: string;
  cancel_expires_at: string;
  tx_hash: string | null;
  admin_notes: string | null;
  created_at: string;
  processed_at: string | null;
  users?: { email: string; display_name: string | null; phone: string | null };
}

const STATUS_LABELS: Record<string, string> = {
  awaiting_admin:  "Awaiting approval",
  queued:          "Queued",
  pending_cancel:  "Can cancel",
  broadcasting:    "Broadcasting",
  completed:       "Completed",
  failed:          "Failed",
  rejected:        "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  awaiting_admin:  "text-gold   bg-gold/10   border-gold/30",
  queued:          "text-primary bg-primary/10 border-primary/30",
  pending_cancel:  "text-text-secondary bg-bg-surface2 border-border",
  broadcasting:    "text-primary bg-primary/10 border-primary/30",
  completed:       "text-up     bg-up/10     border-up/30",
  failed:          "text-down   bg-down/10   border-down/30",
  rejected:        "text-down   bg-down/10   border-down/30",
};

const STATUS_FILTERS: { label: string; value: WqStatus }[] = [
  { label: "Needs Approval", value: "awaiting_admin" },
  { label: "Queued",         value: "queued" },
  { label: "Broadcasting",   value: "broadcasting" },
  { label: "Completed",      value: "completed" },
  { label: "Failed",         value: "failed" },
  { label: "All",            value: "all" },
];

export default function AdminWithdrawalsPage() {
  const toast = useToastActions();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<WqStatus>("awaiting_admin");
  const [selectedItem, setSelectedItem] = useState<WithdrawalQueueItem | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [actionView, setActionView] = useState<"detail" | "reject">("detail");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "withdrawals", statusFilter],
    queryFn: () =>
      apiGet<{ items: WithdrawalQueueItem[]; total: number }>(
        `/admin/withdrawal-queue?status=${statusFilter === "all" ? "" : statusFilter}&limit=50`
      ),
    refetchInterval: 15_000, // auto-refresh every 15s
    staleTime: 10_000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => apiPost(`/admin/withdrawal-queue/${id}/approve`, {}),
    onSuccess: () => {
      toast.success("Withdrawal approved — queued for broadcast");
      setSelectedItem(null);
      qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Approval failed"),
  });

  const reject = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiPost(`/admin/withdrawal-queue/${id}/reject`, { notes }),
    onSuccess: () => {
      toast.success("Withdrawal rejected — balance refunded to user");
      setSelectedItem(null);
      setRejectNotes("");
      setActionView("detail");
      qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Rejection failed"),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pendingApprovalCount = items.filter((i) => i.status === "awaiting_admin").length;

  function openItem(item: WithdrawalQueueItem) {
    setSelectedItem(item);
    setActionView("detail");
    setRejectNotes("");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne font-bold text-2xl text-text-primary">Withdrawals</h1>
          <p className="font-outfit text-sm text-text-muted mt-0.5">
            {total} total · {pendingApprovalCount > 0
              ? <span className="text-gold font-semibold">{pendingApprovalCount} awaiting approval</span>
              : "none awaiting approval"}
          </p>
        </div>
        <button onClick={() => refetch()}
          className="px-4 py-2 rounded-xl border border-border font-outfit text-sm text-text-secondary hover:border-primary transition-colors">
          Refresh
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button key={value} onClick={() => setStatusFilter(value)}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-xl font-outfit text-sm font-medium border transition-all",
              statusFilter === value
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-text-muted hover:border-border-2"
            )}>
            {label}
            {value === "awaiting_admin" && pendingApprovalCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-gold text-bg rounded-full font-bold">
                {pendingApprovalCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_1fr_1.5fr_1fr_1fr_auto] gap-4 px-4 py-3 bg-bg-surface2 border-b border-border">
          {["User", "Amount", "Destination", "Network", "Status", "Time"].map((h) => (
            <span key={h} className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-border/50 animate-pulse">
              <div className="h-4 bg-bg-surface2 rounded w-48 mb-2" />
              <div className="h-3 bg-bg-surface2 rounded w-32" />
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-outfit text-text-muted">No withdrawals found</p>
          </div>
        ) : (
          items.map((item) => (
            <button key={item.id} onClick={() => openItem(item)}
              className="grid grid-cols-[1fr_1fr_1.5fr_1fr_1fr_auto] gap-4 px-4 py-3.5 w-full text-left border-b border-border/50 hover:bg-bg-surface2 transition-colors">
              {/* User */}
              <div className="min-w-0">
                <p className="font-outfit text-sm text-text-primary truncate">
                  {item.users?.email ?? item.uid.slice(0, 12) + "…"}
                </p>
                <p className="font-price text-[10px] text-text-muted">
                  {item.uid.slice(0, 8)}…
                </p>
              </div>

              {/* Amount */}
              <div>
                <p className="font-price text-sm text-text-primary">
                  {parseFloat(item.gross_amount).toFixed(6)} {item.asset_symbol}
                </p>
                {item.usd_equivalent && (
                  <p className="font-outfit text-[10px] text-text-muted">
                    ≈ ${parseFloat(item.usd_equivalent).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Destination */}
              <div className="min-w-0">
                <p className="font-price text-xs text-text-secondary truncate">
                  {item.to_address}
                </p>
                {item.memo && (
                  <p className="font-outfit text-[10px] text-text-muted mt-0.5">
                    Memo: {item.memo}
                  </p>
                )}
              </div>

              {/* Network */}
              <p className="font-outfit text-sm text-text-secondary self-center">
                {item.chain_name}
              </p>

              {/* Status */}
              <span className={cn(
                "self-center inline-block px-2 py-0.5 rounded-full font-outfit text-[10px] font-semibold border",
                STATUS_COLORS[item.status] ?? "text-text-muted bg-bg-surface2 border-border"
              )}>
                {STATUS_LABELS[item.status] ?? item.status}
              </span>

              {/* Time */}
              <p className="font-outfit text-xs text-text-muted self-center text-right whitespace-nowrap">
                {formatTimeAgo(item.created_at)}
              </p>
            </button>
          ))
        )}
      </div>

      {/* Detail / action sheet */}
      <BottomSheet
        isOpen={!!selectedItem}
        onClose={() => { setSelectedItem(null); setActionView("detail"); setRejectNotes(""); }}
        title="Withdrawal Detail"
        showCloseButton
      >
        {selectedItem && (
          <div className="px-4 pb-8">
            {actionView === "detail" ? (
              <>
                {/* Summary card */}
                <div className="card-2 space-y-2.5 mb-5">
                  {[
                    { label: "Amount",       value: `${selectedItem.gross_amount} ${selectedItem.asset_symbol}` },
                    { label: "Fee",          value: `${selectedItem.fee_amount} ${selectedItem.asset_symbol}` },
                    { label: "Net to user",  value: `${selectedItem.net_amount} ${selectedItem.asset_symbol}` },
                    { label: "USD equiv.",   value: selectedItem.usd_equivalent ? `$${parseFloat(selectedItem.usd_equivalent).toFixed(2)}` : "—" },
                    { label: "Network",      value: selectedItem.chain_name },
                    { label: "Chain ID",     value: selectedItem.chain_id },
                    { label: "Status",       value: STATUS_LABELS[selectedItem.status] ?? selectedItem.status },
                    { label: "Submitted",    value: new Date(selectedItem.created_at).toLocaleString() },
                    ...(selectedItem.tx_hash ? [{ label: "Tx Hash", value: selectedItem.tx_hash }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between gap-4">
                      <span className="font-outfit text-xs text-text-muted flex-shrink-0">{label}</span>
                      <span className="font-price text-xs text-text-primary text-right break-all">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Destination address */}
                <div className="mb-4">
                  <p className="font-outfit text-xs text-text-muted mb-1">Destination address</p>
                  <div className="bg-bg-surface2 rounded-xl px-3 py-2.5 border border-border">
                    <p className="font-price text-xs text-text-primary break-all">{selectedItem.to_address}</p>
                    {selectedItem.memo && (
                      <p className="font-outfit text-xs text-down mt-1 font-semibold">Memo: {selectedItem.memo}</p>
                    )}
                  </div>
                </div>

                {/* User info */}
                {selectedItem.users && (
                  <div className="card-2 mb-5">
                    <p className="font-outfit text-xs text-text-muted mb-1">User</p>
                    <p className="font-outfit text-sm text-text-primary">{selectedItem.users.email}</p>
                    {selectedItem.users.phone && (
                      <p className="font-outfit text-xs text-text-muted mt-0.5">{selectedItem.users.phone}</p>
                    )}
                    <p className="font-price text-[10px] text-text-muted mt-1">{selectedItem.uid}</p>
                  </div>
                )}

                {/* Action buttons — only show for awaiting_admin */}
                {selectedItem.status === "awaiting_admin" && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => approve.mutate(selectedItem.id)}
                      disabled={approve.isPending}
                      className="flex-1 py-3.5 rounded-2xl bg-up/10 border border-up/30 font-outfit font-semibold text-sm text-up active:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      {approve.isPending ? "Approving…" : "✓ Approve & Queue"}
                    </button>
                    <button
                      onClick={() => setActionView("reject")}
                      className="flex-1 py-3.5 rounded-2xl bg-down/10 border border-down/30 font-outfit font-semibold text-sm text-down active:opacity-80"
                    >
                      ✗ Reject & Refund
                    </button>
                  </div>
                )}

                {/* For non-actionable statuses, just show tx link */}
                {selectedItem.tx_hash && (
                  <div className="mt-4">
                    <a
                      href={`https://bscscan.com/tx/${selectedItem.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-outfit text-sm text-primary font-medium"
                    >
                      View on explorer →
                    </a>
                  </div>
                )}
              </>
            ) : (
              /* Reject confirmation view */
              <>
                <div className="card border-down/30 bg-down/5 mb-5">
                  <p className="font-outfit text-sm text-down font-semibold mb-1">Reject and refund</p>
                  <p className="font-outfit text-xs text-text-secondary leading-relaxed">
                    Rejecting will immediately refund{" "}
                    <strong>{selectedItem.gross_amount} {selectedItem.asset_symbol}</strong> (including fee)
                    back to the user&apos;s funding balance.
                  </p>
                </div>

                <div className="mb-5">
                  <label className="block font-outfit text-xs text-text-secondary mb-2">
                    Reason for rejection (optional, shown to user)
                  </label>
                  <textarea
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    rows={3}
                    className="w-full bg-bg-surface border border-border rounded-2xl px-4 py-3 font-outfit text-sm text-text-primary outline-none focus:border-primary resize-none"
                    placeholder="e.g. Address flagged, KYC required, suspicious activity…"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setActionView("detail")}
                    className="flex-1 py-3.5 rounded-2xl border border-border font-outfit font-semibold text-sm text-text-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => reject.mutate({ id: selectedItem.id, notes: rejectNotes })}
                    disabled={reject.isPending}
                    className="flex-1 py-3.5 rounded-2xl bg-down/10 border border-down/30 font-outfit font-semibold text-sm text-down disabled:opacity-50"
                  >
                    {reject.isPending ? "Rejecting…" : "Confirm Reject"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

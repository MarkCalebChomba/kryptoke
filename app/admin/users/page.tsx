"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { formatTimeAgo, maskPhone } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface AdminUserRow {
  uid: string;
  email: string;
  phone: string | null;
  deposit_address: string;
  kyc_status: string;
  created_at: string;
  last_active_at: string;
}

interface BalanceAdjustSheet {
  open: boolean;
  uid: string;
  email: string;
}

export default function AdminUsersPage() {
  const toast = useToastActions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [adjustSheet, setAdjustSheet] = useState<BalanceAdjustSheet>({ open: false, uid: "", email: "" });
  const [adjustAsset, setAdjustAsset] = useState("USDT");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", page, search],
    queryFn: () =>
      apiGet<{ items: AdminUserRow[]; total: number; hasMore: boolean }>(
        `/admin/users?page=${page}&search=${encodeURIComponent(search)}`
      ),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const adjustBalance = useMutation({
    mutationFn: () =>
      apiPatch(`/admin/users/${adjustSheet.uid}/balance`, {
        asset: adjustAsset,
        amount: adjustAmount,
        reason: adjustReason,
      }),
    onSuccess: () => {
      toast.success("Balance adjusted");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setAdjustSheet({ open: false, uid: "", email: "" });
      setAdjustAmount("");
      setAdjustReason("");
    },
    onError: (err) => {
      toast.error("Adjustment failed", err instanceof Error ? err.message : undefined);
    },
  });

  const kycColors: Record<string, string> = {
    verified: "text-up bg-up/10",
    pending: "text-gold bg-gold/10",
    rejected: "text-down bg-down/10",
    submitted: "text-primary bg-primary/10",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-syne font-bold text-xl text-text-primary">Users</h1>
        <p className="font-outfit text-sm text-text-muted">{data?.total ?? 0} total</p>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Search by email or phone..."
        className="w-full bg-bg-surface border border-border rounded-xl px-4 py-2.5 font-outfit text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary"
      />

      {/* Table */}
      <div className="bg-bg-surface border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-5 gap-4 px-4 py-2.5 border-b border-border bg-bg-surface2">
          {["Email", "Phone", "KYC", "Joined", "Actions"].map((h) => (
            <p key={h} className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">{h}</p>
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-border/50">
          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="grid grid-cols-5 gap-4 px-4 py-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="skeleton h-3 rounded" />
                ))}
                <div className="skeleton h-6 w-20 rounded-lg" />
              </div>
            ))
          ) : (data?.items ?? []).length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-outfit text-sm text-text-muted">No users found</p>
            </div>
          ) : (
            (data?.items ?? []).map((user) => (
              <div key={user.uid} className="grid grid-cols-5 gap-4 px-4 py-3 hover:bg-bg-surface2 transition-colors">
                <p className="font-outfit text-sm text-text-primary truncate">{user.email}</p>
                <p className="font-price text-sm text-text-secondary truncate">
                  {user.phone ? maskPhone(user.phone) : "—"}
                </p>
                <div>
                  <span className={cn(
                    "font-outfit text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                    kycColors[user.kyc_status] ?? "text-text-muted bg-bg-surface2"
                  )}>
                    {user.kyc_status}
                  </span>
                </div>
                <p className="font-outfit text-xs text-text-muted">
                  {formatTimeAgo(user.created_at)}
                </p>
                <button
                  onClick={() => setAdjustSheet({ open: true, uid: user.uid, email: user.email })}
                  className="text-left font-outfit text-xs text-primary font-medium hover:underline"
                >
                  Adjust balance
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pagination */}
      {data && (data.total > 25) && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-bg-surface border border-border font-outfit text-sm text-text-secondary disabled:opacity-40"
          >
            Previous
          </button>
          <span className="font-outfit text-sm text-text-muted">
            Page {page} of {Math.ceil(data.total / 25)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!data.hasMore}
            className="px-4 py-2 rounded-xl bg-bg-surface border border-border font-outfit text-sm text-text-secondary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Balance adjustment sheet */}
      <BottomSheet
        isOpen={adjustSheet.open}
        onClose={() => setAdjustSheet({ open: false, uid: "", email: "" })}
        title="Adjust Balance"
        showCloseButton
      >
        <div className="px-4 pb-6 space-y-4">
          <div className="card-2">
            <p className="font-outfit text-xs text-text-muted">User</p>
            <p className="font-outfit text-sm text-text-primary mt-0.5">{adjustSheet.email}</p>
          </div>

          <div>
            <label className="block font-outfit text-sm text-text-secondary mb-1.5">Asset</label>
            <select
              value={adjustAsset}
              onChange={(e) => setAdjustAsset(e.target.value)}
              className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 font-outfit text-sm text-text-primary outline-none focus:border-primary"
            >
              <option value="USDT">USDT</option>
              <option value="KES">KES</option>
              <option value="BNB">BNB</option>
            </select>
          </div>

          <div>
            <label className="block font-outfit text-sm text-text-secondary mb-1.5">
              Amount (positive = credit, negative = debit)
            </label>
            <input
              type="text"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="+10.00 or -5.00"
              className="w-full bg-bg-surface2 border border-border rounded-xl px-4 py-2.5 font-price text-sm text-text-primary outline-none focus:border-primary placeholder:text-text-muted"
            />
          </div>

          <div>
            <label className="block font-outfit text-sm text-text-secondary mb-1.5">
              Reason (required — stored in audit log)
            </label>
            <textarea
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="e.g. Compensation for failed deposit TX:0x..."
              rows={3}
              className="w-full bg-bg-surface2 border border-border rounded-xl px-4 py-2.5 font-outfit text-sm text-text-primary outline-none focus:border-primary placeholder:text-text-muted resize-none"
            />
          </div>

          <button
            onClick={() => adjustBalance.mutate()}
            disabled={!adjustAmount || !adjustReason || adjustReason.length < 5 || adjustBalance.isPending}
            className="btn-primary"
          >
            {adjustBalance.isPending ? "Adjusting..." : "Confirm Adjustment"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

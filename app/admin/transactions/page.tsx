"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface LedgerRow {
  id: string;
  uid: string;
  asset: string;
  amount: string;
  type: string;
  reference_id: string | null;
  note: string | null;
  created_at: string;
  users: { email: string };
}

const TYPE_COLORS: Record<string, string> = {
  deposit: "text-up bg-up/10",
  withdrawal: "text-down bg-down/10",
  trade: "text-primary bg-primary/10",
  earn: "text-gold bg-gold/10",
  fee: "text-text-muted bg-bg-surface2",
  transfer: "text-text-secondary bg-bg-surface2",
  admin_adjustment: "text-down bg-down/5 border border-down/20",
};

const TYPE_OPTIONS = ["all", "deposit", "withdrawal", "trade", "earn", "fee", "transfer", "admin_adjustment"];

export default function AdminTransactionsPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "transactions", page, typeFilter],
    queryFn: () =>
      apiGet<{ items: LedgerRow[]; total: number }>(
        `/admin/transactions?page=${page}${typeFilter !== "all" ? `&type=${typeFilter}` : ""}`
      ),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  function exportCsv() {
    if (!data) return;
    const rows = [
      ["ID", "User", "Type", "Asset", "Amount", "Note", "Created"],
      ...data.items.map((r) => [
        r.id, r.users?.email ?? r.uid, r.type, r.asset, r.amount, r.note ?? "", r.created_at,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `transactions-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-syne font-bold text-xl text-text-primary">Transactions</h1>
        <div className="flex items-center gap-2">
          <span className="font-outfit text-sm text-text-muted">{data?.total ?? 0} total</span>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-surface border border-border font-outfit text-sm text-text-secondary hover:border-primary/30 transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t}
            onClick={() => { setTypeFilter(t); setPage(1); }}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-lg font-outfit text-xs font-medium border transition-all capitalize",
              typeFilter === t
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-text-muted"
            )}
          >
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="grid grid-cols-6 gap-3 px-4 py-2.5 border-b border-border bg-bg-surface2">
          {["User", "Type", "Asset", "Amount", "Note", "Time"].map((h) => (
            <p key={h} className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">{h}</p>
          ))}
        </div>

        <div className="divide-y divide-border/50 max-h-[600px] overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 gap-3 px-4 py-2.5">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="skeleton h-3 rounded" />
                ))}
              </div>
            ))
          ) : (data?.items ?? []).length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-outfit text-sm text-text-muted">No transactions found</p>
            </div>
          ) : (
            (data?.items ?? []).map((row) => (
              <div key={row.id}>
                <button
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  className={cn(
                    "grid grid-cols-6 gap-3 px-4 py-2.5 w-full text-left hover:bg-bg-surface2 transition-colors",
                    row.type === "admin_adjustment" && "bg-down/3"
                  )}
                >
                  <p className="font-outfit text-xs text-text-primary truncate">
                    {row.users?.email ?? row.uid.slice(0, 12)}...
                  </p>
                  <div>
                    <span className={cn(
                      "font-outfit text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                      TYPE_COLORS[row.type] ?? "text-text-muted bg-bg-surface2"
                    )}>
                      {row.type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="font-price text-xs text-text-secondary">{row.asset}</p>
                  <p className={cn(
                    "font-price text-xs font-medium",
                    parseFloat(row.amount) >= 0 ? "text-up" : "text-down"
                  )}>
                    {parseFloat(row.amount) >= 0 ? "+" : ""}{parseFloat(row.amount).toFixed(4)}
                  </p>
                  <p className="font-outfit text-xs text-text-muted truncate">{row.note ?? "—"}</p>
                  <p className="font-outfit text-xs text-text-muted">{formatTimeAgo(row.created_at)}</p>
                </button>

                {expanded === row.id && (
                  <div className="px-4 py-3 bg-bg border-t border-border/50">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="font-outfit text-text-muted mb-0.5">Transaction ID</p>
                        <p className="font-price text-text-primary break-all">{row.id}</p>
                      </div>
                      <div>
                        <p className="font-outfit text-text-muted mb-0.5">Reference</p>
                        <p className="font-price text-text-primary break-all">{row.reference_id ?? "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-outfit text-text-muted mb-0.5">Note</p>
                        <p className="font-outfit text-text-secondary leading-relaxed">{row.note ?? "—"}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pagination */}
      {data && data.total > 50 && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-bg-surface border border-border font-outfit text-sm text-text-secondary disabled:opacity-40">
            Previous
          </button>
          <span className="font-outfit text-sm text-text-muted">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={data.total <= page * 50}
            className="px-4 py-2 rounded-xl bg-bg-surface border border-border font-outfit text-sm text-text-secondary disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}

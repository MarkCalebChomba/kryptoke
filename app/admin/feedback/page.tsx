"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import type { Feedback } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  new: "text-primary bg-primary/10",
  read: "text-text-muted bg-bg-surface2",
  resolved: "text-up bg-up/10",
};

export default function AdminFeedbackPage() {
  const toast = useToastActions();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "feedback"],
    queryFn: () => apiGet<{ items: Feedback[]; total: number }>("/admin/feedback"),
    staleTime: 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "read" | "resolved" }) =>
      apiPatch(`/admin/feedback/${id}`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin", "feedback"] });
    },
  });

  function exportCsv() {
    if (!data) return;
    const rows = [["ID", "User", "Message", "Status", "Created"],
      ...data.items.map((f) => [f.id, f.userEmail, `"${f.message.replace(/"/g, '""')}"`, f.status, f.createdAt])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `feedback-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne font-bold text-xl text-text-primary">Feedback</h1>
          <p className="font-outfit text-sm text-text-muted mt-0.5">
            {(data?.items ?? []).filter((f) => f.status === "new").length} unread
          </p>
        </div>
        <button onClick={exportCsv}
          className="px-4 py-2 rounded-xl bg-bg-surface border border-border font-outfit text-sm text-text-secondary hover:border-primary/30 transition-colors">
          Export CSV
        </button>
      </div>

      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-bg-surface border border-border rounded-2xl p-4">
            <div className="skeleton h-3 w-40 mb-2" /><div className="skeleton h-3 w-full" />
          </div>
        ))
      ) : (data?.items ?? []).length === 0 ? (
        <div className="py-16 text-center bg-bg-surface border border-border rounded-2xl">
          <p className="font-outfit text-sm text-text-muted">No feedback yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(data?.items ?? []).map((item) => (
            <div key={item.id} className={cn(
              "bg-bg-surface border rounded-2xl overflow-hidden",
              item.status === "new" ? "border-primary/20" : "border-border"
            )}>
              <button
                onClick={() => {
                  setExpanded(expanded === item.id ? null : item.id);
                  if (item.status === "new") updateStatus.mutate({ id: item.id, status: "read" });
                }}
                className="flex items-center gap-3 w-full px-4 py-3 text-left"
              >
                {item.status === "new" && (
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-outfit text-sm font-medium text-text-primary">{item.userEmail}</p>
                  <p className="font-outfit text-xs text-text-muted truncate mt-0.5">{item.message}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn(
                    "font-outfit text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                    STATUS_COLORS[item.status] ?? "text-text-muted bg-bg-surface2"
                  )}>
                    {item.status}
                  </span>
                  <span className="font-outfit text-xs text-text-muted">{formatTimeAgo(item.createdAt)}</span>
                </div>
              </button>

              {expanded === item.id && (
                <div className="border-t border-border px-4 py-4 bg-bg">
                  <p className="font-outfit text-sm text-text-secondary leading-relaxed mb-4">
                    {item.message}
                  </p>
                  {item.status !== "resolved" && (
                    <button
                      onClick={() => updateStatus.mutate({ id: item.id, status: "resolved" })}
                      disabled={updateStatus.isPending}
                      className="px-4 py-2 rounded-xl bg-up/10 border border-up/30 font-outfit text-sm text-up font-medium disabled:opacity-50"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

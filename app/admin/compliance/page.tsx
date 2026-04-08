"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface AmlRecord {
  uid: string;
  email: string;
  display_name: string | null;
  score: number;
  status: "normal" | "review" | "restricted" | "suspended";
  signals: Array<{ id: string; label: string; weight: number }>;
  scored_at: string;
  manual_override: number | null;
  override_reason: string | null;
}

interface ComplianceAction {
  id: string;
  action: string;
  reason: string;
  score_at_action: number;
  performed_by: string;
  created_at: string;
}

const STATUS_COLORS: Record<AmlRecord["status"], string> = {
  normal:     "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  review:     "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  restricted: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  suspended:  "bg-red-500/20 text-red-400 border-red-500/30",
};

const SCORE_BAR_COLOR = (score: number) =>
  score >= 81 ? "bg-red-500" :
  score >= 61 ? "bg-orange-500" :
  score >= 31 ? "bg-yellow-500" : "bg-emerald-500";

export default function CompliancePage() {
  const toast = useToastActions();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AmlRecord | null>(null);
  const [overrideScore, setOverrideScore] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "compliance", statusFilter, search],
    queryFn: () =>
      apiGet<{ items: AmlRecord[]; total: number }>(
        `/admin/compliance?status=${statusFilter}&search=${encodeURIComponent(search)}`
      ),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const { data: actions } = useQuery({
    queryKey: ["admin", "compliance", "actions", selected?.uid],
    queryFn: () =>
      apiGet<{ items: ComplianceAction[] }>(`/admin/compliance/${selected!.uid}/actions`),
    enabled: !!selected,
    staleTime: 30_000,
  });

  const runScoring = useMutation({
    mutationFn: () => apiPost("/cron/aml-score", {}),
    onSuccess: () => {
      toast.success("AML scoring triggered");
      qc.invalidateQueries({ queryKey: ["admin", "compliance"] });
    },
    onError: () => toast.error("Failed to trigger AML scoring"),
  });

  const applyOverride = useMutation({
    mutationFn: () =>
      apiPost(`/admin/compliance/${selected!.uid}/override`, {
        score: parseInt(overrideScore),
        reason: overrideReason,
      }),
    onSuccess: () => {
      toast.success("Override applied");
      qc.invalidateQueries({ queryKey: ["admin", "compliance"] });
      setSelected(null);
      setOverrideScore("");
      setOverrideReason("");
    },
    onError: () => toast.error("Override failed"),
  });

  const clearScore = useMutation({
    mutationFn: () => apiPost(`/admin/compliance/${selected!.uid}/clear`, {}),
    onSuccess: () => {
      toast.success("Score cleared");
      qc.invalidateQueries({ queryKey: ["admin", "compliance"] });
      setSelected(null);
    },
    onError: () => toast.error("Clear failed"),
  });

  const suspendUser = useMutation({
    mutationFn: () =>
      apiPost(`/admin/compliance/${selected!.uid}/suspend`, { reason: overrideReason || "Manual compliance suspension" }),
    onSuccess: () => {
      toast.success("Account suspended");
      qc.invalidateQueries({ queryKey: ["admin", "compliance"] });
      setSelected(null);
    },
    onError: () => toast.error("Suspend failed"),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const stats = {
    normal:     items.filter(r => r.status === "normal").length,
    review:     items.filter(r => r.status === "review").length,
    restricted: items.filter(r => r.status === "restricted").length,
    suspended:  items.filter(r => r.status === "suspended").length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary font-outfit">Compliance Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">AML behavioral risk scores · {total} users scored</p>
        </div>
        <button
          onClick={() => runScoring.mutate()}
          disabled={runScoring.isPending}
          className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary font-outfit text-sm font-semibold disabled:opacity-50"
        >
          {runScoring.isPending ? "Running..." : "Run AML Scoring Now"}
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {(["normal", "review", "restricted", "suspended"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={cn(
              "p-3 rounded-xl border text-left transition-all",
              statusFilter === s ? STATUS_COLORS[s] : "bg-bg-surface border-border"
            )}
          >
            <p className="font-price text-xl">{stats[s]}</p>
            <p className="font-outfit text-xs text-text-muted capitalize mt-0.5">{s}</p>
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or UID..."
          className="input-field flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-40"
        >
          <option value="all">All statuses</option>
          <option value="review">Review</option>
          <option value="restricted">Restricted</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      <div className="card-2 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-text-muted font-outfit text-sm">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-text-muted font-outfit text-sm">No records found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["User", "Score", "Status", "Signals", "Last Scored", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-outfit text-xs text-text-muted uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.uid} className="border-b border-border/50 hover:bg-bg-surface2 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-outfit text-sm text-text-primary">{row.email}</p>
                    <p className="font-outfit text-xs text-text-muted">{row.uid.slice(0, 8)}…</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-bg-surface3">
                        <div
                          className={cn("h-1.5 rounded-full", SCORE_BAR_COLOR(row.score))}
                          style={{ width: `${row.score}%` }}
                        />
                      </div>
                      <span className="font-price text-sm text-text-primary">{row.score}</span>
                      {row.manual_override != null && (
                        <span className="font-outfit text-[10px] text-primary border border-primary/30 rounded px-1">OVR</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-outfit border capitalize", STATUS_COLORS[row.status])}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-outfit text-xs text-text-muted">{row.signals.length} signal{row.signals.length !== 1 ? "s" : ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-outfit text-xs text-text-muted">{formatTimeAgo(row.scored_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setSelected(row); setOverrideScore(String(row.manual_override ?? row.score)); setOverrideReason(row.override_reason ?? ""); }}
                      className="px-3 py-1 rounded-lg bg-bg-surface3 border border-border text-xs font-outfit text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail sheet */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title="Compliance Review" showCloseButton>
        {selected && (
          <div className="px-4 pb-8 space-y-5">
            {/* User + score */}
            <div className="card-2">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-outfit text-sm font-semibold text-text-primary">{selected.email}</p>
                  <p className="font-outfit text-xs text-text-muted">{selected.uid}</p>
                </div>
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-outfit border capitalize", STATUS_COLORS[selected.status])}>
                  {selected.status}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex-1 h-2 rounded-full bg-bg-surface3">
                  <div
                    className={cn("h-2 rounded-full transition-all", SCORE_BAR_COLOR(selected.score))}
                    style={{ width: `${selected.score}%` }}
                  />
                </div>
                <span className="font-price text-lg text-text-primary w-12 text-right">{selected.score}/100</span>
              </div>
              {selected.manual_override != null && (
                <p className="font-outfit text-xs text-primary mt-1">
                  Manual override: {selected.manual_override} — {selected.override_reason}
                </p>
              )}
            </div>

            {/* Signals breakdown */}
            <div>
              <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">Risk Signals</p>
              {selected.signals.length === 0 ? (
                <p className="font-outfit text-sm text-text-muted">No signals recorded</p>
              ) : (
                <div className="space-y-1.5">
                  {selected.signals.map((sig) => (
                    <div key={sig.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-bg-surface2 border border-border">
                      <span className="font-outfit text-xs text-text-secondary">{sig.label}</span>
                      <span className={cn("font-price text-xs font-semibold", sig.weight > 0 ? "text-down" : "text-up")}>
                        {sig.weight > 0 ? "+" : ""}{sig.weight}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action history */}
            {actions && actions.items.length > 0 && (
              <div>
                <p className="font-outfit text-xs text-text-muted uppercase tracking-wide mb-2">Action History</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {actions.items.map((a) => (
                    <div key={a.id} className="py-1.5 px-3 rounded-lg bg-bg-surface2 border border-border">
                      <div className="flex justify-between">
                        <span className="font-outfit text-xs text-text-secondary">{a.action}</span>
                        <span className="font-outfit text-xs text-text-muted">{formatTimeAgo(a.created_at)}</span>
                      </div>
                      <p className="font-outfit text-[10px] text-text-muted mt-0.5">{a.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Override controls */}
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="font-outfit text-xs text-text-muted uppercase tracking-wide">Override Score</p>
              <div className="flex gap-2">
                <input
                  type="number" min="0" max="100"
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(e.target.value)}
                  placeholder="Score 0-100"
                  className="input-field w-28"
                />
                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Reason for override"
                  className="input-field flex-1"
                />
              </div>
              <button
                onClick={() => applyOverride.mutate()}
                disabled={!overrideScore || !overrideReason || applyOverride.isPending}
                className="btn-primary disabled:opacity-50 text-sm"
              >
                Apply Override
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                onClick={() => clearScore.mutate()}
                disabled={clearScore.isPending}
                className="flex-1 py-2.5 rounded-xl border border-border font-outfit text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                Clear Score
              </button>
              <button
                onClick={() => { if (confirm("Suspend this account?")) suspendUser.mutate(); }}
                disabled={suspendUser.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-outfit text-sm font-semibold disabled:opacity-50"
              >
                Suspend Account
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

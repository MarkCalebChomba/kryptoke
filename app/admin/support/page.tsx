"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/client";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface Ticket {
  id: string; type: string; reference_id: string | null;
  subject: string; status: string; priority: string;
  admin_notes: string | null; created_at: string; updated_at: string;
  users: { email: string; display_name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  open:      "bg-gold/10 text-gold border-gold/20",
  in_review: "bg-primary/10 text-primary border-primary/20",
  resolved:  "bg-up/10 text-up border-up/20",
  closed:    "bg-border text-text-muted border-border",
};

const PRIORITY_COLORS: Record<string, string> = {
  low:    "text-text-muted",
  normal: "text-text-secondary",
  high:   "text-gold",
  urgent: "text-down",
};

export default function AdminSupportPage() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("open");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "tickets", filterStatus],
    queryFn: () => apiGet<{ data: Ticket[]; meta: { total: number } }>(`/support/admin/tickets?status=${filterStatus}`),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string> }) =>
      apiPost(`/support/admin/tickets/${id}`, body, "PATCH"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "tickets"] }); setSelected(null); },
  });

  const tickets = (data as unknown as { data: Ticket[] })?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne font-bold text-xl text-text-primary">Support Tickets</h1>
          <p className="font-outfit text-sm text-text-muted mt-0.5">User-submitted transaction issues</p>
        </div>
        <div className="flex rounded-xl overflow-hidden border border-border">
          {["open","in_review","resolved","closed"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn("px-3 py-1.5 font-outfit text-xs font-medium capitalize transition-colors",
                filterStatus === s ? "bg-primary/10 text-primary" : "text-text-muted")}>
              {s.replace("_"," ")}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl"/>)}</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-text-muted font-outfit text-sm">No {filterStatus} tickets</div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <button key={t.id} onClick={() => { setSelected(t); setNotes(t.admin_notes ?? ""); }}
              className="w-full text-left bg-bg-surface border border-border rounded-2xl p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-outfit font-semibold text-sm text-text-primary truncate">{t.subject}</p>
                  <p className="font-outfit text-xs text-text-muted mt-0.5">
                    {t.users?.email ?? "unknown"} · {t.type} · {formatTimeAgo(t.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn("font-outfit text-[10px] font-semibold uppercase", PRIORITY_COLORS[t.priority])}>
                    {t.priority}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded-full font-outfit text-[10px] font-semibold border capitalize", STATUS_COLORS[t.status])}>
                    {t.status.replace("_"," ")}
                  </span>
                </div>
              </div>
              {t.reference_id && (
                <p className="font-price text-[10px] text-text-muted truncate">ref: {t.reference_id}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Ticket detail panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-end lg:items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-bg-surface border border-border rounded-2xl w-full max-w-lg p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-syne font-bold text-base text-text-primary">{selected.subject}</h2>
                <p className="font-outfit text-xs text-text-muted mt-0.5">
                  {selected.users?.email} · {formatTimeAgo(selected.created_at)}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-text-muted tap-target">✕</button>
            </div>

            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-bg-surface2 rounded-xl p-3">
                  <p className="font-outfit text-[10px] text-text-muted uppercase mb-1">Status</p>
                  <select value={selected.status}
                    onChange={(e) => setSelected({...selected, status: e.target.value})}
                    className="w-full bg-transparent font-outfit text-sm text-text-primary outline-none">
                    {["open","in_review","resolved","closed"].map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
                  </select>
                </div>
                <div className="bg-bg-surface2 rounded-xl p-3">
                  <p className="font-outfit text-[10px] text-text-muted uppercase mb-1">Priority</p>
                  <select value={selected.priority}
                    onChange={(e) => setSelected({...selected, priority: e.target.value})}
                    className="w-full bg-transparent font-outfit text-sm text-text-primary outline-none">
                    {["low","normal","high","urgent"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {selected.reference_id && (
                <div className="bg-bg-surface2 rounded-xl px-3 py-2">
                  <p className="font-outfit text-[10px] text-text-muted">Reference ID</p>
                  <p className="font-price text-xs text-text-secondary">{selected.reference_id}</p>
                </div>
              )}

              <div className="bg-bg-surface2 rounded-xl px-3 py-2.5">
                <p className="font-outfit text-[10px] text-text-muted mb-1">User description</p>
                <p className="font-outfit text-sm text-text-primary whitespace-pre-wrap">loading...</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block font-outfit text-xs text-text-muted mb-1.5">Admin Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Internal notes — visible only to admins..."
                className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border font-outfit text-sm text-text-primary outline-none focus:border-primary resize-none"/>
            </div>

            <button
              onClick={() => update.mutate({ id: selected.id, body: { status: selected.status, priority: selected.priority, admin_notes: notes } })}
              disabled={update.isPending}
              className="w-full py-3 rounded-xl bg-primary text-bg font-outfit font-semibold text-sm disabled:opacity-50">
              {update.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

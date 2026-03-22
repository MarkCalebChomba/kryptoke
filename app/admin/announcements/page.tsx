"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import type { Announcement } from "@/types";

export default function AdminAnnouncementsPage() {
  const toast = useToastActions();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", type: "info" as Announcement["type"], published: false });

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: () => apiGet<Announcement[]>("/admin/announcements/published"),
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: () => apiPost("/admin/announcements", form),
    onSuccess: () => {
      toast.success("Announcement created");
      queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      setCreateOpen(false);
      setForm({ title: "", body: "", type: "info", published: false });
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : undefined),
  });

  const typeColors: Record<string, string> = {
    info: "text-primary bg-primary/10",
    warning: "text-gold bg-gold/10",
    promotion: "text-up bg-up/10",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-syne font-bold text-xl text-text-primary">Announcements</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-primary font-outfit font-semibold text-sm text-bg"
        >
          + New Announcement
        </button>
      </div>

      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-bg-surface border border-border rounded-2xl p-4">
            <div className="skeleton h-4 w-48 mb-2" /><div className="skeleton h-3 w-full" />
          </div>
        ))
      ) : (data ?? []).length === 0 ? (
        <div className="py-16 text-center bg-bg-surface border border-border rounded-2xl">
          <p className="font-outfit text-sm text-text-muted">No announcements yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((a) => (
            <div key={a.id} className="bg-bg-surface border border-border rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "font-outfit text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                      typeColors[a.type] ?? "text-text-muted bg-bg-surface2"
                    )}>
                      {a.type}
                    </span>
                    {a.published && (
                      <span className="font-outfit text-[10px] font-bold text-up bg-up/10 px-2 py-0.5 rounded">
                        LIVE
                      </span>
                    )}
                  </div>
                  <p className="font-outfit text-sm font-semibold text-text-primary">{a.title}</p>
                  <p className="font-outfit text-xs text-text-muted mt-0.5 leading-relaxed">{a.body}</p>
                  <p className="font-outfit text-xs text-text-muted mt-2">{formatTimeAgo(a.createdAt)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create sheet */}
      <BottomSheet isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Announcement" showCloseButton>
        <div className="px-4 pb-6 space-y-4">
          <div>
            <label className="block font-outfit text-sm text-text-secondary mb-1.5">Type</label>
            <div className="flex gap-2">
              {(["info", "warning", "promotion"] as const).map((t) => (
                <button key={t} onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={cn(
                    "flex-1 py-2 rounded-xl font-outfit text-xs font-semibold capitalize border transition-all",
                    form.type === t ? typeColors[t] + " border-current" : "border-border text-text-muted"
                  )}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block font-outfit text-sm text-text-secondary mb-1.5">Title</label>
            <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="input-field" placeholder="Announcement title" />
          </div>
          <div>
            <label className="block font-outfit text-sm text-text-secondary mb-1.5">Body</label>
            <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={4} className="input-field resize-none" placeholder="Announcement body text" />
          </div>
          <div className="flex items-center justify-between py-3 border-t border-border">
            <div>
              <p className="font-outfit text-sm font-medium text-text-primary">Publish immediately</p>
              <p className="font-outfit text-xs text-text-muted mt-0.5">Visible to all users in real-time</p>
            </div>
            <button
              onClick={() => setForm((f) => ({ ...f, published: !f.published }))}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors",
                form.published ? "bg-primary" : "bg-border-2"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                form.published ? "translate-x-7" : "translate-x-1"
              )} />
            </button>
          </div>
          <button
            onClick={() => create.mutate()}
            disabled={!form.title || !form.body || create.isPending}
            className="btn-primary"
          >
            {create.isPending ? "Creating..." : form.published ? "Publish Now" : "Save as Draft"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

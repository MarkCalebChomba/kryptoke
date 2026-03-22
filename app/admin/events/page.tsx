"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "@/lib/api/client";
import { useToastActions } from "@/components/shared/ToastContainer";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface CalendarEvent {
  id: string;
  title: string;
  type: "SPOT" | "FUTURES" | "VESTING" | "MAINTENANCE" | "LISTING";
  date: string;
  badge_color: string;
  published: boolean;
}

const EVENT_TYPES = ["SPOT", "FUTURES", "VESTING", "MAINTENANCE", "LISTING"] as const;
const TYPE_COLORS: Record<string, string> = {
  SPOT: "text-primary bg-primary/10",
  FUTURES: "text-gold bg-gold/10",
  VESTING: "text-text-secondary bg-bg-surface2",
  MAINTENANCE: "text-down bg-down/10",
  LISTING: "text-up bg-up/10",
};
const DEFAULT_COLORS: Record<string, string> = {
  SPOT: "#00E5B4", FUTURES: "#F0B429", VESTING: "#4A5B7A",
  MAINTENANCE: "#FF4C4C", LISTING: "#00D4A0",
};

const EMPTY_FORM = {
  title: "", type: "LISTING" as CalendarEvent["type"],
  date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  badgeColor: "#00E5B4", published: false,
};

export default function AdminEventsPage() {
  const toast = useToastActions();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: events, isLoading } = useQuery({
    queryKey: ["admin", "events"],
    queryFn: () => apiGet<CalendarEvent[]>("/admin/events/published"),
    staleTime: 30_000,
  });

  const createEvent = useMutation({
    mutationFn: () => apiPost("/admin/events", {
      ...form,
      date: new Date(form.date).toISOString(),
    }),
    onSuccess: () => {
      toast.success("Event created");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["admin", "events"] });
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : ""),
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      apiPatch(`/admin/events/${id}`, { published }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin", "events"] });
    },
    onError: (err) => toast.error("Failed", err instanceof Error ? err.message : ""),
  });

  function handleTypeChange(type: CalendarEvent["type"]) {
    setForm((f) => ({ ...f, type, badgeColor: DEFAULT_COLORS[type] ?? "#00E5B4" }));
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne font-bold text-2xl text-text-primary">Events Calendar</h1>
          <p className="font-outfit text-sm text-text-muted mt-0.5">
            Manage calendar events shown to users on the home screen
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2.5 bg-primary text-bg rounded-xl font-outfit text-sm font-semibold"
        >
          + New Event
        </button>
      </div>

      {/* Events table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 bg-bg-surface2 border-b border-border">
          {["Title", "Type", "Date", "Status", ""].map((h) => (
            <span key={h} className="font-outfit text-[10px] text-text-muted uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-border/50 animate-pulse">
              <div className="h-4 bg-bg-surface2 rounded w-48" />
            </div>
          ))
        ) : (events ?? []).length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-outfit text-text-muted">No events yet. Create one to appear on the home screen calendar.</p>
          </div>
        ) : (
          (events ?? []).map((event) => (
            <div key={event.id}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3.5 items-center border-b border-border/50 hover:bg-bg-surface2 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: event.badge_color }}
                />
                <p className="font-outfit text-sm text-text-primary truncate">{event.title}</p>
              </div>
              <span className={cn(
                "inline-block text-[10px] font-outfit font-semibold px-2 py-0.5 rounded-full w-fit",
                TYPE_COLORS[event.type] ?? "text-text-muted bg-bg-surface2"
              )}>
                {event.type}
              </span>
              <p className="font-outfit text-xs text-text-muted">
                {new Date(event.date).toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" })}
              </p>
              <span className={cn(
                "inline-block text-[10px] font-outfit font-semibold px-2 py-0.5 rounded-full w-fit",
                event.published ? "text-up bg-up/10" : "text-text-muted bg-bg-surface2"
              )}>
                {event.published ? "Published" : "Draft"}
              </span>
              <button
                onClick={() => togglePublish.mutate({ id: event.id, published: !event.published })}
                className={cn(
                  "text-xs font-outfit font-semibold px-3 py-1.5 rounded-lg border transition-colors",
                  event.published
                    ? "border-down/30 text-down bg-down/5 hover:bg-down/10"
                    : "border-primary/30 text-primary bg-primary/5 hover:bg-primary/10"
                )}
              >
                {event.published ? "Unpublish" : "Publish"}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Create event sheet */}
      <BottomSheet isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Event" showCloseButton>
        <div className="px-4 pb-8 space-y-4">
          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Event title</label>
            <input
              type="text" value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="input-field"
              placeholder="e.g. BTC Futures Expiry"
            />
          </div>

          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Event type</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((t) => (
                <button key={t} onClick={() => handleTypeChange(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-outfit text-xs font-semibold border transition-all",
                    form.type === t ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-text-muted"
                  )}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Date & time</label>
            <input
              type="datetime-local" value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="input-field font-price"
            />
          </div>

          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Badge colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color" value={form.badgeColor}
                onChange={(e) => setForm((f) => ({ ...f, badgeColor: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <span className="font-price text-sm text-text-secondary">{form.badgeColor}</span>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.published}
              onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
              className="w-4 h-4 rounded accent-primary"
            />
            <span className="font-outfit text-sm text-text-primary">Publish immediately</span>
          </label>

          <button
            onClick={() => createEvent.mutate()}
            disabled={createEvent.isPending || !form.title || !form.date}
            className="btn-primary disabled:opacity-50"
          >
            {createEvent.isPending ? "Creating…" : "Create Event"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

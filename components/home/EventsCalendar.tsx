"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { formatEventDate } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import type { ExchangeEvent } from "@/types";

const BADGE_COLORS: Record<string, string> = {
  SPOT: "text-primary bg-primary/10",
  FUTURES: "text-gold bg-gold/10",
  VESTING: "text-text-secondary bg-bg-surface2",
  MAINTENANCE: "text-down bg-down/10",
  LISTING: "text-up bg-up/10",
};

export function EventsCalendar() {
  const { data: events, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiGet<ExchangeEvent[]>("/market/events"),
    staleTime: 5 * 60_000,
  });

  const upcoming = (events ?? [])
    .filter((e) => new Date(e.date) > new Date())
    .slice(0, 3);

  if (!isLoading && upcoming.length === 0) return null;

  return (
    <div className="mx-4">
      <h2 className="font-syne font-bold text-base text-text-primary mb-3">
        Upcoming Events
      </h2>

      <div className="card divide-y divide-border p-0 overflow-hidden">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="skeleton w-2 h-2 rounded-full" />
                <div className="flex-1">
                  <div className="skeleton h-3.5 w-40 mb-1.5" />
                  <div className="skeleton h-3 w-28" />
                </div>
                <div className="skeleton h-5 w-14 rounded" />
              </div>
            ))
          : upcoming.map((event) => (
              <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: event.badgeColor }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-outfit text-sm font-medium text-text-primary truncate">
                    {event.title}
                  </p>
                  <p className="font-outfit text-xs text-text-muted mt-0.5">
                    {formatEventDate(event.date)}
                  </p>
                </div>
                <span className={cn(
                  "flex-shrink-0 font-outfit text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide",
                  BADGE_COLORS[event.type] ?? "text-text-secondary bg-bg-surface2"
                )}>
                  {event.type}
                </span>
              </div>
            ))}
      </div>
    </div>
  );
}

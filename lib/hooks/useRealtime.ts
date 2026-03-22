"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type PostgresEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

interface RealtimeTableOptions<T> {
  table: string;
  event?: PostgresEvent;
  filter?: string;
  onPayload: (payload: { new: T; old: Partial<T>; eventType: PostgresEvent }) => void;
  enabled?: boolean;
}

/**
 * Subscribe to Supabase Realtime postgres_changes on a table.
 * Auto-reconnects if the channel drops. Cleans up on unmount.
 */
export function useRealtimeTable<T extends Record<string, unknown>>({
  table,
  event = "*",
  filter,
  onPayload,
  enabled = true,
}: RealtimeTableOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onPayloadRef = useRef(onPayload);
  onPayloadRef.current = onPayload;

  const subscribe = useCallback(() => {
    if (!enabled) return;

    const supabase = getSupabaseBrowserClient();
    const channelName = `${table}:${filter ?? "all"}:${Date.now()}`;

    const channel = supabase
      .channel(channelName)
      .on(
        // @ts-expect-error — overloaded union type
        "postgres_changes",
        {
          event,
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        (payload: {
          eventType: PostgresEvent;
          new: T;
          old: Partial<T>;
        }) => {
          onPayloadRef.current({
            new: payload.new,
            old: payload.old,
            eventType: payload.eventType,
          });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          // Reconnect after 3 seconds
          setTimeout(() => {
            if (channelRef.current) {
              supabase.removeChannel(channelRef.current);
            }
            channelRef.current = null;
            subscribe();
          }, 3000);
        }
      });

    channelRef.current = channel;
  }, [enabled, table, event, filter]);

  useEffect(() => {
    subscribe();
    return () => {
      if (channelRef.current) {
        const supabase = getSupabaseBrowserClient();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [subscribe]);
}

/**
 * Subscribe to Supabase Realtime broadcast channel.
 * Useful for market data forwarded from backend WebSocket.
 */
export function useRealtimeBroadcast<T>(
  channelName: string,
  event: string,
  onMessage: (payload: T) => void,
  enabled = true
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event }, (payload) => {
        onMessageRef.current(payload.payload as T);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, event, enabled]);
}

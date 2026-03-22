"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useNotifications as useNotificationsStore, useAuth } from "@/lib/store";
import type { Notification, PaginatedResponse } from "@/types";

export function useNotifications() {
  const { user } = useAuth();
  const { setNotifications, addNotification } = useNotificationsStore();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiGet<PaginatedResponse<Notification>>("/notifications"),
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true, // keep unread count accurate when returning to app
  });

  useEffect(() => {
    if (query.data?.items) {
      setNotifications(query.data.items);
    }
  }, [query.data, setNotifications]);

  // Supabase Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`notifications:${user.uid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `uid=eq.${user.uid}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          addNotification(newNotification);
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, addNotification, queryClient]);

  return query;
}

export function useMarkAllRead() {
  const { markAllRead } = useNotificationsStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPatch("/notifications/read-all"),
    onSuccess: () => {
      markAllRead();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

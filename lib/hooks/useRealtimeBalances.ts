"use client";

/**
 * useRealtimeBalances — Task 13 (SHIELD)
 *
 * Subscribes to Supabase Realtime postgres_changes on the `balances` table
 * for the current user. When the backend writes an updated balance row
 * (after a deposit, withdrawal, trade, or transfer), this hook updates the
 * Zustand store immediately without requiring a page refresh or polling.
 *
 * Prerequisites:
 *   - Migration 012_rls_custom_jwt.sql must be applied (RLS uses get_app_uid())
 *   - JWT_SECRET in Vercel must match Supabase project JWT secret
 *   - setSupabaseSession(accessToken) must be called before this hook mounts
 *     (done in useSupabaseSession below)
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient, setSupabaseSession } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface BalanceRow {
  uid: string;
  asset: string;
  account: string;
  amount: string;
  updated_at: string;
}

interface NotificationRow {
  id: string;
  uid: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Call once at app root (in AppLayout) to inject the custom JWT into the
 * Supabase client so Realtime subscriptions pass RLS checks.
 */
export function useSupabaseSession() {
  const accessToken = useAppStore((s) => s.accessToken);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      setSupabaseSession(accessToken).catch(() => {
        // Non-fatal — Realtime will work without RLS filtering if this fails,
        // but users would only see their own data anyway since the backend
        // always uses service_role and the filter is uid-based.
      });
    }
  }, [isAuthenticated, accessToken]);
}

/**
 * Subscribe to real-time balance updates for the current user.
 * Updates Zustand store + invalidates TanStack Query wallet cache.
 *
 * Usage: call once in AppLayout or the home page component.
 */
export function useRealtimeBalances() {
  const user = useAppStore((s) => s.user);
  const setBalance = useAppStore((s) => s.setBalance);
  const addNotification = useAppStore((s) => s.addNotification);
  const addToast = useAppStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const balanceChannelRef = useRef<RealtimeChannel | null>(null);
  const notifChannelRef = useRef<RealtimeChannel | null>(null);
  // Track previous KKE balance to detect first-ever airdrop
  const prevKkeRef = useRef<string>("0");

  useEffect(() => {
    if (!user?.uid) return;

    const supabase = getSupabaseBrowserClient();
    const uid = user.uid;

    // ── Balance changes ───────────────────────────────────────────────────────
    const balanceChannel = supabase
      .channel(`balances:${uid}`)
      .on(
        // @ts-ignore — Supabase Realtime overloaded union typings
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "balances",
          filter: `uid=eq.${uid}`,
        },
        (payload: { new: BalanceRow }) => {
          const row = payload.new;
          if (row.account === "funding") {
            // Detect KKE going from 0 → positive (welcome airdrop or admin airdrop)
            if (
              row.asset === "KKE" &&
              parseFloat(prevKkeRef.current) === 0 &&
              parseFloat(row.amount) > 0
            ) {
              addToast({
                type: "airdrop",
                title: `🪙 You received ${parseFloat(row.amount).toLocaleString()} KKE!`,
                description: "KryptoKe tokens have been added to your wallet.",
                duration: 6000,
              });
            }
            if (row.asset === "KKE") {
              prevKkeRef.current = row.amount;
            }

            setBalance(row.asset, {
              asset: row.asset,
              amount: row.amount,
              account: row.account as "funding" | "trading" | "earn",
              updatedAt: row.updated_at,
            });
          }
          queryClient.invalidateQueries({ queryKey: ["wallet"] });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setTimeout(() => {
            supabase.removeChannel(balanceChannel);
            balanceChannelRef.current = null;
          }, 5000);
        }
      });

    balanceChannelRef.current = balanceChannel;

    // ── Incoming notifications ────────────────────────────────────────────────
    const notifChannel = supabase
      .channel(`notifications:${uid}`)
      .on(
        // @ts-ignore — Supabase Realtime overloaded union typings
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `uid=eq.${uid}`,
        },
        (payload: { new: NotificationRow }) => {
          const row = payload.new;
          addNotification({
            id: row.id,
            uid: row.uid,
            type: row.type as never,
            title: row.title,
            body: row.body,
            read: row.read,
            data: (row.data as Record<string, unknown>) ?? {},
            createdAt: row.created_at,
          });

          // Special handling for airdrop notifications — fire gold toast + confetti
          if (row.type === "airdrop") {
            addToast({
              type: "airdrop",
              title: row.title,
              description: row.body,
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    notifChannelRef.current = notifChannel;

    return () => {
      supabase.removeChannel(balanceChannel);
      supabase.removeChannel(notifChannel);
      balanceChannelRef.current = null;
      notifChannelRef.current = null;
    };
  }, [user?.uid, setBalance, addNotification, addToast, queryClient]);
}

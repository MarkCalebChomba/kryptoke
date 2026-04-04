"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getStoredToken } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { apiGet } from "@/lib/api/client";
import type { User } from "@/types";
import { ToastContainer } from "./ToastContainer";

/* ─── QueryClient Singleton ─────────────────────────────────────────────── */

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60 * 1000,
        retry: (failureCount, error) => {
          if (error instanceof Error && "statusCode" in error) {
            const status = (error as { statusCode: number }).statusCode;
            if (status >= 400 && status < 500) return false;
          }
          return failureCount < 2;
        },
        // Disabled globally — SPA with 5 tabs mounted means every alt-tab fires 10+ queries.
        // Individual queries that need live updates (wallet, notifications) opt in explicitly.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // Server: always make a new client
    return makeQueryClient();
  }
  // Browser: reuse the same client
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

/* ─── Auth Bootstrap ────────────────────────────────────────────────────── */

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useAppStore((s) => s.setUser);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const setLoadingAuth = useAppStore((s) => s.setLoadingAuth);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoadingAuth(false);
      return;
    }

    // Validate token by fetching current user
    apiGet<User>("/auth/me")
      .then((user) => {
        setUser(user, token);
      })
      .catch(() => {
        // On /admin routes, don't clear auth on failure — the token may be
        // valid but the API call failed for another reason (network, CORS etc.)
        // The admin layout renders regardless; API calls will fail gracefully.
        const isAdmin = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
        if (!isAdmin) {
          clearAuth();
        } else {
          // Still set loading to false so the admin layout can render
          setLoadingAuth(false);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}

/* ─── Providers ─────────────────────────────────────────────────────────── */

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>
        {children}
        <ToastContainer />
      </AuthBootstrap>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

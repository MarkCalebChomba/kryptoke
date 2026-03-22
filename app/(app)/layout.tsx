"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { BottomNav } from "@/components/shared/BottomNav";
import { Skeleton } from "@/components/shared/Skeleton";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated, isLoadingAuth } = useAppStore((s) => ({
    isAuthenticated: s.isAuthenticated,
    isLoadingAuth: s.isLoadingAuth,
  }));

  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [isAuthenticated, isLoadingAuth, router]);

  // Prefetch market overview in background so Markets tab is instant
  useEffect(() => {
    if (!isAuthenticated) return;
    qc.prefetchQuery({
      queryKey: ["market", "overview"],
      queryFn: () => apiGet("/market/overview"),
      staleTime: 30_000,
    }).catch(() => undefined);
  }, [isAuthenticated, qc]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl skeleton" />
          <div className="space-y-2">
            <Skeleton height={12} width={120} className="mx-auto" />
            <Skeleton height={10} width={80} className="mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="relative w-full h-dvh overflow-hidden bg-bg" suppressHydrationWarning>
      <main className="absolute inset-0 overflow-hidden">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}

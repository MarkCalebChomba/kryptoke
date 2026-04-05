"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Pure client component - never pre-rendered by Next.js server
// No server-side redirect that can be cached by Vercel CDN
export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

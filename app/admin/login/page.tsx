"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api/client";
import { setStoredToken } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import type { User } from "@/types";

export default function AdminLoginPage() {
  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const res = await apiPost<{ user: User; accessToken: string }>("/auth/login", { email, password });
      setStoredToken(res.accessToken);
      setUser(res.user, res.accessToken);
      router.replace("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-bg-surface border border-border rounded-2xl p-8">
        <h1 className="font-syne font-bold text-xl text-text-primary mb-1">Admin Login</h1>
        <p className="font-outfit text-sm text-text-muted mb-6">Sign in to the KryptoKe admin panel</p>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-xl bg-down/10 border border-down/20">
            <p className="font-outfit text-sm text-down">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block font-outfit text-xs text-text-muted mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border font-outfit text-sm text-text-primary outline-none focus:border-primary transition-colors"
              placeholder="admin@kryptoke.com"
              autoFocus
            />
          </div>
          <div>
            <label className="block font-outfit text-xs text-text-muted mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border font-outfit text-sm text-text-primary outline-none focus:border-primary transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="w-full py-3 rounded-xl bg-primary text-bg font-outfit font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign in to Admin"}
          </button>
        </div>
      </div>
    </div>
  );
}

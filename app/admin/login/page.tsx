"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    setError("");

    try {
      // 1. Log in to get JWT
      const loginRes = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.data?.accessToken) {
        throw new Error(loginData.error ?? "Login failed");
      }
      const { accessToken, user } = loginData.data;

      // 2. Check admin status
      const adminRes = await fetch("/api/v1/auth/admin-check", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const adminData = await adminRes.json();
      if (!adminRes.ok || !adminData.data?.isAdmin) {
        throw new Error("This account does not have admin access");
      }

      // 3. Set httpOnly admin cookie via dedicated endpoint
      const cookieRes = await fetch("/api/v1/auth/admin-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: accessToken }),
      });
      if (!cookieRes.ok) throw new Error("Failed to create admin session");

      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-bg-surface border border-border rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" className="text-primary"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="text-primary"/>
            </svg>
          </div>
          <div>
            <h1 className="font-syne font-bold text-base text-text-primary">Admin Access</h1>
            <p className="font-outfit text-xs text-text-muted">KryptoKe Dashboard</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-xl bg-down/10 border border-down/20">
            <p className="font-outfit text-sm text-down">{error}</p>
          </div>
        )}

        <div className="space-y-3">
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
            className="w-full py-3 rounded-xl bg-primary text-bg font-outfit font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {loading ? "Verifying…" : "Sign in to Admin"}
          </button>
        </div>
      </div>
    </div>
  );
}

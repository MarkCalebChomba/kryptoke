"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api/client";
import { OtpInput } from "@/components/auth/OtpInput";
import { cn } from "@/lib/utils/cn";

type View = "email" | "otp" | "new_password" | "done";

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [view, setView]           = useState<View>("email");
  const [email, setEmail]         = useState("");
  const [otp, setOtp]             = useState("");
  const [password, setPassword]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) { setError("Enter a valid email address."); return; }
    setLoading(true);
    try {
      await apiPost("/auth/forgot-password", { email });
      setView("otp");
    } catch {
      // Always show the same message to prevent email enumeration
      setView("otp");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(code: string) {
    setOtp(code);
    setView("new_password");
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8)             { setError("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(password))         { setError("Include at least one uppercase letter."); return; }
    if (!/[0-9]/.test(password))         { setError("Include at least one number."); return; }
    setLoading(true);
    try {
      await apiPost("/auth/reset-password", { email, otp, newPassword: password });
      setView("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col px-5 pt-10 max-w-sm mx-auto">

      {/* Back link */}
      <Link href="/auth/login" className="flex items-center gap-1.5 font-outfit text-sm text-text-muted mb-8 w-fit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back to login
      </Link>

      {/* Step: Enter email */}
      {view === "email" && (
        <form onSubmit={handleSendCode} className="space-y-5">
          <div>
            <h1 className="font-syne font-bold text-2xl text-text-primary">Reset password</h1>
            <p className="font-outfit text-sm text-text-muted mt-2 leading-relaxed">
              Enter the email address on your KryptoKe account and we will send you a 6-digit reset code.
            </p>
          </div>

          {error && (
            <div className="bg-down/10 border border-down/30 rounded-xl px-4 py-3">
              <p className="font-outfit text-sm text-down">{error}</p>
            </div>
          )}

          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              className="input-field"
              placeholder="you@example.com"
            />
          </div>

          <button type="submit" disabled={loading || !email} className="btn-primary">
            {loading ? (
              <span className="flex items-center justify-center gap-2"><Spinner /> Sending code...</span>
            ) : (
              "Send reset code"
            )}
          </button>
        </form>
      )}

      {/* Step: Enter OTP */}
      {view === "otp" && (
        <div className="space-y-5">
          <div>
            <h1 className="font-syne font-bold text-2xl text-text-primary">Check your email</h1>
            <p className="font-outfit text-sm text-text-muted mt-2 leading-relaxed">
              We sent a 6-digit code to <strong className="text-text-secondary">{email}</strong>. It expires in 10 minutes.
            </p>
          </div>

          <OtpInput
            length={6}
            onComplete={handleVerifyOtp}
            label="Reset code"
          />

          <button
            onClick={() => { setView("email"); setError(""); }}
            className="font-outfit text-sm text-text-muted text-center w-full"
          >
            Wrong email? Go back
          </button>
        </div>
      )}

      {/* Step: New password */}
      {view === "new_password" && (
        <form onSubmit={handleSetPassword} className="space-y-5">
          <div>
            <h1 className="font-syne font-bold text-2xl text-text-primary">New password</h1>
            <p className="font-outfit text-sm text-text-muted mt-2">
              Choose a strong password for your account.
            </p>
          </div>

          {error && (
            <div className="bg-down/10 border border-down/30 rounded-xl px-4 py-3">
              <p className="font-outfit text-sm text-down">{error}</p>
            </div>
          )}

          <div>
            <label className="block font-outfit text-xs text-text-secondary mb-1.5">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              className="input-field"
              placeholder="Min. 8 chars, uppercase, number"
            />
            {/* Password strength hints */}
            <div className="flex gap-3 mt-2">
              {[
                { ok: password.length >= 8, label: "8+ chars" },
                { ok: /[A-Z]/.test(password), label: "Uppercase" },
                { ok: /[0-9]/.test(password), label: "Number" },
              ].map(({ ok, label }) => (
                <span key={label} className={cn(
                  "font-outfit text-[10px] font-medium",
                  ok ? "text-up" : "text-text-muted"
                )}>
                  {ok ? "✓" : "○"} {label}
                </span>
              ))}
            </div>
          </div>

          <button type="submit" disabled={loading || !password} className="btn-primary">
            {loading ? (
              <span className="flex items-center justify-center gap-2"><Spinner /> Saving...</span>
            ) : (
              "Set new password"
            )}
          </button>
        </form>
      )}

      {/* Step: Done */}
      {view === "done" && (
        <div className="flex flex-col items-center text-center gap-5 pt-10">
          <div className="w-16 h-16 rounded-full bg-up/10 border border-up/30 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17L4 12" stroke="#00D4A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h2 className="font-syne font-bold text-xl text-text-primary">Password updated</h2>
            <p className="font-outfit text-sm text-text-muted mt-2">
              Your password has been changed. You can now log in with your new password.
            </p>
          </div>
          <button onClick={() => router.replace("/auth/login")} className="btn-primary w-full">
            Log in
          </button>
        </div>
      )}
    </div>
  );
}

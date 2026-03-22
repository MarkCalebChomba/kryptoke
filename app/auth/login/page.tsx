"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconKryptoKeLogo, IconEye, IconEyeOff } from "@/components/icons";
import { apiPost } from "@/lib/api/client";
import { setStoredToken } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { cn } from "@/lib/utils/cn";
import type { User } from "@/types";

interface LoginResponse {
  user: User;
  accessToken: string;
}

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);
  const toast = useToastActions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) next.email = "Enter a valid email";
    if (!password) next.password = "Password is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const data = await apiPost<LoginResponse>("/auth/login", { email, password });
      setStoredToken(data.accessToken);
      setUser(data.user, data.accessToken);
      toast.success("Welcome back");
      router.replace("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // Show clean messages — never expose backend error strings to users
      if (msg.includes("Invalid") || msg.includes("password") || msg.includes("credentials") || msg.includes("not found")) {
        setErrors({ general: "Email or password is incorrect." });
      } else if (msg.includes("locked") || msg.includes("disabled")) {
        setErrors({ general: "Account is temporarily locked. Please try again later." });
      } else {
        setErrors({ general: "Something went wrong. Please try again." });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      {/* Top area */}
      <div className="flex-1 flex flex-col justify-center px-6 pt-safe">
        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <IconKryptoKeLogo size={56} />
          <h1 className="font-syne font-bold text-2xl text-text-primary mt-4 tracking-tight">
            Welcome back
          </h1>
          <p className="text-text-muted font-outfit text-sm mt-1">
            Sign in to your KryptoKe account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* General error */}
          {errors.general && (
            <div className="bg-down/10 border border-down/30 rounded-xl px-4 py-3">
              <p className="text-down font-outfit text-sm">{errors.general}</p>
            </div>
          )}

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block font-outfit text-sm text-text-secondary mb-1.5"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => {
                if (email && !/\S+@\S+\.\S+/.test(email)) {
                  setErrors((p) => ({ ...p, email: "Enter a valid email" }));
                } else {
                  setErrors((p) => ({ ...p, email: undefined }));
                }
              }}
              className={cn(
                "input-field",
                errors.email && "border-down focus:border-down"
              )}
              placeholder="you@example.com"
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-down font-outfit text-xs mt-1">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="font-outfit text-sm text-text-secondary"
              >
                Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="font-outfit text-sm text-primary"
                tabIndex={-1}
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(
                  "input-field pr-12",
                  errors.password && "border-down focus:border-down"
                )}
                placeholder="Your password"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 tap-target text-text-muted hover:text-text-secondary transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-down font-outfit text-xs mt-1">{errors.password}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary mt-2"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <SpinnerIcon />
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Register link */}
        <p className="text-center font-outfit text-sm text-text-muted mt-6">
          No account yet?{" "}
          <Link href="/auth/register" className="text-primary font-medium">
            Create one
          </Link>
        </p>
      </div>

      {/* Footer */}
      <div className="px-6 pb-8 pb-safe text-center">
        <p className="font-outfit text-xs text-text-muted">
          KryptoKe v{process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0"} — Built for Kenya
        </p>
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="31.416"
        strokeDashoffset="23.562"
        strokeLinecap="round"
        opacity="0.3"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="31.416"
        strokeDashoffset="23.562"
        strokeLinecap="round"
        className="origin-center"
      />
    </svg>
  );
}

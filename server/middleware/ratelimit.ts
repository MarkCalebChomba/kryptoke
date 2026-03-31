import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis/client";
import type { Context, Next } from "hono";

/* ─── Limiters ──────────────────────────────────────────────────────────── */

// Auth endpoints — 5 attempts per 15 minutes per IP (tighter to prevent brute-force)
const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:auth",
});

// General API — 120 requests per minute per user
const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, "1 m"),
  prefix: "rl:api",
});

// Sensitive actions (withdraw, PIN entry) — 10 per 5 minutes per user
const sensitiveLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "5 m"),
  prefix: "rl:sensitive",
});

// OTP sends — 3 per 10 minutes per phone/email
const otpLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "10 m"),
  prefix: "rl:otp",
});

// PIN brute-force protection — 5 wrong attempts per 15 minutes, then locked
const pinLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:pin",
});

// Admin actions — 30 per minute
const adminLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "rl:admin",
});

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function getClientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}

function rateLimitResponse(c: Context, reset: number) {
  const retryAfter = Math.ceil((reset - Date.now()) / 1000);
  return c.json(
    { success: false, error: "Too many requests. Please try again later.", statusCode: 429 },
    429,
    { "Retry-After": String(retryAfter), "X-RateLimit-Reset": String(reset) }
  );
}

/* ─── Middleware Factories ──────────────────────────────────────────────── */

export function withAuthRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    // Rate limit by both IP and email (if provided in body) to prevent distributed attacks
    const ip = getClientIp(c);
    const { success, reset } = await authLimiter.limit(ip);
    if (!success) return rateLimitResponse(c, reset);
    await next();
  };
}

export function withApiRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get("user");
    const key = user?.uid ?? getClientIp(c);
    const { success, reset } = await apiLimiter.limit(key);
    if (!success) return rateLimitResponse(c, reset);
    await next();
  };
}

export function withSensitiveRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get("user");
    // Use both UID and IP to prevent distributed attacks on the same account
    const uid = user?.uid ?? getClientIp(c);
    const ip  = getClientIp(c);
    const [uidCheck, ipCheck] = await Promise.all([
      sensitiveLimiter.limit(uid),
      sensitiveLimiter.limit(`ip:${ip}`),
    ]);
    if (!uidCheck.success) return rateLimitResponse(c, uidCheck.reset);
    if (!ipCheck.success)  return rateLimitResponse(c, ipCheck.reset);
    await next();
  };
}

export function withOtpRateLimit(identifier: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const { success, reset } = await otpLimiter.limit(identifier);
    if (!success) return rateLimitResponse(c, reset);
    await next();
  };
}

export function withPinRateLimit(uid: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const { success, reset } = await pinLimiter.limit(`pin:${uid}`);
    if (!success) {
      return c.json({
        success: false,
        error: "Too many incorrect PIN attempts. Your account is temporarily locked for 15 minutes.",
        statusCode: 429,
      }, 429, { "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)) });
    }
    await next();
  };
}

export function withAdminRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get("user");
    const key = user?.uid ?? getClientIp(c);
    const { success, reset } = await adminLimiter.limit(key);
    if (!success) return rateLimitResponse(c, reset);
    await next();
  };
}

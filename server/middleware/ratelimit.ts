import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis/client";
import type { Context, Next } from "hono";

const IS_DEV = process.env.NODE_ENV !== "production";

/* ─── Ephemeral cache ────────────────────────────────────────────────────
 * Keeps a local Map of recent decisions.  For the same key within the same
 * sliding window, the decision is served from memory with zero Redis calls.
 * Only the first request per window (and any that would change the decision)
 * touch Upstash — cutting per-request latency from ~200ms to ~0ms in the
 * common case.
 * ──────────────────────────────────────────────────────────────────────── */
const ephemeralCache = new Map<string, { value: boolean; reset: number }>();

function makeRatelimit(requests: number, window: string, prefix: string) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
    prefix,
    ephemeralCache,
    analytics: false, // skip analytics writes — saves one Redis call per request
  });
}

/* ─── Limiters ───────────────────────────────────────────────────────────── */

const authLimiter      = makeRatelimit(5,   "15 m", "rl:auth");
const apiLimiter       = makeRatelimit(120, "1 m",  "rl:api");
const sensitiveLimiter = makeRatelimit(10,  "5 m",  "rl:sensitive");
const otpLimiter       = makeRatelimit(3,   "10 m", "rl:otp");
const pinLimiter       = makeRatelimit(5,   "15 m", "rl:pin");
const adminLimiter     = makeRatelimit(30,  "1 m",  "rl:admin");

/* ─── Helpers ────────────────────────────────────────────────────────────── */

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

/* ─── Middleware Factories ───────────────────────────────────────────────── */

export function withAuthRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    // Skip in dev — no need to hit Redis for local development
    if (IS_DEV) { await next(); return; }
    const ip = getClientIp(c);
    const { success, reset } = await authLimiter.limit(ip);
    if (!success) return rateLimitResponse(c, reset);
    await next();
  };
}

export function withApiRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (IS_DEV) { await next(); return; }
    const user = c.get("user");
    const key  = user?.uid ?? getClientIp(c);
    const { success, reset } = await apiLimiter.limit(key);
    if (!success) return rateLimitResponse(c, reset);
    await next();
  };
}

export function withSensitiveRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (IS_DEV) { await next(); return; }
    const user = c.get("user");
    const uid  = user?.uid ?? getClientIp(c);
    const ip   = getClientIp(c);
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
    if (IS_DEV) { await next(); return; }
    const { success, reset } = await otpLimiter.limit(identifier);
    if (!success) return rateLimitResponse(c, reset);
    await next();
  };
}

export function withPinRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (IS_DEV) { await next(); return; }
    const user = c.get("user");
    const key  = user?.uid ?? getClientIp(c);
    const { success, reset } = await pinLimiter.limit(key);
    if (!success) return rateLimitResponse(c, reset);
    await next();
  };
}

export function withAdminRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (IS_DEV) { await next(); return; }
    const user = c.get("user");
    const key  = user?.uid ?? getClientIp(c);
    const { success, reset } = await adminLimiter.limit(key);
    if (!success) return rateLimitResponse(c, reset);
    await next();
  };
}

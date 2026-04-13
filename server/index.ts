import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { timingMiddleware } from "./middleware/timing";
import {
  bodySizeLimit,
  injectionGuard,
  apiSecurityHeaders,
  safaricomIpGuard,
} from "./middleware/security";
import authRoutes from "./routes/auth";
import walletRoutes from "./routes/wallet";
import mpesaRoutes from "./routes/mpesa";
import withdrawRoutes from "./routes/withdraw";
import tradeRoutes from "./routes/trade";
import marketRoutes from "./routes/market";
import tokenRoutes from "./routes/tokens";
import notificationRoutes from "./routes/notifications";
import feedbackRoutes from "./routes/feedback";
import earnRoutes from "./routes/earn";
import analyticsRoutes from "./routes/analytics";
import futuresRoutes from "./routes/futures";
import adminRoutes from "./routes/admin/index";
import supportRoutes from "./routes/support";
import gamifyRoutes from "./routes/gamify";

const app = new Hono().basePath("/api/v1");

/* ─── CORS ──────────────────────────────────────────────────────────────── */
app.use("*", cors({
  origin: (origin) => {
    if (!origin) return null; // non-browser requests (cron, server-to-server)
    const allowed = [
      "https://kryptoke.com",
      "https://www.kryptoke.com",
      "https://kryptoke-mu.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
    ];
    // Allow any vercel preview deployment for this project
    if (origin.endsWith(".vercel.app") && origin.includes("kryptoke")) return origin;
    return allowed.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Sweep-Secret", "X-Cron-Secret"],
  maxAge: 86400,
  credentials: true,
}));

/* ─── Security headers ───────────────────────────────────────────────────── */
app.use("*", secureHeaders());
app.use("*", apiSecurityHeaders);

/* ─── Security guards ────────────────────────────────────────────────────── */
// NOTE: contentTypeGuard intentionally removed — it consumes the request body
// stream before Hono can parse it when running via hono/vercel + Next.js App Router.
app.use("*", bodySizeLimit);
app.use("*", injectionGuard);

/* ─── Timing ─────────────────────────────────────────────────────────────── */
app.use("*", timingMiddleware);

/* ─── Logger (dev only) ──────────────────────────────────────────────────── */
if (process.env.NODE_ENV !== "production") {
  // Lazy-require to avoid webpack "critical dependency" warning from hono/logger's dynamic color import
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { logger } = require("hono/logger") as { logger: typeof import("hono/logger").logger };
  app.use("*", logger());
}

/* ─── Maintenance mode ───────────────────────────────────────────────────── */
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const alwaysAllow = [
    "/api/v1/health",
    "/api/v1/mpesa/callback",
    "/api/v1/withdraw/b2c/result",
    "/api/v1/withdraw/b2c/timeout",
    "/api/v1/auth/login",
    "/api/v1/auth/register",
  ];
  if (alwaysAllow.some((p) => path.startsWith(p))) {
    await next();
    return;
  }
  const { getCached, CacheKeys } = await import("@/lib/redis/client");
  const config = await getCached<{ maintenanceMode?: boolean }>(CacheKeys.systemConfig());
  if (config?.maintenanceMode) {
    return c.json({
      success: false,
      error: "KryptoKe is currently undergoing maintenance. Please check back shortly.",
      statusCode: 503,
    }, 503);
  }
  await next();
});

/* ─── Health ─────────────────────────────────────────────────────────────── */
app.get("/health", (c) =>
  c.json({
    success: true,
    data: {
      status: "ok",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    },
  })
);

/* ─── Safaricom IP guard on callback routes only ─────────────────────────── */
app.use("/mpesa/callback", safaricomIpGuard);
app.use("/withdraw/b2c/*", safaricomIpGuard);

/* ─── Routes ─────────────────────────────────────────────────────────────── */
app.route("/auth", authRoutes);
app.route("/wallet", walletRoutes);
app.route("/mpesa", mpesaRoutes);
app.route("/withdraw", withdrawRoutes);
app.route("/trade", tradeRoutes);
app.route("/futures", futuresRoutes);
app.route("/market", marketRoutes);
app.route("/tokens", tokenRoutes);
app.route("/notifications", notificationRoutes);
app.route("/earn", earnRoutes);
app.route("/analytics", analyticsRoutes);
app.route("/support", supportRoutes);
app.route("/admin", adminRoutes);
app.route("/gamify", gamifyRoutes);
app.route("/", feedbackRoutes);

/* ─── 404 ────────────────────────────────────────────────────────────────── */
app.notFound((c) =>
  c.json({ success: false, error: "Route not found", statusCode: 404 }, 404)
);

/* ─── Global error handler ───────────────────────────────────────────────── */
app.onError((err, c) => {
  const path = new URL(c.req.url).pathname;
  console.error("[API Error]", {
    path,
    method: c.req.method,
    error: err.message,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });
  import("@sentry/nextjs")
    .then(({ captureException }) => captureException(err, { extra: { path } }))
    .catch(() => undefined);
  if (path.includes("/mpesa/callback") || path.includes("/b2c/")) {
    return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
  return c.json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "An internal error occurred" : err.message,
    statusCode: 500,
  }, 500);
});

export default app;
export type AppType = typeof app;

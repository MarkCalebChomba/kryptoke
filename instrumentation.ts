/**
 * Next.js 16 instrumentation — runs on server startup.
 * Built-in from Next.js 15+ (no experimental flag needed).
 * All Sentry init is wrapped in try/catch so a missing DSN or auth token
 * never fails the build or crashes the server.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { init } = await import("@sentry/nextjs");
      init({
        dsn:              process.env.SENTRY_DSN,
        tracesSampleRate: 0.1,
        debug:            false,
        environment:      process.env.NEXT_PUBLIC_APP_ENV ?? "production",
        beforeSend(event) {
          const text = JSON.stringify(event);
          if (
            text.includes("HOT_WALLET_KEY") ||
            text.includes("MASTER_SEED")    ||
            text.includes("privateKey")     ||
            text.includes("mnemonic")
          ) {
            return null;
          }
          return event;
        },
      });
    } catch {
      // Sentry unavailable — continue without error tracking
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    try {
      const { init } = await import("@sentry/nextjs");
      init({
        dsn:              process.env.SENTRY_DSN,
        tracesSampleRate: 0.1,
        debug:            false,
      });
    } catch {
      // Sentry unavailable — continue
    }
  }
}

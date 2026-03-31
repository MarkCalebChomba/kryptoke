/**
 * Next.js 16 instrumentation — runs on server startup.
 * instrumentation.ts is built-in from Next.js 15+ — no experimental flag needed.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@sentry/nextjs");
    init({
      dsn:              process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      debug:            false,
      environment:      process.env.NEXT_PUBLIC_APP_ENV ?? "development",
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
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const { init } = await import("@sentry/nextjs");
    init({
      dsn:              process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      debug:            false,
    });
  }
}
